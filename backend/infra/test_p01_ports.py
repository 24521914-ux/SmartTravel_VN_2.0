"""P01 Docker port discovery must feed probes without changing local/P02 defaults."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import os
import sys
import unittest
from unittest.mock import patch
import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend/platform'))
import check_service_skeletons as smoke
spec = importlib.util.spec_from_file_location('p01_ports', ROOT / 'backend/infra/p01.py')
p01 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p01)


class PublishedPortTests(unittest.TestCase):
    def test_discovered_docker_port_reaches_probe(self):
        with patch.object(p01, 'compose', return_value=SimpleNamespace(stdout='127.0.0.1:49173\n')) as compose:
            port = p01.published_port({}, 'catalog-db', 5432)
        compose.assert_called_once_with({}, 'port', 'catalog-db', '5432')
        with patch.dict(os.environ, {'P01_CATALOG_DB_PORT': port}):
            self.assertEqual(smoke.database_port('catalog', p01=True), 49173)
            self.assertEqual(smoke.database_port('catalog'), 55432)
            self.assertEqual(smoke.database_port('trip', p01=True), 56435)

    def test_rejects_unresolved_or_non_loopback_bindings(self):
        for output in ['', '0.0.0.0:49173', '127.0.0.1:0', '127.0.0.1:65536', '127.0.0.1:49173\n[::1]:49173']:
            with self.subTest(output=output), patch.object(p01, 'compose', return_value=SimpleNamespace(stdout=output)):
                with self.assertRaises((RuntimeError, ValueError)):
                    p01.published_port({}, 'catalog-db', 5432)
        with patch.dict(os.environ, {'P01_CATALOG_DB_PORT': '0'}):
            with self.assertRaisesRegex(ValueError, 'Resolve'):
                smoke.database_port('catalog', p01=True)

    def test_developer_defaults_and_p02_mapping_remain_compatible(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(smoke.database_port('catalog', p01=True), 56432)
        config = yaml.safe_load((ROOT / 'backend/infra/compose.p01.yaml').read_text(encoding='utf-8'))
        binding = config['services']['catalog-db']['ports'][0]
        self.assertEqual(binding, '127.0.0.1:${P01_CATALOG_DB_PORT:-56432}:5432')
        self.assertEqual(binding.replace('5643', '5743'), '127.0.0.1:${P01_CATALOG_DB_PORT:-57432}:5432')


if __name__ == '__main__':
    unittest.main()
