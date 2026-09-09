"""Authenticated Oracle notifications and preferences backed by existing RPCs."""
from __future__ import annotations

from urllib.parse import parse_qs, urlsplit

from oracle_domain_read import ApiError, AuthResolver, PgReadRunner, integer, sql_text, valid_uuid
from oracle_marketplace_write import PgWriteRunner


def optional_uuid(value):
    return "'%s'::uuid" % valid_uuid(value) if value is not None else 'NULL'


def optional_text(value, maximum):
    if value is None: return 'NULL'
    if not isinstance(value,str) or len(value.strip()) > maximum: raise ApiError(400,'invalid_input')
    return sql_text(value.strip())


PREFERENCES_JSON = """json_build_object('offersEnabled',x.offers_enabled,'dealsEnabled',x.deals_enabled,
  'messagesEnabled',x.messages_enabled,'socialEnabled',x.social_enabled,
  'smartRemindersEnabled',x.smart_reminders_enabled,'marketingEnabled',x.marketing_enabled,
  'quietHoursEnabled',x.quiet_hours_enabled,'quietHoursStart',x.quiet_hours_start,
  'quietHoursEnd',x.quiet_hours_end,'updatedAt',x.updated_at)"""

# The database RPC is intentionally a void, domain-state-validated operation.
# These are its client-authorized event types, not an arbitrary notification API.
DISPATCH_TYPES = frozenset({
    'offer_received', 'offer_thinking', 'offer_soft_rejected', 'offer_accepted',
    'deal_created', 'deal_message_received', 'deal_voice_message_received',
    'deal_completed', 'deal_completion_confirmation_needed',
})


class NotificationsApi:
    def __init__(self,auth=None,reads=None,writes=None):
        self.auth=auth or AuthResolver(); self.reads=reads or PgReadRunner(); self.writes=writes or PgWriteRunner()

    def handle(self,method,target,authorization,body=None):
        parsed=urlsplit(target)
        if parsed.fragment or parsed.netloc or parsed.scheme: raise ApiError(400,'invalid_path')
        user_id=self.auth.resolve(authorization)
        if method=='GET' and parsed.path=='/v1/notifications':
            args=parse_qs(parsed.query,keep_blank_values=True)
            if any(len(v)!=1 for v in args.values()) or set(args)-{'limit'}: raise ApiError(400,'invalid_query')
            limit=integer(args.get('limit',[None])[0],50,100)
            sql="""SELECT coalesce(json_agg(json_build_object('id',n.id,'type',n.type,'title',n.title,
              'body',n.body,'route',n.route,'actorUserId',n.actor_user_id,'itemId',n.item_id,
              'offerId',n.offer_id,'dealId',n.deal_id,'conversationId',n.contextual_conversation_id,
              'readAt',n.read_at,'createdAt',n.created_at) ORDER BY n.created_at DESC),'[]'::json)
              FROM (SELECT * FROM public.notifications WHERE user_id='%s'::uuid ORDER BY created_at DESC LIMIT %d) n""" % (user_id,limit)
            return 200,{'items':self.reads.query(user_id,sql)}
        if method=='GET' and parsed.path=='/v1/notifications/unread' and not parsed.query:
            count=self.reads.query(user_id,"SELECT to_json(count(*)) FROM public.notifications WHERE user_id='%s'::uuid AND read_at IS NULL" % user_id)
            return 200,{'count':int(count)}
        if method=='GET' and parsed.path=='/v1/notifications/preferences' and not parsed.query:
            row=self.reads.query(user_id,"SELECT %s FROM public.get_my_notification_preferences() x" % PREFERENCES_JSON)
            if row is None: raise ApiError(503,'preferences_unavailable')
            return 200,row
        if method!='POST' or parsed.query or not isinstance(body,dict): raise ApiError(404,'not_found')

        if parsed.path=='/v1/notifications/read':
            if set(body)!={'userId','notificationId'} or valid_uuid(body['userId'])!=user_id: raise ApiError(403,'actor_mismatch')
            notification=valid_uuid(body['notificationId'])
            sql="""WITH x AS (UPDATE public.notifications SET read_at=coalesce(read_at,now())
              WHERE id='%s'::uuid AND user_id='%s'::uuid RETURNING 1)
              SELECT json_build_object('ok',true,'found',EXISTS(SELECT 1 FROM x))""" % (notification,user_id)
            result=self.writes.query(user_id,sql)
            if result.get('found') is not True: raise ApiError(404,'not_found')
            return 200,{'ok':True}
        if parsed.path=='/v1/notifications/read-all':
            if set(body)!={'userId'} or valid_uuid(body['userId'])!=user_id: raise ApiError(403,'actor_mismatch')
            sql="""WITH x AS (UPDATE public.notifications SET read_at=now()
              WHERE user_id='%s'::uuid AND read_at IS NULL RETURNING 1)
              SELECT json_build_object('ok',true,'updated',(SELECT count(*) FROM x))""" % user_id
            self.writes.query(user_id,sql); return 200,{'ok':True}
        if parsed.path=='/v1/notifications/preferences':
            allowed={'offersEnabled','dealsEnabled','messagesEnabled','socialEnabled','smartRemindersEnabled','marketingEnabled','quietHoursEnabled','quietHoursStart','quietHoursEnd'}
            if set(body)-allowed: raise ApiError(400,'invalid_preferences')
            def boolean(name):
                value=body.get(name)
                if value is not None and not isinstance(value,bool): raise ApiError(400,'invalid_preferences')
                return 'NULL' if value is None else ('true' if value else 'false')
            def clock(name):
                value=body.get(name)
                if value is not None and (not isinstance(value,str) or len(value)!=5 or value[2]!=':' or not value.replace(':','').isdigit()): raise ApiError(400,'invalid_preferences')
                return 'NULL' if value is None else sql_text(value)
            args=[boolean(x) for x in ('offersEnabled','dealsEnabled','messagesEnabled','socialEnabled','smartRemindersEnabled','marketingEnabled','quietHoursEnabled')]
            args += [clock('quietHoursStart'),clock('quietHoursEnd')]
            row=self.writes.query(user_id,"SELECT %s FROM public.update_my_notification_preferences(%s) x" % (PREFERENCES_JSON,','.join(args)))
            return 200,row
        if parsed.path=='/v1/notifications/timezone':
            if set(body)!={'timezone'}: raise ApiError(400,'invalid_timezone')
            timezone=body.get('timezone')
            if not isinstance(timezone,str) or not timezone.strip() or len(timezone)>64: raise ApiError(400,'invalid_timezone')
            self.writes.query(user_id,"SELECT json_build_object('ok',true,'result',public.set_my_notification_timezone(%s))" % sql_text(timezone.strip()))
            return 200,{'ok':True}
        if parsed.path in ('/v1/notifications/push/register','/v1/notifications/push/disable'):
            expected={'userId','expoPushToken'} | ({'platform'} if parsed.path.endswith('register') else set())
            if set(body)!=expected or valid_uuid(body['userId'])!=user_id: raise ApiError(403,'actor_mismatch')
            token=body.get('expoPushToken')
            if not isinstance(token,str) or not token.strip() or len(token)>512: raise ApiError(400,'invalid_token')
            if parsed.path.endswith('register'):
                platform=body.get('platform')
                if platform not in ('android','ios'): raise ApiError(400,'invalid_platform')
                sql="SELECT json_build_object('ok',public.register_push_device(%s,%s) IS NOT NULL)" % (sql_text(token.strip()),sql_text(platform))
            else:
                sql="SELECT json_build_object('ok',public.disable_my_push_device(%s))" % sql_text(token.strip())
            result=self.writes.query(user_id,sql)
            if result.get('ok') is not True: raise ApiError(409,'push_update_failed')
            return 200,{'ok':True}
        if parsed.path=='/v1/notifications/dispatch':
            expected={'targetUserId','type','title','body','itemId','offerId','dealId','messageId'}
            if set(body)!=expected: raise ApiError(400,'invalid_notification')
            target_user=valid_uuid(body['targetUserId'])
            if not isinstance(body.get('type'),str) or body['type'] not in DISPATCH_TYPES:
                raise ApiError(400,'unsupported_notification_type')
            kind=optional_text(body['type'],80); title=optional_text(body['title'],160)
            if kind=='NULL' or title=='NULL': raise ApiError(400,'invalid_notification')
            values=["'%s'::uuid"%target_user,kind,title,optional_text(body['body'],1000),optional_uuid(body['itemId']),optional_uuid(body['offerId']),optional_uuid(body['dealId']),optional_uuid(body['messageId'])]
            # The existing RPC returns void and may reject an invalid domain state
            # without throwing. A successful call is acceptance, not proof of an
            # inserted notification. Do not fabricate a created/ok acknowledgment.
            self.writes.query(user_id,"SELECT json_build_object('accepted',true,'result',public.create_notification(%s))" % ','.join(values))
            return 200,{'accepted':True}
        raise ApiError(404,'not_found')
