"""Regression tests for the PostgreSQL write runner."""
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('write', Path(__file__).with_name('oracle_marketplace_write.py'))
write = importlib.util.module_from_spec(spec)
spec.loader.exec_module(write)
UID = '11111111-1111-4111-8111-111111111111'


class Result:
    returncode = 0
    stdout = UID + '\n{"ok":true}\n'
    stderr = ''


class WriteTransactionTests(unittest.TestCase):
    def test_data_modifying_cte_is_top_level(self):
        statement = 'WITH inserted AS (INSERT INTO public.items DEFAULT VALUES RETURNING id) SELECT json_build_object(\'ok\',true)'
        with patch.dict(write.os.environ, {'TESWA_DOMAIN_DATABASE_URL':'dbname=teswa_rehearsal'}), patch.object(write.subprocess, 'run', return_value=Result()) as run:
            result = write.PgWriteRunner(psql='psql').query(UID, statement)
        sql = run.call_args.kwargs['input']
        self.assertEqual(result, {'ok':True})
        self.assertIn('\n' + statement + ';\nCOMMIT;', sql)
        self.assertNotIn('SELECT (WITH', sql)
        self.assertIn('SET LOCAL ROLE teswa_app_authenticated;', sql)
        self.assertIn("set_config('teswa.user_id'", sql)
        self.assertIn('VERBOSITY=sqlstate', run.call_args.args[0])

    def test_rollback_probe_never_commits_and_requires_rehearsal(self):
        with patch.object(write.subprocess, 'run', return_value=Result()) as run:
            with self.assertRaises(write.ApiError) as error:
                write.PgWriteRunner(database_url='dbname=production', psql='psql').diagnose(UID, 'SELECT 1')
            self.assertEqual(error.exception.status, 503)
            run.assert_not_called()
            result = write.PgWriteRunner(database_url='dbname=teswa_rehearsal', psql='psql').diagnose(UID, 'SELECT json_build_object(\'ok\',true)')
        sql = run.call_args.kwargs['input']
        self.assertEqual(result, {'ok':True})
        self.assertIn("current_database() <> 'teswa_rehearsal'", sql)
        self.assertTrue(sql.endswith('ROLLBACK;'))
        self.assertNotIn('COMMIT;', sql)

    def test_sqlstate_is_logged_without_sql_or_values(self):
        class Failed:
            returncode = 3
            stdout = ''
            stderr = 'ERROR:  0A000\nDETAIL: private@example.com secret-value\n'
        with patch.object(write.subprocess, 'run', return_value=Failed()):
            with self.assertLogs(write.__name__, level='WARNING') as logs:
                with self.assertRaises(write.ApiError) as error:
                    write.PgWriteRunner(database_url='dbname=teswa_rehearsal', psql='psql').query(UID, 'SELECT 1')
        self.assertEqual(error.exception.status, 409)
        self.assertEqual(error.exception.code, 'domain_write_rejected')
        self.assertIn('sqlstate=0A000', logs.output[0])
        self.assertNotIn('secret-value', str(logs.output))
        self.assertNotIn('private@example.com', str(logs.output))
        self.assertEqual(write.sqlstate_from_stderr('ERROR:  23503\n'), '23503')
        self.assertEqual(write.sqlstate_from_stderr('unexpected error with secret'), 'unknown')


if __name__ == '__main__': unittest.main()
