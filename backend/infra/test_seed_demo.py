"""Offline regressions for demo identity selection and opt-in provider payloads."""
import json
import threading
import unittest
from unittest.mock import Mock
from http.server import ThreadingHTTPServer
from urllib.request import urlopen

from providers.source_sandbox import Source
from seed_demo import (ACCOUNT_FIXTURES, PLACE_DESCRIPTIONS, REVIEW_FIXTURES, VERIFICATION_BASELINE_KEY,
                       TOURISM_AREAS, tourism_scope_update,
                       Demo, manifest_entries, rid, is_seed_review, legacy_test_place, normalize_mongo_json,
                       validate_account_identity)


class DemoIdentityTest(unittest.TestCase):
    def test_tourism_scopes_cover_every_public_fixture_once(self):
        names = [name for _, _, _, places in TOURISM_AREAS for name in places]
        self.assertEqual(set(names), set(PLACE_DESCRIPTIONS))
        self.assertEqual(len(names), len(set(names)))
        self.assertEqual(len({province for province, *_ in TOURISM_AREAS}), 6)
        self.assertGreater(sum(province == 'Đà Nẵng' for province, *_ in TOURISM_AREAS), 1)

    def test_tourism_scope_migration_is_idempotent_and_preserves_manual_moves(self):
        self.assertEqual(tourism_scope_update({'geographic_unit_id': 'province'}, 'province', 'area'),
                         {'geographic_unit_id': 'area'})
        self.assertEqual(tourism_scope_update({'geographic_unit_id': 'area'}, 'province', 'area'), {})
        with self.assertRaisesRegex(RuntimeError, 'changed manually'):
            tourism_scope_update({'geographic_unit_id': 'user-chosen-scope'}, 'province', 'area')

    def test_fixture_content_covers_manual_search_and_rating_cases(self):
        self.assertEqual(len(PLACE_DESCRIPTIONS), 29)
        self.assertEqual(len(set(PLACE_DESCRIPTIONS.values())), 29)
        self.assertEqual(len(REVIEW_FIXTURES), 28)
        self.assertEqual({rating for rating, _ in REVIEW_FIXTURES}, {1, 2, 3, 4, 5})
        self.assertEqual(len({content for _, content in REVIEW_FIXTURES}), 28)
        self.assertTrue(all(len(content) > 60 and 'P03 test' not in content for _, content in REVIEW_FIXTURES))

    def test_account_fixtures_have_independent_empty_and_destructive_users(self):
        accounts = {account['alias']: account for account in ACCOUNT_FIXTURES}
        self.assertTrue({'new-user', 'password-change', 'delete-account'} <= set(accounts))
        self.assertEqual(len({account['email'] for account in ACCOUNT_FIXTURES}), len(ACCOUNT_FIXTURES))
        self.assertTrue(all(account['email'].endswith('@demo.smarttravel.invalid') for account in ACCOUNT_FIXTURES))
        for alias in ('new-user', 'password-change', 'delete-account'):
            self.assertEqual(accounts[alias]['roles'], ['USER'])

    def test_deleted_tracked_account_is_not_recreated(self):
        with self.assertRaisesRegex(RuntimeError, 'refusing to recreate'):
            validate_account_identity('lan', {'user_id': 'old-id'}, [])

    def test_changed_account_identity_is_not_silently_reused(self):
        with self.assertRaisesRegex(RuntimeError, 'identity changed'):
            validate_account_identity('lan', {'user_id': 'old-id'}, [{'user_id': 'new-id'}])

    def test_untracked_review_adoption_requires_an_exact_seed_signature(self):
        current = {'rating': 3, 'content': 'Nội dung đã biên tập riêng.', 'status': 'PENDING'}
        self.assertTrue(is_seed_review(current, 3, 'Nội dung đã biên tập riêng.'))
        self.assertFalse(is_seed_review({**current, 'content': 'Đánh giá do người dùng tự viết.'},
                                        3, 'Nội dung đã biên tập riêng.'))
        self.assertFalse(is_seed_review({**current, 'status': 'APPLYING'}, 3, 'Nội dung đã biên tập riêng.'))

    def test_historical_review_signature_is_recognized_for_safe_migration(self):
        legacy = {'rating': 4, 'content': 'Bản seed cũ.', 'status': 'APPROVED'}
        self.assertTrue(is_seed_review(legacy, 5, 'Nội dung mới.', 4, 'Bản seed cũ.'))
        self.assertFalse(is_seed_review(legacy, 5, 'Nội dung mới.', 4, 'Một nội dung khác.'))

    def test_mongosh_bson_long_encoding_is_normalized_for_if_match(self):
        self.assertEqual(normalize_mongo_json({'version': {'high': 0, 'low': 7, 'unsigned': False}}),
                         {'version': 7})
        self.assertEqual(normalize_mongo_json({'version': {'high': -1, 'low': -1, 'unsigned': False}}),
                         {'version': -1})

    def test_verification_baseline_marker_is_not_counted_as_a_business_request(self):
        state = {VERIFICATION_BASELINE_KEY: {'verified_at': 'opaque'},
                 'verification:business-a': {'request_id': 'request-a'}}
        self.assertEqual(manifest_entries(state, 'verification:'),
                         [('verification:business-a', {'request_id': 'request-a'})])

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
