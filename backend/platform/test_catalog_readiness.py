"""Regression: temporary PostgreSQL startup is not catalog database readiness."""
import importlib.util
import itertools
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch

BACKEND = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('catalog_runner', BACKEND / 'services/catalog-service/test-local.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class CatalogReadinessTests(unittest.TestCase):
    def test_waits_for_actual_database_query_after_temporary_server(self):
        replies = [SimpleNamespace(returncode=1, stdout=b'', stderr=b'database does not exist'),
                   SimpleNamespace(returncode=0, stdout=b'', stderr=b''),
                   SimpleNamespace(returncode=0, stdout=b'1\n', stderr=b'')]
        with patch.object(runner.subprocess, 'run', side_effect=replies) as run, patch.object(runner.time, 'sleep'):
            runner.wait_for_database('owned-db', {'POSTGRES_PASSWORD': 'private-fixture'})
        self.assertEqual(run.call_count, 3)
        command = run.call_args.args[0]
        self.assertIn('127.0.0.1', command)
        self.assertIn('catalog_db', command)
        self.assertIn('SELECT 1', command)
        self.assertNotIn('private-fixture', command)
        self.assertEqual(run.call_args.kwargs['env']['PGPASSWORD'], 'private-fixture')
        self.assertEqual(run.call_args.kwargs['env']['PGCONNECT_TIMEOUT'], '2')

    def test_missing_database_fails_at_deadline_without_secret(self):
        with patch.object(runner.time, 'monotonic', side_effect=itertools.count(0, 0.25)), patch.object(runner.time, 'sleep'), patch.object(runner.subprocess, 'run', return_value=SimpleNamespace(returncode=2, stdout=b'')):
            with self.assertRaisesRegex(RuntimeError, 'authenticated TCP query to catalog_db') as error:
                runner.wait_for_database('owned-db', {'POSTGRES_PASSWORD': 'private-fixture'}, timeout=1)
        self.assertNotIn('private-fixture', str(error.exception))

    def test_hung_client_is_bounded_and_retried(self):
        with patch.object(runner.time, 'monotonic', side_effect=itertools.count(0, 0.25)), patch.object(runner.time, 'sleep'), patch.object(runner.subprocess, 'run', side_effect=subprocess.TimeoutExpired('psql', 1)) as run:
            with self.assertRaises(RuntimeError):
                runner.wait_for_database('owned-db', {'POSTGRES_PASSWORD': 'private-fixture'}, timeout=1)
        self.assertGreater(run.call_count, 0)
        self.assertLessEqual(run.call_args.kwargs['timeout'], 1)


if __name__ == '__main__':
    unittest.main()
