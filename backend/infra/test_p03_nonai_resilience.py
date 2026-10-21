import unittest
import json
from unittest.mock import Mock, call
from jsonschema import Draft202012Validator, FormatChecker

from p03_nonai_resilience import ROOT, disrupted, paused, wait_for_catalog_read, recovery_item_body


class CatalogRecoveryTests(unittest.TestCase):
    def test_saved_place_fixture_matches_the_frozen_request_contract(self):
        contract = json.loads((ROOT / 'backend/contracts/openapi/community.yaml').read_text(encoding='utf-8'))
        schema = contract['paths']['/api/v1/collections/{collection_id}/items']['post']['requestBody']['content']['application/json']['schema']
        Draft202012Validator(schema, format_checker=FormatChecker()).validate(
            recovery_item_body('10000000-0000-4000-8000-000000000001'))

    def test_transient_unavailability_retries_only_reads_with_a_bound(self):
        probe = Mock(side_effect=[(503, {}, {}), (504, {}, {}),
                                  (200, {'items': [{'place_id': 'saved-place'}]}, {})])
        def poll(read, predicate, label, seconds):
            self.assertEqual(seconds, 30)
            self.assertFalse(predicate(read()))
            self.assertFalse(predicate(read()))
            self.assertTrue(predicate(read()))
        wait_for_catalog_read('/collection/items', 'synthetic-token', 'saved-place', probe, poll)
        self.assertEqual(probe.call_count, 3)
        self.assertTrue(all(c.args[2] == 'GET' for c in probe.call_args_list))

    def test_auth_and_wrong_saved_data_fail_without_retrying_a_mutation(self):
        for response in [(401, {}, {}), (200, {'items': []}, {})]:
            probe = Mock(return_value=response)
            def poll(read, predicate, label, seconds):
                read()
            with self.assertRaises(AssertionError):
                wait_for_catalog_read('/collection/items', 'synthetic-token', 'saved-place', probe, poll)
            probe.assert_called_once()

    def test_permanent_outage_keeps_poll_deadline_failure(self):
        def poll(read, predicate, label, seconds):
            self.assertFalse(predicate(read()))
            raise AssertionError('Integration deadline: ' + label)
        with self.assertRaisesRegex(AssertionError, 'Integration deadline'):
            wait_for_catalog_read('/collection/items', 'synthetic-token', 'saved-place',
                                  Mock(return_value=(503, {}, {})), poll)


class OutageCleanupTests(unittest.TestCase):
    def test_pause_failure_and_body_failure_both_attempt_unpause(self):
        for partial_failure in (True, False):
            operation = Mock(side_effect=[RuntimeError('partial pause'), None]) if partial_failure else Mock()
            with self.assertRaises(RuntimeError):
                with paused('community', compose=operation):
                    raise RuntimeError('exercise failed')
            self.assertEqual(operation.call_args_list, [call('pause', 'community'), call('unpause', 'community')])
    def test_partial_stop_failure_still_restarts_and_checks_readiness(self):
        operation = Mock(side_effect=[RuntimeError('Docker timed out after stop'), None])
        ready = Mock()
        with self.assertRaisesRegex(RuntimeError, 'Docker timed out'):
            with disrupted(operation, 'catalog', ready=ready):
                self.fail('Body must not execute after failed disruption')
        self.assertEqual(operation.call_args_list, [call('stop', 'catalog'), call('start', 'catalog')])
        ready.assert_called_once_with()

    def test_failed_exercise_restarts_killed_consumer_before_propagating(self):
        operation, ready = Mock(), Mock()
        with self.assertRaisesRegex(AssertionError, 'measurement failed'):
            with disrupted(operation, 'community', action='kill', ready=ready):
                raise AssertionError('measurement failed')
        self.assertEqual(operation.call_args_list, [call('kill', 'community'), call('start', 'community')])
        ready.assert_called_once_with()

    def test_success_still_restores_service_and_waits_for_readiness(self):
        operation, ready = Mock(), Mock()
        with disrupted(operation, 'identity-broker', ready=ready):
            operation.assert_called_once_with('stop', 'identity-broker')
            ready.assert_not_called()
        operation.assert_has_calls([call('stop', 'identity-broker'), call('start', 'identity-broker')])
        ready.assert_called_once_with()

    def test_restart_failure_never_returns_success(self):
        operation = Mock(side_effect=[None, RuntimeError('restart failed')])
        with self.assertRaisesRegex(RuntimeError, 'restart failed'):
            with disrupted(operation, 'catalog', ready=Mock()):
                pass


if __name__ == '__main__':
    unittest.main()
