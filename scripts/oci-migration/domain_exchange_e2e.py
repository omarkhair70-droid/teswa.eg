#!/usr/bin/env python3
"""Disposable two-user Oracle exchange journey run on the rehearsal host."""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid


PSQL = '/usr/pgsql-17/bin/psql'
PASSWORD = 'Teswa-Exchange-E2E-2026'


def request(method, url, body=None, token=None, expected=(200, 201)):
    raw = None if body is None else json.dumps(body, separators=(',', ':')).encode()
    headers = {'Accept': 'application/json'}
    if raw is not None:
        headers['Content-Type'] = 'application/json'
    if token:
        headers['Authorization'] = 'Bearer ' + token
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=raw, headers=headers, method=method), timeout=20) as response:
            status, payload = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, payload = error.code, error.read()
    if status not in expected:
        raise RuntimeError('unexpected_http_%s_%s' % (status, url.rsplit('/', 1)[-1]))
    return json.loads(payload or b'{}')


def put(url, payload, content_type):
    headers = {'Content-Type': content_type, 'If-None-Match': '*'}
    with urllib.request.urlopen(urllib.request.Request(url, data=payload, headers=headers, method='PUT'), timeout=30) as response:
        if response.status not in (200, 201):
            raise RuntimeError('object_put_failed')


def psql(database, sql, check=True):
    run = subprocess.run(['sudo', '-u', 'postgres', PSQL, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database, '-c', sql],
                         text=True, capture_output=True, timeout=20)
    if check and run.returncode:
        raise RuntimeError('fixture_database_failed')
    return run.stdout.strip()


def main():
    if len(sys.argv) != 6:
        raise SystemExit('usage: domain_exchange_e2e.py BIND DB RECEIVER_ID RECEIVER_TOKEN RECEIVER_ITEM_ID')
    bind, database, receiver_id, receiver_token, receiver_item_id = sys.argv[1:]
    uuid.UUID(receiver_id); uuid.UUID(receiver_item_id)
    api = 'http://%s:3100' % bind
    auth = 'http://127.0.0.1:3110'
    sender_id = sender_item_id = offer_id = deal_id = None
    voice_key = None
    sender_token = None
    try:
        email = 'exchange-e2e-%s@teswa.invalid' % int(time.time() * 1000)
        signup = request('POST', auth + '/v1/auth/sign-up', {'email': email, 'password': PASSWORD})
        sender_id = signup['user']['id']; uuid.UUID(sender_id)
        token_sha = psql(database, "SELECT token_sha256 FROM teswa_auth.email_confirmation_tokens WHERE user_id='%s'::uuid AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1" % sender_id)
        if len(token_sha) != 64:
            raise RuntimeError('confirmation_token_missing')
        if psql(database, "SELECT teswa_auth.consume_email_confirmation('%s')" % token_sha) != sender_id:
            raise RuntimeError('confirmation_failed')
        sender_token = request('POST', auth + '/v1/auth/sign-in/password', {'email': email, 'password': PASSWORD})['access_token']

        sender_item_id = str(uuid.uuid4())
        category_id = psql(database, 'SELECT id FROM public.categories WHERE is_active IS TRUE ORDER BY sort_order NULLS LAST,id LIMIT 1')
        uuid.UUID(category_id)
        psql(database, "INSERT INTO public.items(id,owner_id,title,category_id,condition,desire_mode,status,source) VALUES('%s'::uuid,'%s'::uuid,'Oracle exchange fixture','%s'::uuid,'good_used','flexible','active','direct_listing')" % (sender_item_id, sender_id, category_id))

        created = request('POST', api + '/v1/offers', {
            'requestedItemId': receiver_item_id, 'offeredItemId': sender_item_id,
            'senderId': sender_id, 'receiverId': receiver_id, 'message': 'Oracle E2E offer',
        }, sender_token)
        offer_id = created['offerId']; uuid.UUID(offer_id)
        accepted = request('POST', api + '/v1/offers/' + offer_id + '/accept', {}, receiver_token)
        deal_id = accepted['dealId']; uuid.UUID(deal_id)

        text_message = request('POST', api + '/v1/deals/' + deal_id + '/messages', {
            'senderId': sender_id, 'body': 'Oracle E2E text',
        }, sender_token)
        if text_message.get('messageType') != 'text':
            raise RuntimeError('text_message_shape_failed')

        voice = b'teswa-oracle-deal-voice-proof'
        voice_key = 'deals/%s/%s/%s-voice.m4a' % (deal_id, sender_id, int(time.time() * 1000))
        media = {'purpose': 'deal_voice', 'objectKey': voice_key, 'contentType': 'audio/m4a', 'sizeBytes': len(voice)}
        grant = request('POST', api + '/v1/media/uploads', media, sender_token)
        put(grant['uploadUrl'], voice, 'audio/m4a')
        request('POST', api + '/v1/media/uploads/complete', media, sender_token)
        voice_message = request('POST', api + '/v1/deals/' + deal_id + '/messages', {
            'dealId': deal_id, 'senderId': sender_id, 'body': 'رسالة صوتية', 'messageType': 'voice',
            'audioStoragePath': voice_key, 'audioDurationMs': 1000,
            'audioMimeType': 'audio/m4a', 'audioSizeBytes': len(voice),
        }, sender_token)
        if voice_message.get('messageType') != 'voice' or voice_message.get('audioStoragePath') != voice_key:
            raise RuntimeError('voice_message_shape_failed')
        signed = request('POST', api + '/v1/media/signed-url', {
            'purpose': 'deal_voice', 'objectKey': voice_key, 'contentType': None,
            'sizeBytes': None, 'expiresInSeconds': 60,
        }, receiver_token)
        with urllib.request.urlopen(signed['signedUrl'], timeout=20) as response:
            if response.read() != voice:
                raise RuntimeError('voice_playback_bytes_mismatch')
        print('domain_exchange_offer_deal_text=PASS')
        print('domain_exchange_voice_storage_insert_playback=PASS')
    finally:
        if sender_token and voice_key:
            try:
                request('DELETE', api + '/v1/media/objects', {'objects': [{
                    'purpose': 'deal_voice', 'objectKey': voice_key, 'contentType': 'audio/m4a', 'sizeBytes': None,
                }]}, sender_token)
            except Exception:
                pass
        statements = []
        if deal_id:
            statements += ["DELETE FROM public.deal_message_reads WHERE deal_id='%s'::uuid" % deal_id,
                           "DELETE FROM public.deal_confirmations WHERE deal_id='%s'::uuid" % deal_id,
                           "DELETE FROM public.deal_messages WHERE deal_id='%s'::uuid" % deal_id,
                           "DELETE FROM public.swap_deals WHERE id='%s'::uuid" % deal_id]
        if offer_id:
            statements += ["DELETE FROM public.offer_events WHERE offer_id='%s'::uuid" % offer_id,
                           "DELETE FROM public.offers WHERE id='%s'::uuid" % offer_id]
        if sender_item_id:
            statements += ["DELETE FROM public.item_images WHERE item_id='%s'::uuid" % sender_item_id,
                           "DELETE FROM public.items WHERE id='%s'::uuid" % sender_item_id]
        if sender_id:
            statements += ["DELETE FROM teswa_auth.sessions WHERE user_id='%s'::uuid" % sender_id,
                           "DELETE FROM teswa_auth.email_confirmation_tokens WHERE user_id='%s'::uuid" % sender_id,
                           "DELETE FROM teswa_auth.email_accounts WHERE user_id='%s'::uuid" % sender_id,
                           "DELETE FROM public.profiles WHERE id='%s'::uuid" % sender_id,
                           "DELETE FROM teswa_identity.external_identities WHERE user_id='%s'::uuid" % sender_id,
                           "DELETE FROM teswa_identity.users WHERE id='%s'::uuid" % sender_id]
        if statements:
            psql(database, 'BEGIN;' + ';'.join(statements) + ';COMMIT;', check=False)


if __name__ == '__main__':
    main()
