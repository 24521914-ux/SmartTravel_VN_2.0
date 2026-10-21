"""Regression checks for security evidence collection, not application mocks."""
import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

import p03_nonai_security as security


class SecurityEvidenceTests(unittest.TestCase):
    def test_rejected_request_records_failure_without_body_or_credentials(self):
        matrix = security.Matrix()
        secret = 'sensitive-synthetic-value'
        with patch.object(security, 'request', return_value=(500, {'email': secret}, {})):
            with self.assertRaises(AssertionError):
                matrix.check('denial', 'trip', '/api/v1/me/trips', token=secret, expected=(401,))
        self.assertFalse(matrix.rows[0]['pass'])
        self.assertNotIn(secret, json.dumps(matrix.rows))
        self.assertIn(secret, matrix.sensitive)

    def test_if_match_is_sent_for_real_owner_mutations(self):
        matrix = security.Matrix()
        with patch.object(security, 'request', return_value=(204, None, {})) as request:
            matrix.check('delete', 'trip', '/api/v1/trips/synthetic', 'DELETE',
                         token='synthetic-token', expected=(204,), version=3)
        self.assertEqual(request.call_args.args[-1]['If-Match'], '"3"')
        self.assertEqual(matrix.rows[0]['status'], 204)

    def test_multipart_preserves_bytes_and_has_complete_boundary(self):
        raw = bytes(range(256))
        body, content_type = security.multipart(raw)
        boundary = content_type.split('boundary=')[1].encode()
        self.assertIn(b'\r\n\r\n' + raw + b'\r\n', body)
        self.assertTrue(body.startswith(b'--' + boundary))
        self.assertTrue(body.endswith(b'--' + boundary + b'--\r\n'))

    def test_source_change_forces_failure_even_when_scenarios_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'security.json'
            report = {'pass': True, 'full_role_matrix_pass': True, 'request_count': 1}
            with patch('sys.argv', ['runner', '--release-id', 'synthetic-release', '--output', str(output)]), \
                 patch.object(security, 'run', return_value=report), \
                 patch.object(security, 'candidate_manifest', side_effect=[{'sha256': 'before'}, {'sha256': 'after'}]):
                with self.assertRaises(SystemExit) as exit_result:
                    security.main()
            self.assertEqual(exit_result.exception.code, 1)
            self.assertFalse(json.loads(output.read_text())['pass'])

    def test_scope_has_no_ai_service(self):
        self.assertEqual(set(security.SERVICES), {'identity', 'catalog', 'community', 'trip', 'ingestion'})

    def test_redaction_fails_closed_on_empty_logs_and_leaked_secret(self):
        secret = 'synthetic-password-never-log'
        self.assertFalse(security.redaction_stats('', [secret], [])['pass'])
        result = security.redaction_stats('password=' + secret, [secret], [])
        self.assertFalse(result['pass'])
        self.assertEqual(result['leaked_values'], 1)
        self.assertNotIn(secret, json.dumps(result))
        self.assertFalse(security.redaction_stats('safe startup', [secret], [{'body': secret}])['pass'])
        self.assertTrue(security.redaction_stats('safe startup', [secret], [{'status': 401}])['pass'])


if __name__ == '__main__':
    unittest.main()
