"""Offline tests; Docker Compose CLI needed, daemon/cloud credentials not needed."""
import copy
import json
from pathlib import Path
import subprocess
import unittest

from manage import HERE, SERVICES, validate_configuration


class CloudSetupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run([
            'docker', 'compose', '--env-file', str(HERE / '.env.example'),
            '-f', str(HERE / 'compose.yaml'), '--profile', 'tools', 'config', '--format', 'json',
        ], check=True, capture_output=True, text=True, encoding='utf-8')
        cls.template = json.loads(result.stdout)

    def setUp(self):
        self.config = copy.deepcopy(self.template)
        for service in SERVICES:
            env = self.config['services'][service]['environment']
            for key, value in env.items():
                env[key] = value.replace('YOUR_', 'test_')

    def test_valid_configuration(self):
        validate_configuration(self.config)

    def test_placeholders_rejected(self):
        with self.assertRaises(ValueError):
            validate_configuration(self.template)

    def test_missing_password_rejected(self):
        self.config['services']['trip']['environment']['DB_PASSWORD'] = ''
        with self.assertRaises(ValueError):
            validate_configuration(self.config)

    def test_unverified_tls_rejected(self):
        env = self.config['services']['catalog']['environment']
        env['DB_URL'] = env['DB_URL'].replace('verify-full', 'require')
        with self.assertRaises(ValueError):
            validate_configuration(self.config)

    def test_pooler_rejected(self):
        env = self.config['services']['catalog']['environment']
        env['DB_URL'] = env['DB_URL'].replace('.neon.tech', '-pooler.neon.tech')
        with self.assertRaises(ValueError):
            validate_configuration(self.config)

    def test_mongo_database_required(self):
        env = self.config['services']['community']['environment']
        env['MONGODB_URI'] = 'mongodb+srv://test:password@cluster.mongodb.net/'
        with self.assertRaises(ValueError):
            validate_configuration(self.config)

    def test_mongo_tls_bypass_rejected(self):
        env = self.config['services']['community']['environment']
        env['MONGODB_URI'] += '&tlsAllowInvalidCertificates=true'
        with self.assertRaises(ValueError):
            validate_configuration(self.config)

    def test_credentials_not_in_validation_errors(self):
        env = self.config['services']['identity']['environment']
        env['DB_URL'] = 'jdbc:postgresql://user:secret-must-not-appear@host/db'
        with self.assertRaises(ValueError) as caught:
            validate_configuration(self.config)
        self.assertNotIn('secret-must-not-appear', str(caught.exception))

    def test_service_ports_and_contexts(self):
        for service, port in zip(SERVICES, range(8101, 8107)):
            spec = self.template['services'][service]
            self.assertEqual(spec['ports'][0]['host_ip'], '127.0.0.1')
            self.assertEqual(int(spec['ports'][0]['published']), port)
            self.assertTrue((Path(spec['build']['context']) / 'Dockerfile').is_file())
            env = spec['environment']
            self.assertEqual(env['JWT_AUDIENCE'], service)
            self.assertEqual(env['JWT_JWKS_URI'], 'http://dev-issuer:18083/jwks')
            self.assertNotIn('IDENTITY_DB_PASSWORD', env)
        self.assertEqual(self.template['services']['db-check']['profiles'], ['tools'])

    def test_real_env_ignored(self):
        result = subprocess.run(['git', 'check-ignore', str(HERE / '.env')], capture_output=True)
        self.assertEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
