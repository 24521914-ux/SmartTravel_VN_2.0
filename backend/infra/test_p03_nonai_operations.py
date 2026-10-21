import copy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from p03_nonai_operations import fresh, package_linkage


class OperationsTests(unittest.TestCase):
    def test_freshness_rejects_stale_future_naive_and_malformed(self):
        self.assertTrue(fresh({'timestamp': datetime.now(timezone.utc).isoformat()}))
        for value in [None, 'invalid', '2026-01-01T00:00:00',
                      (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
                      (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()]:
            self.assertFalse(fresh({'timestamp': value}))

    def test_same_candidate_both_before_and_after_required(self):
        report = {'pass': True, 'scope': 'non-ai', 'timestamp': datetime.now(timezone.utc).isoformat(),
                  'candidate_sha256': 'current', 'candidate_before_sha256': 'old'}
        with self.assertRaises(RuntimeError), patch('p03_nonai_operations.docker') as docker:
            package_linkage(report, {'sha256': 'current'})
        docker.assert_not_called()

    def test_image_or_jar_mismatch_rejects_even_green_compile(self):
        base = {'pass': True, 'scope': 'non-ai', 'timestamp': datetime.now(timezone.utc).isoformat(),
                'candidate_sha256': 'current', 'candidate_before_sha256': 'current',
                'packages': {'catalog': {'image_id': 'expected-image', 'jar_sha256': 'expected-jar',
                                         'source_files': {'app': 'source'}}}}
        for outputs in [(b'old-image', b'expected-jar  /app/application.jar'),
                        (b'expected-image', b'old-jar  /app/application.jar')]:
            with patch('p03_nonai_operations.p02.compose', return_value=SimpleNamespace(stdout='container')), \
                    patch('p03_nonai_operations.docker', side_effect=outputs), self.assertRaises(RuntimeError):
                package_linkage(copy.deepcopy(base), {'sha256': 'current', 'files': {'app': 'source'}})


if __name__ == '__main__':
    unittest.main()
