import unittest
import tempfile
import json
import hashlib
import subprocess
import time
from unittest.mock import patch
from pathlib import Path
from p03_restore import canonical_schema,docker, guard_resource, resume_directory, check_backup, LABEL, ARTIFACT_NAMES, SERVICES


class RestoreSafetyTests(unittest.TestCase):
    def test_timeout_command_credentials_never_exposed(self):
        with patch('p03_restore.subprocess.run',side_effect=subprocess.TimeoutExpired(['docker','run','-e','PASSWORD=SECRET_VALUE'],300)):
            with self.assertRaises(RuntimeError) as error: docker('run','-e','PASSWORD=SECRET_VALUE')
            self.assertNotIn('SECRET_VALUE',str(error.exception))
            self.assertIsNone(error.exception.__cause__)
            self.assertTrue(error.exception.__suppress_context__)

    def test_database_error_payload_never_exposed(self):
        result=subprocess.CompletedProcess([],1,b'SECRET_VALUE',b'pg_restore: ERROR: invalid row SECRET_VALUE')
        with patch('p03_restore.subprocess.run',return_value=result):
            with self.assertRaises(RuntimeError) as error:
                docker('exec','container','pg_restore')
            self.assertNotIn('SECRET_VALUE',str(error.exception))
            self.assertNotIn('row',str(error.exception))
            self.assertEqual(str(error.exception),'Docker exec failed (exit 1)')

    def resource(self):
        return dict(Name='/smarttravel-p03-restore-abc-identity',Config=dict(Labels={LABEL:'abc'}),Mounts=[dict(Type='volume',Name='restore-data')])

    def test_owned_isolated_resource(self):
        guard_resource(self.resource(),'abc',{'smarttravel-p02_identity-data'})

    def test_original_mount_rejected(self):
        item=self.resource(); item['Mounts'][0]['Name']='original'
        with self.assertRaises(RuntimeError): guard_resource(item,'abc',{'original'})

    def test_foreign_label_rejected(self):
        with self.assertRaises(RuntimeError): guard_resource(self.resource(),'other',set())

    def test_original_name_rejected(self):
        item=self.resource(); item['Name']='smarttravel-p02-identity-db-1'
        with self.assertRaises(RuntimeError): guard_resource(item,'abc',set())

    def test_volume_overlap_rejected(self):
        name='smarttravel-p03-restore-abc-identity'
        with self.assertRaises(RuntimeError): guard_resource(dict(Name=name,Labels={LABEL:'abc'}),'abc',{name})

    def test_resume_outside_private_root_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'private';root.mkdir()
            with self.assertRaises(RuntimeError): resume_directory(tmp,root)

    def test_resume_missing_checkpoint_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(RuntimeError): resume_directory(tmp,tmp)

    def test_resume_inside_private_root_with_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            run=Path(tmp)/'run';run.mkdir();(run/'checkpoint.json').write_text('{}')
            self.assertEqual(resume_directory(run,tmp),run.resolve())

    def checkpoint(self,root):
        run=Path(root)/'run';run.mkdir()
        for name in ARTIFACT_NAMES: (run/name).write_bytes(b'private-test-data')
        manifest=dict(source={s:{} for s in SERVICES},checkpoint_epoch=time.time(),
                      artifacts_sha256={name:hashlib.sha256((run/name).read_bytes()).hexdigest() for name in ARTIFACT_NAMES})
        (run/'checkpoint.json').write_text(json.dumps(manifest))
        return run,manifest

    def test_full_backup_integrity(self):
        with tempfile.TemporaryDirectory() as tmp:
            run,_=self.checkpoint(tmp)
            self.assertEqual(check_backup(run,tmp)[0],run.resolve())

    def test_corrupted_artifact_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            run,_=self.checkpoint(tmp);(run/'identity.dump').write_bytes(b'corrupt')
            with self.assertRaises(RuntimeError): check_backup(run,tmp)

    def test_missing_artifact_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            run,_=self.checkpoint(tmp);(run/'trip.tar').unlink()
            with self.assertRaises(RuntimeError): check_backup(run,tmp)

    def test_manifest_omitted_hash_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            run,manifest=self.checkpoint(tmp);del manifest['artifacts_sha256']['community.dump']
            (run/'checkpoint.json').write_text(json.dumps(manifest))
            with self.assertRaises(RuntimeError): check_backup(run,tmp)

    def test_missing_checkpoint_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            run,_=self.checkpoint(tmp);(run/'checkpoint.json').unlink()
            with self.assertRaises(RuntimeError): check_backup(run,tmp)

    def test_invalid_checkpoint_timestamps_rejected(self):
        for timestamp in [False,float('nan'),float('inf'),time.time()+3600,time.time()-86401]:
            with self.subTest(timestamp=timestamp),tempfile.TemporaryDirectory() as tmp:
                run,manifest=self.checkpoint(tmp);manifest['checkpoint_epoch']=timestamp
                (run/'checkpoint.json').write_text(json.dumps(manifest))
                with self.assertRaises(RuntimeError): check_backup(run,tmp)

    def test_schema_only_random_restriction_tokens_removed(self):
        source=b'-- schema\n\\restrict source-token\nCREATE TABLE t (id int);\n\\unrestrict source-token\n'
        target=source.replace(b'source-token',b'target-token')
        self.assertEqual(canonical_schema(source),canonical_schema(target))
        self.assertIn(b'CREATE TABLE',canonical_schema(source))


if __name__=='__main__': unittest.main()
