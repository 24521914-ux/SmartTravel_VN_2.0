"""Checksum regression tests for Windows and Linux checkouts."""
import hashlib
import unittest

from validate_contracts import artifact_checksum


class ContractChecksumTests(unittest.TestCase):
    def test_lf_matches_sha256(self):
        data = b'{\n  "revision": "candidate"\n}\n'
        self.assertEqual(artifact_checksum(data), hashlib.sha256(data).hexdigest())

    def test_crlf_and_mixed_line_endings_match_lf(self):
        lf = b'{\n  "revision": "candidate"\n}\n'
        crlf = lf.replace(b'\n', b'\r\n')
        mixed = lf.replace(b'\n', b'\r\n', 1)
        self.assertEqual(artifact_checksum(lf), artifact_checksum(crlf))
        self.assertEqual(artifact_checksum(lf), artifact_checksum(mixed))

    def test_content_and_other_whitespace_changes_are_detected(self):
        original = b'{\n  "revision": "candidate"\n}\n'
        for changed in [
            original.replace(b'candidate', b'changed'),
            original.replace(b'  ', b' '),
            original.rstrip(b'\n'),
            original.replace(b'\n', b'\r'),
        ]:
            with self.subTest(changed=changed):
                self.assertNotEqual(artifact_checksum(original), artifact_checksum(changed))


if __name__ == '__main__':
    unittest.main()
