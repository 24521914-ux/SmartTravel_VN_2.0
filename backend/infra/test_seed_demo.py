"""Offline regressions for demo identity selection and opt-in provider payloads."""
import json
import threading
import unittest
from unittest.mock import Mock
from http.server import ThreadingHTTPServer
from urllib.request import urlopen

from providers.source_sandbox import Source
from seed_demo import Demo, rid, legacy_test_place


class DemoIdentityTest(unittest.TestCase):
    def test_legacy_detection_keeps_named_destinations(self):
        for name in ['P03 isolated review 1793371440334', 'P03 stalled consumer aa44b067', 'P02 source 62839f0f', 'Integration places 1793335']:
            self.assertTrue(legacy_test_place({'name': name}), name)
        for name in ['Hồ Hoàn Kiếm', 'Bãi biển Mỹ Khê', 'Phố cổ Hội An', 'Vịnh Hạ Long']:
            self.assertFalse(legacy_test_place({'name': name}), name)

    def test_child_identity_wins_over_foreign_keys(self):
        for field, foreign in [('item_id', 'place_id'), ('segment_id', 'destination_id'),
                               ('transfer_id', 'trip_id'), ('claim_id', 'business_id'),
                               ('review_id', 'place_id'), ('job_id', 'source_id'),
                               ('change_request_id', 'claim_id')]:
            with self.subTest(field=field):
                self.assertEqual(rid({field: 'child', foreign: 'parent'}), 'child')

    def test_report_identity_is_not_its_parent_review(self):
        self.assertEqual(rid({'request_id': 'report', 'review_id': 'parent-review'}), 'report')

    def test_missing_identity_fails(self):
        with self.assertRaises(StopIteration):
            rid({'name': 'Địa điểm chưa có ID'})

    def test_tracked_manual_edits_are_returned_without_mutation(self):
        demo = Demo.__new__(Demo)
        demo.state = {'collection:owned': {'collection_id': 'owned', 'name': 'Original'}}
        demo.rows = Mock(return_value=[{'collection_id': 'owned', 'name': 'User changed this'}])
        demo.call = Mock()
        row = demo.ensure('collection:owned', 'community', '/me/collections', '/me/collections', {'name': 'Original'})
        self.assertEqual(row['name'], 'User changed this')
        demo.call.assert_not_called()

    def test_deleted_tracked_record_is_not_recreated(self):
        demo = Demo.__new__(Demo)
        demo.state = {'collection:owned': {'collection_id': 'owned'}}
        demo.rows = Mock(return_value=[])
        demo.call = Mock()
        with self.assertRaisesRegex(RuntimeError, 'removed'):
            demo.ensure('collection:owned', 'community', '/me/collections', '/me/collections', {'name': 'Original'})
        demo.call.assert_not_called()


class DemoProviderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Source)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def fetch(self, run):
        with urlopen(f'http://127.0.0.1:{self.server.server_port}/records?run={run}', timeout=5) as response:
            return json.load(response)

    def test_demo_has_named_valid_and_invalid_records(self):
        body = self.fetch('demo-vietnam')
        self.assertEqual(body['checkpoint'], 'demo-vietnam-v1')
        self.assertEqual([r['name'] for r in body['records'][:3]],
                         ['Bán đảo Sơn Trà', 'Bãi biển Mỹ Khê', 'Làng gốm Thanh Hà'])
        self.assertEqual(len({r['external_id'] for r in body['records']}), 4)
        self.assertGreater(body['records'][-1]['latitude'], 90)
        self.assertTrue(all(r['currency'] == 'VND' for r in body['records']))

    def test_original_integration_feed_unchanged(self):
        body = self.fetch('existing-integration')
        self.assertEqual(body['checkpoint'], 'p02-source-v1')
        self.assertEqual(len(body['records']), 1)
        self.assertEqual(body['records'][0]['external_id'], 'p02-external-1')
        self.assertEqual(body['records'][0]['name'], 'P02 source existing-integration')


if __name__ == '__main__':
    unittest.main()
