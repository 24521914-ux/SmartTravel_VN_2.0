"""Service/feature/layer source guards and safe scaffold/export regression tests.
These structural checks complement, not replace, Java compilation and DB/API tests.
Run: python backend/platform/test_service_layout.py
"""
import importlib.util
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

BACKEND = Path(__file__).resolve().parents[1]
SERVICES = ['identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence']
spec = importlib.util.spec_from_file_location('security_proposals', BACKEND / 'platform/sync_security_templates.py')
proposals = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proposals)


class ServiceLayoutTests(unittest.TestCase):
    def test_packages_match_main_and_test_paths(self):
        for service in SERVICES:
            for tree in ['main', 'test']:
                root = BACKEND / f'services/{service}-service/src/{tree}/java'
                for path in root.rglob('*.java'):
                    with self.subTest(path=path):
                        package = re.search(r'^package ([\w.]+);', path.read_text(encoding='utf-8'), re.M)
                        self.assertIsNotNone(package)
                        self.assertEqual(package.group(1), '.'.join(path.parent.relative_to(root).parts))

    def test_mongo_migration_retains_lf_with_windows_checkout_filters(self):
        path = 'backend/services/community-service/src/main/resources/db/migration/V1__community_baseline.js'
        root = BACKEND.parent
        original = subprocess.check_output(['git', 'show', f'HEAD:{path}'], cwd=root)
        checkout = subprocess.check_output(['git', '-c', 'core.autocrlf=true', 'cat-file', '--filters',
                                            f'--path={path}', f'HEAD:{path}'], cwd=root)
        self.assertNotIn(b'\r', checkout, 'Git checkout must keep migration LF even on Windows')
        self.assertEqual(checkout, original, 'Checkout must retain the committed migration bytes')
        self.assertEqual((root / path).read_bytes(), original, 'Working migration must retain immutable V1 bytes')

    def test_only_application_bootstrap_lives_in_service_root(self):
        for service in SERVICES:
            root = BACKEND / f'services/{service}-service/src/main/java/vn/smarttravel/{service}'
            self.assertEqual([p.name for p in root.glob('*.java')], ['ServiceApplication.java'])

    def test_one_top_level_type_per_main_file(self):
        for path in (BACKEND / 'services').glob('*/src/main/java/**/*.java'):
            types = re.findall(r'^(?:public )?(?:final )?(?:class|record|interface|enum) (\w+)',
                               path.read_text(encoding='utf-8'), re.M)
            self.assertEqual(types, [path.stem], str(path))

    def test_feature_layers_do_not_access_database_from_controllers_or_services(self):
        for path in (BACKEND / 'services').glob('*/src/main/java/**/*.java'):
            content = path.read_text(encoding='utf-8')
            if 'controller' in path.parts or 'service' in path.parts:
                self.assertNotRegex(content, r'import org\.springframework\.(?:jdbc|data\.mongodb)', str(path))
                self.assertNotRegex(content, r'"(?:SELECT|INSERT INTO|UPDATE|DELETE FROM)\s', str(path))
            if 'controller' in path.parts:
                self.assertNotRegex(content, r'import .*\.repository\.', str(path))

    def test_security_export_preserves_sources_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'review'
            proposals.sync(output)
            files = list(output.rglob('*.java'))
            self.assertEqual(len(files), 30)
            before = {p: p.read_bytes() for p in files}
            with self.assertRaises(FileExistsError):
                proposals.sync(output)
            self.assertEqual(before, {p: p.read_bytes() for p in files})
        with self.assertRaises(ValueError):
            proposals.sync(BACKEND / 'services')

    def test_scaffold_uses_layout_and_refuses_existing_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            backend = Path(directory) / 'backend'
            platform = backend / 'platform'
            platform.mkdir(parents=True)
            shutil.copyfile(BACKEND / 'platform/scaffold_services.py', platform / 'scaffold_services.py')
            shutil.copytree(BACKEND / 'platform/p00-template/src', platform / 'p00-template/src')
            command = [sys.executable, str(platform / 'scaffold_services.py')]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            for service in SERVICES:
                root = backend / f'services/{service}-service/src/main/java/vn/smarttravel/{service}'
                self.assertTrue((root / 'security/config/SecurityConfiguration.java').exists())
                self.assertTrue((root / 'shared/web/CorrelationFilter.java').exists())
                self.assertEqual([p.name for p in root.glob('*.java')], ['ServiceApplication.java'])
            before = {p: p.read_bytes() for p in (backend / 'services').rglob('*') if p.is_file()}
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(before, {p: p.read_bytes() for p in before})


if __name__ == '__main__':
    unittest.main()
