"""Authenticated offer, deal, and deal-message vertical slice."""
from __future__ import annotations
import re
import uuid
from urllib.parse import urlsplit
from oracle_domain_read import ApiError, AuthResolver, sql_text, valid_uuid
from oracle_marketplace_write import PgWriteRunner


def clean_message(value, maximum=2000):
    if value is None: return None
    if not isinstance(value,str) or len(value.strip())>maximum: raise ApiError(400,'invalid_message')
    return value.strip() or None


def uuid_path(value):
    return "'%s'::uuid" % valid_uuid(value)


def optional_note(body, maximum=1000):
    if set(body)-{'note'}: raise ApiError(400,'invalid_note')
    note=clean_message(body.get('note'),maximum)
    return sql_text(note) if note is not None else 'NULL'


def require_actor(body, user_id):
    if valid_uuid(body.get('userId')) != user_id: raise ApiError(403,'actor_mismatch')


def voice_input(body, deal_id, user_id):
    expected={'dealId','senderId','body','audioStoragePath','audioDurationMs','audioMimeType','audioSizeBytes','messageType'}
    if set(body)!=expected or body.get('messageType')!='voice': raise ApiError(400,'invalid_voice_message')
    if valid_uuid(body.get('dealId'))!=deal_id: raise ApiError(400,'deal_mismatch')
    if valid_uuid(body.get('senderId'))!=user_id: raise ApiError(403,'sender_mismatch')
    message=clean_message(body.get('body'))
    path=body.get('audioStoragePath')
    expected_prefix='deals/%s/%s/' % (deal_id,user_id)
    if not isinstance(path,str) or not path.startswith(expected_prefix) or len(path)>1024 or '/' in path[len(expected_prefix):]:
        raise ApiError(400,'invalid_voice_path')
    duration=body.get('audioDurationMs')
    if not isinstance(duration,int) or isinstance(duration,bool) or not 500<=duration<=120000:
        raise ApiError(400,'invalid_voice_duration')
    mime=body.get('audioMimeType')
    if mime not in ('audio/m4a','audio/mp4','audio/aac','audio/mpeg','audio/wav','audio/webm','audio/ogg'):
        raise ApiError(400,'invalid_voice_mime')
    size=body.get('audioSizeBytes')
    if size is not None and (not isinstance(size,int) or isinstance(size,bool) or not 1<=size<=15728640):
        raise ApiError(400,'invalid_voice_size')
    return message or 'رسالة صوتية',path,duration,mime,size


def run_void(db, user_id, function, *args):
    # Include the function result in the JSON expression so the volatile RPC
    # cannot be pruned as an unused subquery projection.
    statement="SELECT json_build_object('ok',true,'result',public.%s(%s))" % (function,','.join(args))
    result=db.query(user_id,statement)
    if not isinstance(result,dict) or result.get('ok') is not True:
        raise ApiError(503,'domain_write_failed')
    return 200,{'ok':True}


class ExchangeApi:
    def __init__(self,auth=None,db=None): self.auth=auth or AuthResolver(); self.db=db or PgWriteRunner()
    def handle(self,method,target,authorization,body):
        parsed=urlsplit(target)
        if parsed.query or parsed.fragment or parsed.netloc or parsed.scheme: raise ApiError(400,'invalid_path')
        if method!='POST' or not isinstance(body,dict): raise ApiError(404,'not_found')
        user_id=self.auth.resolve(authorization)
        if parsed.path=='/v1/offers':
            if set(body)!={'requestedItemId','offeredItemId','senderId','receiverId','message'}: raise ApiError(400,'invalid_offer')
            requested,offered,sender,receiver=map(valid_uuid,(body['requestedItemId'],body['offeredItemId'],body['senderId'],body['receiverId']))
            if sender!=user_id: raise ApiError(403,'sender_mismatch')
            if sender==receiver or requested==offered: raise ApiError(400,'invalid_offer')
            message=clean_message(body['message'],1000)
            offer_id=str(uuid.uuid4())
            # Keep both writes in one PgWriteRunner transaction, but in separate
            # statements. The offer-events RLS policy must see the committed
            # statement snapshot containing the new offer.
            statement="""INSERT INTO public.offers(id,requested_item_id,offered_item_id,sender_id,receiver_id,status,message)
              VALUES('%s'::uuid,'%s'::uuid,'%s'::uuid,'%s'::uuid,'%s'::uuid,'pending',%s);
              INSERT INTO public.offer_events(offer_id,actor_id,event_type,old_status,new_status,note)
              VALUES('%s'::uuid,'%s'::uuid,'created',NULL,'pending',NULL);
              SELECT json_build_object('offerId','%s'::uuid,'eventRecorded',EXISTS(
                SELECT 1 FROM public.offer_events WHERE offer_id='%s'::uuid AND actor_id='%s'::uuid
                  AND event_type::text='created'))""" % (
                offer_id,requested,offered,sender,receiver,sql_text(message) if message else 'NULL',
                offer_id,sender,offer_id,offer_id,sender)
            result=self.db.query(user_id,statement)
            if not result.get('offerId') or result.get('eventRecorded') is not True: raise ApiError(503,'offer_create_failed')
            return 201,result
        match=re.fullmatch(r'/v1/offers/([0-9a-fA-F-]{36})/(thinking|soft-reject)',parsed.path)
        if match:
            offer_id=uuid_path(match.group(1)); note=optional_note(body)
            function='mark_offer_thinking' if match.group(2)=='thinking' else 'soft_reject_offer'
            return run_void(self.db,user_id,function,offer_id,note)
        match=re.fullmatch(r'/v1/offers/([0-9a-fA-F-]{36})/accept',parsed.path)
        if match:
            if body: raise ApiError(400,'invalid_accept')
            offer_id=valid_uuid(match.group(1))
            result=self.db.query(user_id,"SELECT json_build_object('dealId',public.accept_offer('%s'::uuid))" % offer_id)
            if not result.get('dealId'): raise ApiError(503,'offer_accept_failed')
            return 200,result
        match=re.fullmatch(r'/v1/deals/([0-9a-fA-F-]{36})/read',parsed.path)
        if match:
            if body: raise ApiError(400,'invalid_read')
            return run_void(self.db,user_id,'mark_deal_thread_read',uuid_path(match.group(1)))
        match=re.fullmatch(r'/v1/deals/([0-9a-fA-F-]{36})/confirmations',parsed.path)
        if match:
            if set(body)-{'userId','note'}: raise ApiError(400,'invalid_confirmation')
            require_actor(body,user_id)
            note=clean_message(body.get('note'),1000)
            statement="""WITH inserted AS (
              INSERT INTO public.deal_confirmations(deal_id,user_id,note)
              VALUES(%s,%s,%s) ON CONFLICT DO NOTHING RETURNING 1)
              SELECT json_build_object('ok',true,'inserted',count(*)) FROM inserted""" % (
                uuid_path(match.group(1)),uuid_path(user_id),sql_text(note) if note is not None else 'NULL')
            result=self.db.query(user_id,statement)
            if not isinstance(result,dict) or result.get('ok') is not True: raise ApiError(503,'deal_confirm_failed')
            return 200,{'ok':True}
        match=re.fullmatch(r'/v1/deals/([0-9a-fA-F-]{36})/complete',parsed.path)
        if match:
            if body: raise ApiError(400,'invalid_complete')
            result=self.db.query(user_id,"SELECT json_build_object('completed',public.complete_deal_if_ready(%s))" % uuid_path(match.group(1)))
            if not isinstance(result,dict) or not isinstance(result.get('completed'),bool): raise ApiError(503,'deal_complete_failed')
            return 200,result
        match=re.fullmatch(r'/v1/deals/([0-9a-fA-F-]{36})/messages',parsed.path)
        if match:
            deal_id=valid_uuid(match.group(1))
            if body.get('messageType')=='voice':
                message,path,duration,mime,size=voice_input(body,deal_id,user_id)
                values="'%s'::uuid,'%s'::uuid,%s,'voice',%s,%d,%s,%s" % (
                    deal_id,user_id,sql_text(message),sql_text(path),duration,sql_text(mime),str(size) if size is not None else 'NULL')
            else:
                if set(body)!={'senderId','body'} or valid_uuid(body['senderId'])!=user_id: raise ApiError(403,'sender_mismatch')
                message=clean_message(body['body'])
                if not message: raise ApiError(400,'invalid_message')
                values="'%s'::uuid,'%s'::uuid,%s,'text',NULL,NULL,NULL,NULL" % (deal_id,user_id,sql_text(message))
            statement="""WITH x AS (INSERT INTO public.deal_messages(deal_id,sender_id,body,message_type,
              audio_storage_path,audio_duration_ms,audio_mime_type,audio_size_bytes)
              VALUES(%s) RETURNING id,deal_id AS \"dealId\",sender_id AS \"senderId\",
              body,message_type AS \"messageType\",audio_storage_path AS \"audioStoragePath\",
              audio_duration_ms AS \"audioDurationMs\",audio_mime_type AS \"audioMimeType\",
              audio_size_bytes AS \"audioSizeBytes\",created_at AS \"createdAt\") SELECT row_to_json(x) FROM x""" % values
            return 201,self.db.query(user_id,statement)
        raise ApiError(404,'not_found')
