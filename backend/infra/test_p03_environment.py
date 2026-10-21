"""Safety checks for isolated P03 configuration; never invokes Docker."""
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

import yaml
import p03_environment as env


PROJECT = 'smarttravel-p03-load-a123b456'


def minimal_config():
    return {'name': PROJECT, 'volumes': {'identity-data': {'name': PROJECT + '_identity-data'}},
            'services': {'identity-db': {'image': 'postgres:test',
                         'volumes': ['identity-data:/var/lib/postgresql/data',
                                     'D:/workspace/init.sql:/init.sql:ro']}}}


class EnvironmentSafetyTests(unittest.TestCase):
    def test_project_rejects_existing_unowned_names_and_path_escape(self):
        self.assertEqual(env.validate_project(PROJECT), PROJECT)
        for name in ('smarttravel-p02', 'smarttravel-p01', '../' + PROJECT, PROJECT + '/x',
                     'smarttravel-p03-load-ABCDEF12', 'smarttravel-p03-load-123', '', None):
            with self.subTest(name=name), self.assertRaises(ValueError):
                env.validate_project(name)

    def test_owned_named_volumes_and_windows_readonly_binds_allowed(self):
        env.validate_config(minimal_config(), PROJECT)

    def test_shared_volumes_networks_fixed_containers_and_writable_binds_rejected(self):
        changes = [lambda cfg: cfg.update(name='smarttravel-p02'),
            lambda cfg: cfg['volumes']['identity-data'].update(name='smarttravel-p02_identity-data'),
            lambda cfg: cfg['volumes']['identity-data'].update(external=True),
            lambda cfg: cfg['volumes']['identity-data'].update(driver_opts={'type': 'none', 'o': 'bind', 'device': 'D:/data'}),
            lambda cfg: cfg['volumes']['identity-data'].update(driver='nfs'),
            lambda cfg: cfg['services']['identity-db'].update(container_name='identity-db'),
            lambda cfg: cfg['services']['identity-db'].update(network_mode='host'),
            lambda cfg: cfg['services']['identity-db'].update(network_mode='container:existing'),
            lambda cfg: cfg['services']['identity-db'].update(privileged=True),
            lambda cfg: cfg['services']['identity-db'].update(devices=['/dev/sda']),
            lambda cfg: cfg['services']['identity-db'].update(volumes_from=['existing']),
            lambda cfg: cfg['services']['identity-db'].update(volumes=['D:/data:/data']),
            lambda cfg: cfg['services']['identity-db'].update(volumes=['smarttravel-p02_identity-data:/data']),
            lambda cfg: cfg['services']['identity-db'].update(volumes=[{'type': 'bind', 'source': 'D:/data', 'target': '/data'}]),
            lambda cfg: cfg.update(networks={'default': {'external': True}}),
            lambda cfg: cfg.update(networks={'default': {'name': 'smarttravel-p02_default'}})]
        for change in changes:
            cfg = minimal_config()
            change(cfg)
            with self.subTest(config=cfg), self.assertRaises(ValueError):
                env.validate_config(cfg, PROJECT)

    def test_provision_context_restores_p02_globals_even_on_failure(self):
        original_local, original_ports = env.p02.LOCAL, env.p02.PORTS
        with tempfile.TemporaryDirectory() as folder, patch.object(env, 'ENVIRONMENTS', Path(folder)):
            with self.assertRaisesRegex(RuntimeError, 'test failure'):
                with env.provision_context(PROJECT):
                    self.assertEqual(env.p02.LOCAL, Path(folder) / PROJECT)
                    self.assertEqual(env.p02.PORTS['identity'], 59101)
                    raise RuntimeError('test failure')
        self.assertEqual(env.p02.LOCAL, original_local)
        self.assertIs(env.p02.PORTS, original_ports)

    def test_configure_rewrites_all_generated_volumes_ports_and_labels(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(env, 'ENVIRONMENTS', Path(folder)):
            original = minimal_config()
            original['name'] = 'smarttravel-p02'
            original['volumes']['identity-data'] = None
            original['services'].update(identity={'image': 'identity:test', 'ports': ['127.0.0.1:58101:8101']},
                                         **{'community-db': {'image': 'mongo:test', 'volumes': []}},
                                         gateway={'image': 'gateway:test', 'ports': ['127.0.0.1:58080:8080']})
            def write_config(_):
                env.p02.LOCAL.mkdir(parents=True)
                (env.p02.LOCAL / 'compose.yaml').write_text(yaml.safe_dump(original), encoding='utf-8')
            with patch.object(env.p02, 'prepare', return_value={}), patch.object(env.p02, 'configuration', side_effect=write_config):
                cfg = env.configure(PROJECT)
            self.assertEqual(cfg['volumes']['identity-data']['name'], PROJECT + '_identity-data')
            self.assertEqual(cfg['services']['identity']['ports'], ['127.0.0.1:59101:8101'])
            self.assertEqual(cfg['services']['gateway']['ports'], ['127.0.0.1:59080:8080'])
            self.assertNotIn('ports', cfg['services']['identity-db'])
            self.assertTrue(all(service['labels'][env.LABEL] == PROJECT for service in cfg['services'].values()))
            self.assertTrue(all(service['restart'] == 'no' for service in cfg['services'].values()))
            self.assertEqual(env.configure(PROJECT), cfg)

    def test_compose_failure_does_not_expose_secret_output(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(env, 'ENVIRONMENTS', Path(folder)):
            private = Path(folder) / PROJECT
            private.mkdir()
            (private / 'compose.yaml').write_text(yaml.safe_dump(minimal_config()), encoding='utf-8')
            (private / 'secrets.json').write_text('{"TEST_PASSWORD":"must-not-print"}', encoding='utf-8')
            with patch.object(env.subprocess, 'run') as run:
                run.return_value.returncode = 1
                run.return_value.stderr = b'must-not-print'
                with self.assertRaises(RuntimeError) as failure:
                    env.command(PROJECT, 'up', '-d')
                self.assertNotIn('must-not-print', str(failure.exception))
                args, kwargs = run.call_args
                self.assertEqual(args[0][:4], ['docker', 'compose', '-p', PROJECT])
                self.assertEqual(kwargs['env']['TEST_PASSWORD'], 'must-not-print')


if __name__ == '__main__':
    unittest.main()
