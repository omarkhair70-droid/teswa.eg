"""Authenticated offer, deal, and deal-message vertical slice."""
from __future__ import annotations
import re
from urllib.parse import urlsplit
from oracle_domain_read import ApiError, AuthResolver, sql_text, valid_uuid
from oracle_marketplace_write import PgWriteRunner


def clean_message(value, maximum=2000):
    if value is None: return None
    if not isinstance(value,str) or len(value.strip())>maximum: raise ApiError(400,'invalid_message')
    return value.strip() or None


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
            statement="""WITH inserted AS (
              INSERT INTO public.offers(requested_item_id,offered_item_id,sender_id,receiver_id,status,message)
              VALUES('%s'::uuid,'%s'::uuid,'%s'::uuid,'%s'::uuid,'pending',%s) RETURNING id,sender_id),
              event AS (INSERT INTO public.offer_events(offer_id,actor_id,event_type,old_status,new_status,note)
                SELECT id,sender_id,'created',NULL,'pending',NULL FROM inserted RETURNING offer_id)
              SELECT json_build_object('offerId',(SELECT id FROM inserted),'eventRecorded',EXISTS(SELECT 1 FROM event))""" % (
                requested,offered,sender,receiver,sql_text(message) if message else 'NULL')
            result=self.db.query(user_id,statement)
            if not result.get('offerId') or result.get('eventRecorded') is not True: raise ApiError(503,'offer_create_failed')
            return 201,result
        match=re.fullmatch(r'/v1/offers/([0-9a-fA-F-]{36})/accept',parsed.path)
        if match:
            if body: raise ApiError(400,'invalid_accept')
            offer_id=valid_uuid(match.group(1))
            result=self.db.query(user_id,"SELECT json_build_object('dealId',public.accept_offer('%s'::uuid))" % offer_id)
            if not result.get('dealId'): raise ApiError(503,'offer_accept_failed')
            return 200,result
        match=re.fullmatch(r'/v1/deals/([0-9a-fA-F-]{36})/messages',parsed.path)
        if match:
            if set(body)!={'senderId','body'} or valid_uuid(body['senderId'])!=user_id: raise ApiError(403,'sender_mismatch')
            deal_id=valid_uuid(match.group(1)); message=clean_message(body['body'])
            if not message: raise ApiError(400,'invalid_message')
            statement="""WITH x AS (INSERT INTO public.deal_messages(deal_id,sender_id,body,message_type)
              VALUES('%s'::uuid,'%s'::uuid,%s,'text') RETURNING id,deal_id AS \"dealId\",sender_id AS \"senderId\",
              body,message_type AS \"messageType\",audio_storage_path AS \"audioStoragePath\",
              audio_duration_ms AS \"audioDurationMs\",audio_mime_type AS \"audioMimeType\",
              audio_size_bytes AS \"audioSizeBytes\",created_at AS \"createdAt\") SELECT row_to_json(x) FROM x""" % (deal_id,user_id,sql_text(message))
            return 201,self.db.query(user_id,statement)
        raise ApiError(404,'not_found')
