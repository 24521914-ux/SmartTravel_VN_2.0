"""Offline tests; Docker Compose CLI needed, daemon/cloud credentials not needed."""
import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from manage import (COMPOSE_FILE, ENV_FILE, INTERNAL_SECRETS, LOCAL_ONLY_SERVICES, PLACEHOLDER, POSTGRES_SERVICES,
                    ROOT, SERVICES, TOOLS_FILE, prepare, validate_configuration)

EXAMPLE = ROOT / '.env.cloud.example'


def render(env_file):
    result = subprocess.run([
        'docker', 'compose', '--env-file', str(env_file),
        '-f', str(COMPOSE_FILE), '-f', str(TOOLS_FILE), '--profile', 'tools', 'config', '--format', 'json',
    ], check=True, capture_output=True, text=True, encoding='utf-8', cwd=ROOT)
    return json.loads(result.stdout)


class CloudSetupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = render(EXAMPLE)

    def setUp(self):
        self.config = copy.deepcopy(self.template)
        for spec in self.config['services'].values():
            env = spec.get('environment') or {}
            for key, value in env.items():
                if isinstance(value, str):
                    env[key] = value.replace('YOUR_', 'test_').replace(PLACEHOLDER, 'g' * 64)

    def test_valid_configuration(self):
        validate_configuration(self.config)

    def test_placeholders_rejected(self):
        with self.assertRaises(ValueError):
            validate_configuration(self.template)

    def test_ungenerated_internal_secret_rejected(self):
        self.config['services']['trip']['environment']['WORKLOAD_CLIENT_SECRET'] = PLACEHOLDER
        with self.assertRaises(ValueError):
            validate_configuration(self.config)

    def test_missing_password_rejected(self):
        self.config['services']['trip']['environment']['DB_MIGRATION_PASSWORD'] = ''
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
        env = self.config['services']['community-migrate']['environment']
        env['COMMUNITY_MONGODB_MIGRATION_URI'] += '&tlsAllowInvalidCertificates=true'
        with self.assertRaises(ValueError):
            validate_configuration(self.config)

    def test_credentials_not_in_validation_errors(self):
        env = self.config['services']['identity']['environment']
        env['DB_URL'] = 'jdbc:postgresql://user:secret-must-not-appear@host/db'
        with self.assertRaises(ValueError) as caught:
            validate_configuration(self.config)
        self.assertNotIn('secret-must-not-appear', str(caught.exception))

    def test_published_service_port_rejected(self):
        self.config['services']['catalog']['ports'] = [{'host_ip': '127.0.0.1', 'published': '8102', 'target': 8102}]
        with self.assertRaises(ValueError):
            validate_configuration(self.config)

    def test_only_gateway_rabbitmq_services_and_init_jobs(self):
        services = self.template['services']
        self.assertEqual(self.template['name'], 'smarttravel-cloud')
        self.assertEqual(set(services), {'gateway', 'rabbitmq', 'rabbit-init', 'key-init', 'community-migrate',
                                         'db-check', *SERVICES})
        for name, spec in services.items():
            self.assertNotIn(name, LOCAL_ONLY_SERVICES)
            if name != 'gateway':
                self.assertFalse(spec.get('ports'), name)
            for dependency in spec.get('depends_on', {}):
                self.assertFalse(dependency.endswith('-db'), name)
        self.assertEqual(services['gateway']['ports'][0]['host_ip'], '127.0.0.1')
        self.assertEqual(int(services['gateway']['ports'][0]['published']), 58080)
        self.assertEqual(services['rabbit-init']['depends_on']['rabbitmq']['condition'], 'service_healthy')
        self.assertEqual(services['db-check']['profiles'], ['tools'])
        self.assertEqual(set(self.template['volumes']) & {f'{s}-data' for s in SERVICES}, set())

    def test_services_use_cloud_databases_and_internal_routes(self):
        services = self.template['services']
        for service in SERVICES:
            spec = services[service]
            env = spec['environment']
            self.assertEqual(spec['depends_on']['rabbit-init']['condition'], 'service_completed_successfully')
            self.assertEqual(env['JWT_AUDIENCE'], service)
            self.assertEqual(env['JWT_JWKS_URI'], 'http://identity:8101/.well-known/jwks.json')
            self.assertEqual(env['BROKER_HOST'], 'rabbitmq')
            self.assertTrue((Path(spec['build']['context']) / 'Dockerfile').is_file(), service)
            self.assertEqual(spec['build']['target'], 'source', service)
        for service in POSTGRES_SERVICES:
            env = services[service]['environment']
            self.assertIn('.neon.tech', env['DB_URL'])
            self.assertIn('sslmode=verify-full', env['DB_URL'])
            self.assertEqual(env['DB_USER'], service + '_runtime')
            self.assertEqual(env['DB_MIGRATION_USER'], service + '_migrator')
        self.assertTrue(services['community']['environment']['MONGODB_URI'].startswith('mongodb+srv://'))
        self.assertEqual(services['community']['depends_on']['community-migrate']['condition'], 'service_completed_successfully')
        self.assertEqual(services['identity']['depends_on']['key-init']['condition'], 'service_completed_successfully')

    def test_real_env_ignored(self):
        result = subprocess.run(['git', 'check-ignore', str(ENV_FILE)], capture_output=True, cwd=ROOT)
        self.assertEqual(result.returncode, 0)


class PrepareTests(unittest.TestCase):
    def test_generates_internal_secrets_only_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as folder:
            env_file = Path(folder) / '.env'
            generated = prepare(env_file, 'cloud')
            self.assertEqual(set(generated), set(INTERNAL_SECRETS))
            first = env_file.read_text(encoding='utf-8')
            self.assertFalse([l for l in first.splitlines() if PLACEHOLDER in l and not l.startswith('#')])
            # Cloud database settings stay exactly as the example until the user fills them.
            for line in EXAMPLE.read_text(encoding='utf-8').splitlines():
                if 'YOUR_' in line:
                    self.assertIn(line, first.splitlines())
            values = dict(line.split('=', 1) for line in first.splitlines() if '=' in line and not line.startswith('#'))
            self.assertGreaterEqual(len(values['TRIP_WORKLOAD_SECRET']), 32)
            # A second run, and a user-edited database URL, keep every existing value.
            edited = first.replace('YOUR_TRIP_HOST', 'real-trip-host')
            env_file.write_text(edited, encoding='utf-8')
            self.assertEqual(prepare(env_file, 'cloud'), [])
            self.assertEqual(env_file.read_text(encoding='utf-8'), edited)

    def test_fills_only_missing_or_placeholder_secrets_in_existing_file(self):
        with tempfile.TemporaryDirectory() as folder:
            env_file = Path(folder) / '.env'
            env_file.write_text(f'BROKER_ADMIN_PASSWORD=keep-me\nGATEWAY_EXCHANGE_SECRET={PLACEHOLDER}\n'
                                'TRIP_RUNTIME_PASSWORD=\n', encoding='utf-8')
            generated = prepare(env_file, 'cloud')
            text = env_file.read_text(encoding='utf-8')
            self.assertIn('BROKER_ADMIN_PASSWORD=keep-me', text)
            self.assertNotIn('BROKER_ADMIN_PASSWORD', generated)
            self.assertIn('GATEWAY_EXCHANGE_SECRET', generated)
            # Cloud mode never generates database credentials, even when they are empty.
            self.assertIn('TRIP_RUNTIME_PASSWORD=\n', text)
            self.assertEqual(set(generated), set(INTERNAL_SECRETS) - {'BROKER_ADMIN_PASSWORD'})

    def test_prepared_file_renders_a_complete_compose_configuration(self):
        with tempfile.TemporaryDirectory() as folder:
            env_file = Path(folder) / '.env.cloud'
            prepare(env_file, 'cloud')
            config = render(env_file)
            self.assertEqual(config['services']['gateway']['environment']['GATEWAY_EXCHANGE_SECRET'],
                             config['services']['identity']['environment']['GATEWAY_EXCHANGE_SECRET'])


if __name__ == '__main__':
    unittest.main()
