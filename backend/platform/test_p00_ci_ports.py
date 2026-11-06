"""Render P00 CI networking without a daemon, real credentials or host-port reservations."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


class P00CiPortsTests(unittest.TestCase):
    def render(self, ci=False):
        with tempfile.TemporaryDirectory() as folder:
            env = Path(folder) / '.env'
            env.write_text('COMPOSE_PROJECT_NAME=smarttravel-p00-port-test\n' + ''.join(
                f'{service}_DB_PASSWORD=synthetic-ci-only\n'
                for service in ('CATALOG', 'TEMPLATE', 'IDENTITY', 'TRIP', 'INGESTION', 'INTELLIGENCE')
            ), encoding='utf-8')
            args = ['docker', 'compose', '--env-file', str(env), '-f', str(HERE / 'compose.p00.yaml')]
            if ci:
                args += ['-f', str(HERE / 'compose.p00.ci.yaml')]
            result = subprocess.run(args + ['config', '--format', 'json'], cwd=ROOT,
                                    capture_output=True, check=True, text=True, encoding='utf-8')
            return json.loads(result.stdout)

    def test_ci_exposes_only_docker_allocated_template_port(self):
        config = self.render(ci=True)
        for name, spec in config['services'].items():
            if name != 'template-db':
                self.assertFalse(spec.get('ports'), name)
        ports = config['services']['template-db']['ports']
        self.assertEqual(len(ports), 1)
        self.assertEqual(ports[0]['host_ip'], '127.0.0.1')
        self.assertEqual(int(ports[0]['target']), 5432)
        self.assertEqual(int(ports[0]['published']), 0)

    def test_ci_retains_databases_volumes_and_health_probes(self):
        local, ci = self.render(), self.render(ci=True)
        self.assertEqual(set(local['services']), set(ci['services']))
        self.assertEqual(local['volumes'], ci['volumes'])
        for name in local['services']:
            self.assertEqual(local['services'][name].get('healthcheck'), ci['services'][name].get('healthcheck'))
        self.assertEqual(int(local['services']['ingestion-db']['ports'][0]['published']), 55436)


if __name__ == '__main__':
    unittest.main()
