import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location('realtime_shadow', ROOT / 'realtime-shadow-transport.py')
realtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(realtime)


class Proc:
    returncode = 0
    stderr = b''
    stdout = ('11111111-1111-4111-8111-111111111111\n7\n' + json.dumps([{
        'event_id': 8, 'source_table': 'direct_messages', 'event_type': 'INSERT',
        'aggregate_kind': 'direct', 'aggregate_id': '33333333-3333-4333-8333-333333333333',
        'row_id': '44444444-4444-4444-8444-444444444444',
    }]) + '\n').encode()


class RealtimeTransportTests(unittest.TestCase):
    def test_read_preserves_cursor_and_uses_restricted_identity(self):
        with patch.object(realtime.subprocess, 'run', return_value=Proc()) as execute:
            cursor, events = realtime.read_events('11111111-1111-4111-8111-111111111111', 7, 100)
        self.assertEqual(cursor, 7)
        self.assertEqual(events[0]['event_id'], 8)
        command = execute.call_args.args[0]
        self.assertIn('uid=11111111-1111-4111-8111-111111111111', command)
        self.assertIn('bootstrap=false', command)

    def test_bootstrap_cursor_returns_no_historical_payload(self):
        proc = Proc()
        proc.stdout = b'11111111-1111-4111-8111-111111111111\n42\n[]\n'
        with patch.object(realtime.subprocess, 'run', return_value=proc) as execute:
            cursor, events = realtime.read_events('11111111-1111-4111-8111-111111111111', 0, 100, True)
        self.assertEqual((cursor, events), (42, []))
        self.assertIn('bootstrap=true', execute.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
