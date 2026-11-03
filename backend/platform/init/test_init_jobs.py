"""Init jobs for the local compose stack: broker topology plan and Identity signing key."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import broker_topology  # noqa: E402
import identity_keys  # noqa: E402

REGISTRY = json.loads((HERE.parents[1] / 'contracts/registry.json').read_text(encoding='utf-8'))
PASSWORDS = {**{s.upper()+'_BROKER_PASSWORD': 'pw-'+s for s in broker_topology.SERVICES},
             'CATALOG_BROKER_OPERATOR_PASSWORD': 'pw-operator'}


class BrokerTopologyTests(unittest.TestCase):
    def setUp(self):
        self.requests = broker_topology.plan(REGISTRY, PASSWORDS)

    def test_only_idempotent_methods_on_one_vhost(self):
        self.assertTrue(all(method in ('PUT', 'POST') for method, _, _ in self.requests))
        self.assertEqual(self.requests[0], ('PUT', 'vhosts/smarttravel', {}))
        for _, path, _ in self.requests[1:]:
            self.assertTrue(path.startswith('users/') or '/smarttravel/' in path, path)

    def test_every_registry_route_is_bound_except_self_consumption(self):
        bindings = {(path, body['routing_key']) for method, path, body in self.requests
                    if method == 'POST' and '/e/' in path and path.endswith('.inbound')}
        expected = set()
        for kind, rule in REGISTRY['messages'].items():
            producers = [rule['producer']] if isinstance(rule['producer'], str) else rule['producer']
            for producer in producers:
                for consumer in rule['consumers']:
                    if producer != consumer:
                        expected.add((f'bindings/smarttravel/e/{producer}.events/e/{consumer}.inbound', kind))
        self.assertEqual(bindings, expected)

    def test_runtime_users_publish_only_their_own_registered_events(self):
        for service in broker_topology.SERVICES:
            events = next(body for method, path, body in self.requests
                          if path == f'topic-permissions/smarttravel/{service}_runtime' and body['exchange'] == service+'.events')
            inbound = next(body for method, path, body in self.requests
                           if path == f'topic-permissions/smarttravel/{service}_runtime' and body['exchange'] == service+'.inbound')
            self.assertEqual(inbound['write'], '^$')
            for kind, rule in REGISTRY['messages'].items():
                producers = [rule['producer']] if isinstance(rule['producer'], str) else rule['producer']
                escaped = kind.replace('.', r'\.').replace('-', r'\-')
                self.assertEqual(escaped in events['write'], service in producers, (service, kind))

    def test_passwords_only_appear_in_their_user_body(self):
        for method, path, body in self.requests:
            text = json.dumps(body)
            for name, value in PASSWORDS.items():
                if value in text:
                    owner = 'catalog_operator' if name.startswith('CATALOG_BROKER_OPERATOR') else name.split('_')[0].lower()+'_runtime'
                    self.assertEqual(path, 'users/'+owner)

    def test_main_refuses_to_run_without_every_password(self):
        env = {'BROKER_ADMIN_PASSWORD': 'admin', **PASSWORDS}
        env.pop('TRIP_BROKER_PASSWORD')
        with mock.patch.dict(os.environ, env, clear=True), self.assertRaises(SystemExit) as raised:
            broker_topology.main()
        self.assertIn('TRIP_BROKER_PASSWORD', str(raised.exception))
        self.assertNotIn('pw-', str(raised.exception))


class IdentityKeyTests(unittest.TestCase):
    def test_generated_key_is_private_rs256_jwk_with_kid(self):
        key = identity_keys.generate('kid-1')['keys'][0]
        self.assertEqual((key['kty'], key['alg'], key['use'], key['kid']), ('RSA', 'RS256', 'sig', 'kid-1'))
        self.assertTrue({'n', 'e', 'd', 'p', 'q', 'dp', 'dq', 'qi'} <= key.keys())

    def test_main_creates_once_and_keeps_existing_key(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'keys' / 'keys.json'
            env = {'IDENTITY_KEYS_FILE': str(path), 'IDENTITY_ACTIVE_KID': 'kid-1'}
            with mock.patch.dict(os.environ, env), mock.patch.object(os, 'chown', create=True):
                identity_keys.main()
                first = path.read_bytes()
                identity_keys.main()
            self.assertEqual(path.read_bytes(), first)

    def test_main_never_replaces_a_key_set_without_the_active_kid(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'keys.json'
            path.write_text(json.dumps(identity_keys.generate('old-kid')), encoding='utf-8')
            before = path.read_bytes()
            env = {'IDENTITY_KEYS_FILE': str(path), 'IDENTITY_ACTIVE_KID': 'new-kid'}
            with mock.patch.dict(os.environ, env), self.assertRaises(SystemExit):
                identity_keys.main()
            self.assertEqual(path.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
