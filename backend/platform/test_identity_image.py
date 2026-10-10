"""Identity image smoke uses Compose DNS without exposing DB/SMTP beyond loopback."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace

BACKEND = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('identity_image_probe',
                                            BACKEND / 'services/identity-service/check-local.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class IdentityImageTests(unittest.TestCase):
    def test_image_uses_internal_dns_and_ports(self):
        original = {'MAIL_PORT': '51025', 'DB_USER': 'identity_runtime', 'PORT': '1234'}
        env = probe.image_environment(original)
        self.assertEqual(env['DB_URL'], 'jdbc:postgresql://identity-db:5432/identity_db')
        self.assertEqual((env['MAIL_HOST'], env['MAIL_PORT']), ('identity-mail', '1025'))
        self.assertEqual(env['JWT_JWKS_URI'], 'http://127.0.0.1:8101/.well-known/jwks.json')
        self.assertEqual(env['PORT'], '8101')
        self.assertEqual(env['DB_USER'], original['DB_USER'])
        self.assertEqual(original['MAIL_PORT'], '51025')

    @patch.object(probe, 'environment', return_value={})
    @patch.object(probe, 'compose', return_value=SimpleNamespace(stdout='owned-db-id\n'))
    @patch.object(probe, 'run', return_value=SimpleNamespace(stdout='{"smarttravel-p01_default":{}}'))
    def test_network_is_discovered_from_running_compose_db(self, run, compose, environment):
        self.assertEqual(probe.dependency_network(), 'smarttravel-p01_default')
        compose.assert_called_once_with({}, 'ps', '-q', 'identity-db')
        self.assertEqual(run.call_args.args[0][-1], 'owned-db-id')

    @patch.object(probe, 'environment', return_value={})
    @patch.object(probe, 'compose', return_value=SimpleNamespace(stdout=''))
    def test_missing_database_fails_before_starting_image(self, compose, environment):
        with self.assertRaisesRegex(RuntimeError, 'Start the P01 Identity database'):
            probe.dependency_network()

    @patch.object(probe, 'environment', return_value={})
    @patch.object(probe, 'compose', return_value=SimpleNamespace(stdout='owned-db-id'))
    @patch.object(probe, 'run', return_value=SimpleNamespace(stdout='{"one":{},"two":{}}'))
    def test_ambiguous_network_is_not_silently_selected(self, run, compose, environment):
        with self.assertRaisesRegex(RuntimeError, 'Expected one Compose network'):
            probe.dependency_network()


if __name__ == '__main__':
    unittest.main()
