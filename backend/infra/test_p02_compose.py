"""The static docker-compose.yml must stay equivalent to the generated P02 configuration.

P03 isolated environments still derive their compose from p02.configuration(); this test keeps
the two from drifting. No Docker needed: anchors are resolved by YAML and ${...} is interpolated here.
"""
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml

import p02

ROOT = Path(__file__).resolve().parents[2]
SERVICES = p02.SERVICES + ['gateway']


def interpolate(value, env):
    if isinstance(value, dict):
        return {k: interpolate(v, env) for k, v in value.items()}
    if isinstance(value, list):
        return [interpolate(v, env) for v in value]
    if not isinstance(value, str):
        return value

    def replace(match):
        name, operator, default = match.group(1), match.group(2), match.group(3) or ''
        if name in env:
            return env[name]
        if operator == ':?':
            raise KeyError(name)
        return default
    return re.sub(r'\$\{([A-Z0-9_]+)(?:(:[?-])([^}]*))?\}', replace, value).replace('$$', '$')


class StaticComposeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        names = [line.split('=', 1)[0] for line in (ROOT / '.env.example').read_text(encoding='utf-8').splitlines()
                 if line and not line.startswith('#') and '=' in line]
        cls.values = {name: 'v-' + name.lower() for name in names if name != 'AI_ENABLED'}
        cls.static = interpolate(yaml.safe_load((ROOT / 'docker-compose.yml').read_text(encoding='utf-8')), cls.values)
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(p02, 'LOCAL', Path(folder)):
            p02.configuration(cls.values)
            cls.generated = yaml.safe_load((Path(folder) / 'compose.yaml').read_text(encoding='utf-8'))

    def test_example_env_defines_every_required_variable(self):
        text = (ROOT / 'docker-compose.yml').read_text(encoding='utf-8')
        required = set(re.findall(r'\$\{([A-Z0-9_]+):\?', text))
        self.assertEqual(required - set(self.values), set())
        self.assertEqual(set(self.values) - required, set(), 'Unused secrets in .env.example')

    def test_services_images_and_ports_match_generated_stack(self):
        self.assertEqual(self.static['name'], self.generated['name'])
        for name in SERVICES:
            static, generated = self.static['services'][name], self.generated['services'][name]
            self.assertEqual(static['image'], generated['image'], name)
            self.assertEqual(static['ports'], generated['ports'], name)
            self.assertEqual(static.get('volumes'), generated.get('volumes'), name)

    def test_application_environment_matches_generated_stack(self):
        for name in SERVICES:
            static = dict(self.static['services'][name]['environment'])
            generated = dict(self.generated['services'][name]['environment'])
            if 'SPRING_APPLICATION_JSON' in generated:
                self.assertEqual(json.loads(static.pop('SPRING_APPLICATION_JSON')),
                                 json.loads(generated.pop('SPRING_APPLICATION_JSON')), name)
            # Static compose adds only settings the generated stack left to defaults.
            extra = {'AI_ENABLED'} if name == 'gateway' else {'WORKLOAD_TOKEN_URI'} if name == 'identity' else set()
            self.assertEqual({k: v for k, v in static.items() if k not in extra}, generated, name)

    def test_volumes_keep_existing_names_and_databases_have_no_default_host_port(self):
        self.assertEqual(set(self.static['volumes']), set(self.generated['volumes']) | {'identity-signing-keys'})
        self.assertEqual(self.static['volumes']['identity-signing-keys'], {'name': 'smarttravel-p02_identity-signing-keys'})
        for name in [s + '-db' for s in p02.SERVICES]:
            self.assertNotIn('ports', self.static['services'][name], name)
            self.assertTrue(all(p.startswith('127.0.0.1:') for p in self.generated['services'][name].get('ports', [])))
        for name, service in self.static['services'].items():
            self.assertTrue(all(str(p).startswith('127.0.0.1:') for p in service.get('ports', [])), name)

    def test_services_start_only_after_their_init_jobs(self):
        services = self.static['services']
        for name in p02.SERVICES:
            depends = services[name]['depends_on']
            self.assertEqual(depends['rabbit-init'], {'condition': 'service_completed_successfully'}, name)
            self.assertIn('healthcheck', services[name], name)
        self.assertEqual(services['identity']['depends_on']['key-init'], {'condition': 'service_completed_successfully'})
        self.assertEqual(services['community']['depends_on']['mongo-init'], {'condition': 'service_completed_successfully'})
        self.assertEqual(services['sandbox-init']['depends_on'], {'catalog': {'condition': 'service_healthy'}})


class EnvSyncTests(unittest.TestCase):
    def test_env_is_created_extended_and_never_silently_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            env = Path(folder) / '.env'
            with mock.patch.object(p02, 'ENV_FILE', env):
                p02.sync_env({'A_PASSWORD': 'one'})
                self.assertEqual(p02.read_env(env), {'AI_ENABLED': 'false', 'A_PASSWORD': 'one'})
                p02.sync_env({'A_PASSWORD': 'one', 'B_PASSWORD': 'two'})
                self.assertEqual(p02.read_env(env)['B_PASSWORD'], 'two')
                with self.assertRaises(SystemExit) as error:
                    p02.sync_env({'A_PASSWORD': 'changed'})
                self.assertIn('A_PASSWORD', str(error.exception))
                self.assertNotIn('changed', str(error.exception))
                self.assertEqual(p02.read_env(env)['A_PASSWORD'], 'one')


if __name__ == '__main__':
    unittest.main()
