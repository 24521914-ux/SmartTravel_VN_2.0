"""Pure safety checks for isolated application DR; no Docker mutations."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import yaml
import p03_nonai_restore as restore
from p03_environment import LABEL, validate_config


SOURCE = 'smarttravel-p03-load-a1234567'
TARGET = 'smarttravel-p03-load-b1234567'


class RestoreSafetyTests(unittest.TestCase):
    def test_cleanup_refuses_shared_anonymous_keygen_volume(self):
        item = {'Id': 'abc123456', 'Config': {'Labels': {'com.docker.compose.project': TARGET,
                'com.docker.compose.service': 'community-keygen'}}, 'State': {'Running': False},
                'Mounts': [{'Type': 'volume', 'Name': 'anonymous', 'RW': True, 'Destination': '/data/db'}]}
        with patch.object(restore, 'docker', side_effect=[b'abc123', json.dumps([item]).encode(), b'abc123\nother']), \
                patch.object(restore, 'command') as command, self.assertRaises(RuntimeError):
            restore.cleanup_target(TARGET)
        command.assert_not_called()

    def test_cleanup_removes_only_exclusive_owned_stopped_keygen_volume(self):
        item = {'Id': 'abc123456', 'Config': {'Labels': {'com.docker.compose.project': TARGET,
                'com.docker.compose.service': 'community-keygen'}}, 'State': {'Running': False},
                'Mounts': [{'Type': 'volume', 'Name': 'anonymous', 'RW': True, 'Destination': '/data/configdb'}]}
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root/'compose.yaml').write_text(yaml.safe_dump({'name':TARGET,'volumes':{},'services':{}}))
            with patch.object(restore, 'location', return_value=root), \
                    patch.object(restore, 'docker', side_effect=[b'abc123', json.dumps([item]).encode(), b'abc123', b'', b'']) as docker, \
                    patch.object(restore, 'command') as command:
                restore.cleanup_target(TARGET)
            self.assertIn(unittest.mock.call('rm', '-v', 'abc123456'), docker.call_args_list)
            command.assert_called_once_with(TARGET, 'down', '--volumes')

    def test_same_source_target_stops_before_inspection(self):
        with patch.object(restore, 'Environment') as env:
            with self.assertRaises(ValueError): restore.exercise(SOURCE,SOURCE,'test')
            env.assert_not_called()

    def test_existing_target_is_never_reused(self):
        with tempfile.TemporaryDirectory() as root:
            source,target = Path(root)/'source',Path(root)/'target'
            source.mkdir(); target.mkdir()
            sentinel = target/'keep.txt'
            sentinel.write_text('preserve')
            with patch.object(restore,'location',side_effect=lambda p:source if p==SOURCE else target):
                with self.assertRaises(ValueError): restore.clone_config(SOURCE,TARGET)
            self.assertEqual(sentinel.read_text(),'preserve')

    def test_clone_rebinds_named_volumes_and_keys_to_target(self):
        with tempfile.TemporaryDirectory() as root:
            source,target = Path(root)/'source',Path(root)/'target'
            source.mkdir()
            for name in ('keys.json','secrets.json'):
                (source/name).write_text(json.dumps({'synthetic':True}))
            cfg = {'name':SOURCE,'volumes':{'identity-data':{'name':SOURCE+'_identity-data'}},
                'services':{'identity':{'volumes':['identity-data:/data',source.as_posix()+'/keys.json:/run/keys.json:ro']}}}
            (source/'compose.yaml').write_text(yaml.safe_dump(cfg))
            with patch.object(restore,'location',side_effect=lambda p:source if p==SOURCE else target), patch.object(restore,'docker',return_value=b''):
                cloned = restore.clone_config(SOURCE,TARGET)
            self.assertEqual(cloned['name'],TARGET)
            self.assertEqual(cloned['volumes']['identity-data']['name'],TARGET+'_identity-data')
            self.assertEqual(cloned['volumes']['identity-data']['labels'][LABEL],TARGET)
            self.assertEqual(cloned['services']['identity']['labels'][LABEL],TARGET)
            self.assertIn(target.as_posix()+'/keys.json:/run/keys.json:ro',cloned['services']['identity']['volumes'])
            self.assertEqual(yaml.safe_load((source/'compose.yaml').read_text()),cfg)
            validate_config(cloned,TARGET)

    def test_shared_volume_and_writable_host_mount_forbidden(self):
        for volumes,mounts in [({'data':{'name':'smarttravel-p02_identity-data'}},['data:/data']),
                               ({'data':{'name':TARGET+'_data','external':True}},['data:/data']),
                               ({},['D:/shared:/data'])]:
            cfg = {'name':TARGET,'volumes':volumes,'services':{'db':{'volumes':mounts}}}
            with self.assertRaises(ValueError): validate_config(cfg,TARGET)


if __name__ == '__main__': unittest.main()
