"""Authenticated Oracle policy acceptance and analytics APIs."""
from __future__ import annotations

import json
from urllib.parse import parse_qs, urlsplit

from oracle_domain_read import ApiError, AuthResolver, sql_text, valid_uuid
from oracle_marketplace_write import PgWriteRunner, json_expr

POLICY_KEYS = ('terms_of_use', 'community_guidelines')


def exact(value, keys, code):
    if not isinstance(value, dict) or set(value) != set(keys): raise ApiError(400, code)
    return value


def actor(value, user_id):
    if valid_uuid(value) != user_id: raise ApiError(403, 'actor_mismatch')


def text(value, maximum, code, nullable=False):
    if value is None and nullable: return None
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum: raise ApiError(400, code)
    return value.strip()


class PoliciesAnalyticsApi:
    def __init__(self, auth=None, db=None): self.auth=auth or AuthResolver(); self.db=db or PgWriteRunner()

    def handle(self, method, target, authorization, body=None):
        parsed=urlsplit(target)
        if parsed.fragment or parsed.netloc or parsed.scheme: raise ApiError(400,'invalid_path')
        user_id=self.auth.resolve(authorization)

        if method=='GET' and parsed.path=='/v1/policies/acceptances':
            query=parse_qs(parsed.query,keep_blank_values=True)
            if set(query)!={'userId','keys'} or any(len(v)!=1 for v in query.values()): raise ApiError(400,'invalid_query')
            actor(query['userId'][0],user_id)
            keys=[]
            for key in query['keys'][0].split(','):
                if key not in POLICY_KEYS: raise ApiError(400,'invalid_policy')
                if key not in keys: keys.append(key)
            if not keys or len(keys)>len(POLICY_KEYS): raise ApiError(400,'invalid_policy')
            values=','.join(sql_text(key) for key in keys)
            statement="""SELECT coalesce(json_agg(json_build_object('userId',a.user_id,'policyKey',a.policy_key,
              'policyVersion',a.policy_version,'acceptedAt',a.accepted_at) ORDER BY a.accepted_at,a.id),'[]'::json)
              FROM public.user_policy_acceptances a WHERE a.user_id='%s'::uuid AND a.policy_key IN(%s)"""%(user_id,values)
            result=self.db.query(user_id,statement); return 200,{'items':result if isinstance(result,list) else []}

        if method=='POST' and parsed.path=='/v1/policies/acceptances':
            value=exact(body,('userId','policies'),'invalid_policies'); actor(value['userId'],user_id)
            if not isinstance(value['policies'],list) or not 1<=len(value['policies'])<=len(POLICY_KEYS): raise ApiError(400,'invalid_policies')
            policies=[]
            for entry in value['policies']:
                entry=exact(entry,('policyKey','policyVersion'),'invalid_policy')
                key=entry['policyKey']; version=text(entry['policyVersion'],64,'invalid_policy')
                if key not in POLICY_KEYS or (key,version) in policies: raise ApiError(400,'invalid_policy')
                policies.append((key,version))
            rows=','.join("('%s'::uuid,%s,%s)"%(user_id,sql_text(key),sql_text(version)) for key,version in policies)
            statement="""WITH x AS (INSERT INTO public.user_policy_acceptances(user_id,policy_key,policy_version) VALUES %s
              ON CONFLICT(user_id,policy_key,policy_version) DO NOTHING RETURNING 1) SELECT json_build_object('ok',true)"""%rows
            result=self.db.query(user_id,statement); return 200,{'ok':bool(result and result.get('ok'))}

        if method=='POST' and parsed.path=='/v1/analytics/events':
            value=exact(body,('eventName','context'),'invalid_analytics_event')
            event=text(value['eventName'],64,'invalid_analytics_event'); context=exact(value['context'],('sessionId','route','entityType','entityId','metadata','appVersion','platform'),'invalid_analytics_event')
            session=text(context['sessionId'],128,'invalid_analytics_event')
            route=text(context['route'],160,'invalid_analytics_event',True); entity_type=text(context['entityType'],64,'invalid_analytics_event',True)
            entity_id=valid_uuid(context['entityId']) if context['entityId'] is not None else None
            app_version=text(context['appVersion'],64,'invalid_analytics_event',True); platform=text(context['platform'],24,'invalid_analytics_event')
            if not isinstance(context['metadata'],dict) or len(json.dumps(context['metadata'],separators=(',',':'),ensure_ascii=False).encode())>8192: raise ApiError(400,'invalid_analytics_event')
            statement="SELECT public.track_analytics_event(%s,%s,%s,%s,%s,%s,%s,%s)"%(
                sql_text(event),sql_text(session),sql_text(route) if route else 'NULL',sql_text(entity_type) if entity_type else 'NULL',
                "'%s'::uuid"%entity_id if entity_id else 'NULL',json_expr(context['metadata']),sql_text(app_version) if app_version else 'NULL',sql_text(platform))
            result=self.db.query(user_id,statement)
            if not isinstance(result,dict) or not isinstance(result.get('ok'),bool): raise ApiError(503,'analytics_write_failed')
            return 200,{'accepted':result['ok'],'reason':result.get('reason') if isinstance(result.get('reason'),str) else None}

        raise ApiError(404,'not_found')
