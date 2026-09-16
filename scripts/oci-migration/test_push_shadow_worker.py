"""Unit tests for Expo/FCM provider routing in the Teswa push worker."""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock


WORKER_PATH = Path(__file__).with_name("push-shadow-worker.py")
SPEC = importlib.util.spec_from_file_location("teswa_push_shadow_worker", WORKER_PATH)
worker = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = worker
SPEC.loader.exec_module(worker)


def notification_row() -> dict:
    return {
        "id": "11111111-1111-1111-1111-111111111111",
        "user_id": "22222222-2222-2222-2222-222222222222",
        "type": "deal_message_received",
        "title": None,
        "body": "ميعادنا بكرة",
        "route": None,
        "item_id": None,
        "offer_id": None,
        "deal_id": "33333333-3333-3333-3333-333333333333",
        "contextual_conversation_id": None,
        "actor_user_id": "44444444-4444-4444-4444-444444444444",
        "actor_display_name": "عمر",
        "actor_username": "omar",
        "actor_avatar_url": "https://cdn.example/avatar.jpg",
        "offers_enabled": True,
        "deals_enabled": True,
        "messages_enabled": True,
        "social_enabled": True,
        "smart_reminders_enabled": True,
        "devices": [],
    }


class PushPayloadTests(unittest.TestCase):
    def test_expo_payload_keeps_legacy_contract(self):
        payload = worker.payload_for(notification_row(), "ExponentPushToken[legacy]")

        self.assertEqual(payload["to"], "ExponentPushToken[legacy]")
        self.assertEqual(payload["channelId"], "teswa-activity")
        self.assertEqual(payload["priority"], "high")
        self.assertEqual(payload["data"]["dealId"], "33333333-3333-3333-3333-333333333333")

    def test_fcm_payload_targets_fid_and_is_data_only(self):
        payload = worker.fcm_payload_for(notification_row(), "firebase-installation-id")
        message = payload["message"]

        self.assertEqual(message["fid"], "firebase-installation-id")
        self.assertNotIn("token", message)
        self.assertNotIn("notification", message)
        self.assertEqual(message["android"], {"priority": "HIGH"})
        self.assertEqual(message["data"]["route"], "/deal/33333333-3333-3333-3333-333333333333")
        self.assertTrue(all(isinstance(value, str) for value in message["data"].values()))

    def test_only_namespaced_nonempty_tokens_are_fcm_devices(self):
        self.assertTrue(worker.is_fcm_device("fcm:installation-id"))
        self.assertFalse(worker.is_fcm_device("fcm:   "))
        self.assertFalse(worker.is_fcm_device("ExponentPushToken[legacy]"))


class PushProviderRoutingTests(unittest.TestCase):
    def test_mixed_devices_are_delivered_by_their_own_provider(self):
        row = notification_row()
        row["devices"] = [
            {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "token": "ExponentPushToken[legacy]"},
            {"id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "token": "fcm:firebase-installation-id"},
        ]
        finished = []
        with (
            mock.patch.object(worker, "SEND_ENABLED", True),
            mock.patch.object(worker, "claim_one", return_value={"job_id": 7, "notification_id": row["id"], "attempts": 1}),
            mock.patch.object(worker, "load_job", return_value=row),
            mock.patch.object(worker, "send_expo", return_value={"data": [{"status": "ok"}]}) as send_expo,
            mock.patch.object(worker, "send_fcm", return_value={"name": "projects/teswa/messages/1"}) as send_fcm,
            mock.patch.object(worker, "finish", side_effect=lambda *args: finished.append(args)),
        ):
            result = worker.process_one()

        self.assertEqual(result, {"processed": True, "status": "sent", "attempted": 2, "accepted": 2})
        self.assertEqual(send_expo.call_count, 1)
        self.assertEqual(send_fcm.call_count, 1)
        self.assertEqual(send_fcm.call_args.args[0]["message"]["fid"], "firebase-installation-id")
        self.assertEqual(finished, [(7, "sent", None)])

    def test_provider_failure_does_not_block_the_other_provider(self):
        row = notification_row()
        row["devices"] = [
            {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "token": "ExponentPushToken[legacy]"},
            {"id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "token": "fcm:firebase-installation-id"},
        ]
        finished = []
        with (
            mock.patch.object(worker, "SEND_ENABLED", True),
            mock.patch.object(worker, "claim_one", return_value={"job_id": 8, "notification_id": row["id"], "attempts": 1}),
            mock.patch.object(worker, "load_job", return_value=row),
            mock.patch.object(worker, "send_expo", side_effect=RuntimeError("expo_transport_failed")),
            mock.patch.object(worker, "send_fcm", return_value={"name": "projects/teswa/messages/2"}),
            mock.patch.object(worker, "finish", side_effect=lambda *args: finished.append(args)),
        ):
            result = worker.process_one()

        self.assertEqual(result["accepted"], 1)
        self.assertEqual(result["attempted"], 2)
        self.assertEqual(finished, [(8, "sent", "expo_transport_failed")])


if __name__ == "__main__":
    unittest.main()
