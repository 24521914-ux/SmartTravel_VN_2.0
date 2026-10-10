"""Regression for the Identity DB-test runner's Linux/Windows Maven invocation."""
import importlib.util
from pathlib import Path
import os
import subprocess
import tempfile
import unittest

BACKEND = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('identity_test_runner',
                                            BACKEND / 'services/identity-service/test-local.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class IdentityRunnerTests(unittest.TestCase):
    def test_posix_invokes_wrapper_through_bash(self):
        self.assertEqual(runner.maven_command(windows=False), ['bash', str(BACKEND / 'mvnw')])

    def test_windows_invokes_cmd_wrapper(self):
        self.assertEqual(runner.maven_command(windows=True), [str(BACKEND / 'mvnw.cmd')])

    @unittest.skipIf(os.name == 'nt', 'POSIX permissions/process launch is exercised on Linux CI')
    def test_posix_runs_non_executable_wrapper_with_spaces_in_path(self):
        with tempfile.TemporaryDirectory(prefix='identity runner ') as directory:
            root = Path(directory)
            (root / 'backend').mkdir()
            wrapper = root / 'backend/mvnw'
            wrapper.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n', encoding='utf-8')
            wrapper.chmod(0o644)
            original = runner.ROOT
            try:
                runner.ROOT = root
                result = subprocess.run(runner.maven_command(windows=False) + ['-B', 'verify'],
                                        capture_output=True, text=True)
            finally:
                runner.ROOT = original
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.splitlines(), ['-B', 'verify'])


if __name__ == '__main__':
    unittest.main()
