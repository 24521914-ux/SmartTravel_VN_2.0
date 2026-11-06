import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from p03_candidate import candidate_manifest, candidate_matches


class CandidateManifestTests(unittest.TestCase):
    def test_unreadable_directory_never_yields_a_partial_manifest(self):
        self.write('backend/infra/probe.py')
        def inaccessible(*args, **kwargs):
            kwargs['onerror'](PermissionError('unreadable candidate source'))
        with patch('p03_candidate.os.walk', side_effect=inaccessible):
            with self.assertRaises(PermissionError):
                candidate_manifest(self.root)
            self.assertFalse(candidate_matches({'candidate_sha256': '0' * 64}, self.root))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write(self, name, content='source'):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')
        return path

    def test_all_application_and_build_roots_are_bound(self):
        paths = ['backend/services/pom.xml', 'backend/services/trip-service/pom.xml',
                 'backend/services/trip-service/Dockerfile',
                 'backend/services/trip-service/src/main/java/App.java',
                 'backend/services/trip-service/src/main/resources/db/migration/V1.sql',
                 'backend/services/trip-service/test-local.py',
                 'backend/platform/api-gateway/src/main/java/Gateway.java',
                 'backend/platform/api-gateway/pom.xml',
                 'backend/platform/api-gateway/Dockerfile',
                 'backend/platform/validate_contracts.py',
                 'backend/platform/cloud/compose.tools.yaml', 'backend/contracts/fixtures/places.json',
                 'backend/infra/compose.p01.yaml', 'backend/infra/postgres/01-roles.sh',
                 'backend/.mvn/wrapper/maven-wrapper.properties', 'backend/mvnw', 'backend/.dockerignore',
                 'backend/mvnw.cmd', 'frontend/src/ĐịaĐiểm.tsx',
                 'frontend/src/assets/map.svg', 'frontend/scripts/browser.mjs',
                 'frontend/index.html', 'frontend/package.json', 'frontend/package-lock.json',
                 'frontend/tsconfig.app.json', 'frontend/vite.config.ts',
                 '.github/workflows/p03-tooling.yml', 'plan/P00-DECISIONS.md',
                 'docker-compose.yml', 'docker-compose.local.yml', 'docker-compose.db-ports.yml',
                 '.env.example', '.env.local.example', 'backend/platform/init_env.py']
        for name in paths:
            self.write(name)
        self.assertEqual(set(candidate_manifest(self.root)['files']), set(paths))

    def test_mutation_addition_deletion_invalidate_report(self):
        source = self.write('backend/services/trip-service/src/App.java')
        initial = candidate_manifest(self.root)
        report = {'candidate_sha256': initial['sha256']}
        self.assertTrue(candidate_matches(report, self.root))
        source.write_bytes(b'changed')
        self.assertFalse(candidate_matches(report, self.root))
        source.write_bytes(b'source')
        added = self.write('frontend/src/new.ts')  # Includes untracked additions.
        self.assertFalse(candidate_matches(report, self.root))
        added.unlink()
        self.assertTrue(candidate_matches(report, self.root))
        source.unlink()
        self.assertFalse(candidate_matches(report, self.root))

    def test_secrets_build_outputs_and_evidence_do_not_affect_digest(self):
        self.write('frontend/src/main.ts')
        before = candidate_manifest(self.root)
        for name in ['backend/infra/.env.local', 'backend/infra/secrets.json',
                     'backend/infra/providers/private.key', 'backend/infra/.local/p03/report.json',
                     'backend/infra/__pycache__/p03.pyc',
                     'backend/services/trip-service/target/classes/App.class',
                     'frontend/node_modules/dependency/index.js', 'frontend/dist/app.js',
                     'frontend/.git/config', 'docs/status.md']:
            self.write(name, 'sensitive or generated')
        self.assertEqual(candidate_manifest(self.root), before)

    def test_digest_is_canonical_exact_bytes_and_root_independent(self):
        self.write('frontend/src/z.ts', 'z')
        self.write('frontend/src/a.ts', 'a')
        result = candidate_manifest(self.root)
        files = {'frontend/src/a.ts': hashlib.sha256(b'a').hexdigest(),
                 'frontend/src/z.ts': hashlib.sha256(b'z').hexdigest()}
        canonical = json.dumps(files, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
        self.assertEqual(list(result['files']), list(files))
        self.assertEqual(result['sha256'], hashlib.sha256(canonical.encode('utf-8')).hexdigest())
        with tempfile.TemporaryDirectory() as other:
            for name, content in [('frontend/src/a.ts', b'a'), ('frontend/src/z.ts', b'z')]:
                path = Path(other) / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
            self.assertEqual(candidate_manifest(other), result)
        (self.root / 'frontend/src/a.ts').write_bytes(b'a\r\n')
        self.assertNotEqual(candidate_manifest(self.root)['sha256'], result['sha256'])

    def test_invalid_report_and_empty_candidate_fail_closed(self):
        digest = candidate_manifest(self.root)['sha256']
        for report in [None, [], {}, {'candidate_sha256': digest}]:
            self.assertFalse(candidate_matches(report, self.root))
        self.write('frontend/src/main.ts')
        for report in [{}, {'candidate_sha256': '0' * 64}, {'candidate_sha256': None}]:
            self.assertFalse(candidate_matches(report, self.root))

    def test_source_symlink_cannot_bind_outside_checkout(self):
        source = self.write('frontend/src/main.ts')
        with tempfile.TemporaryDirectory() as other:
            target = Path(other) / 'external.ts'
            target.write_bytes(b'outside')
            try:
                (source.parent / 'linked.ts').symlink_to(target)
            except OSError:
                self.skipTest('Creating symlinks is unavailable on this host')
            with self.assertRaises(ValueError):
                candidate_manifest(self.root)
            self.assertFalse(candidate_matches({'candidate_sha256': '0' * 64}, self.root))


if __name__ == '__main__':
    unittest.main()
