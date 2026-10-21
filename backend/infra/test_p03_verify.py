import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from p03_verify import archive_report, class_metrics, concrete_path, contract_digest, evaluate, load, metrics, mixed_evaluation, percentile, sanitized_error, traffic_class


class VerificationTests(unittest.TestCase):
    def test_status_counts_and_sanitized_details_exclude_private_fields(self):
        measured = metrics([(200, 1), (503, 5), (0, 9), (503, 7)], 1, {0}, 1, 4, 0)
        self.assertEqual({'200': 1, '503': 2, '0': 1}, measured['status_counts'])
        trace = '12345678-1234-1234-1234-123456789012'
        detail = sanitized_error('basic_recommendation', 503,
            {'code': 'DEPENDENCY_UNAVAILABLE', 'traceId': trace, 'message': 'private', 'token': 'private'})
        self.assertEqual({'traffic_class': 'basic_recommendation', 'status': 503, 'code': 'DEPENDENCY_UNAVAILABLE', 'traceId': trace}, detail)
        self.assertEqual({'traffic_class': 'catalog_read', 'status': 500},
                         sanitized_error('catalog_read', 500, {'code': 'user@example.invalid', 'traceId': 'secret'}))

    def test_mixed_aggregate_above_read_budget_uses_each_class_budget(self):
        profile = {'concurrent_users': 50, 'target_requests_per_second': 20,
                   'latency_target_ms': {'read_p95': 500, 'write_p95': 800, 'basic_recommendation_p95': 1000}}
        values = {'catalog_read': 100, 'trip_read': 100, 'authenticated_write': 700, 'basic_recommendation': 900}
        samples = [(traffic_class(slot), 200, values[traffic_class(slot)]) for slot in range(600)]
        measured = metrics([(status, latency) for _, status, latency in samples], 30, set(range(50)), 6, 600, 0)
        classes = class_metrics(samples, profile)
        result = mixed_evaluation(measured, classes, profile, 200)
        self.assertTrue(result['local_mixed_probe_pass'])
        self.assertFalse(result['p00_release_gate_pass'])
        self.assertNotIn('Read p95 target not met', result['reasons'])
        self.assertEqual({'200': 120}, classes['basic_recommendation']['status_counts'])
        samples[10] = ('basic_recommendation', 503, 900)
        classes = class_metrics(samples, profile)
        measured = metrics([(status, latency) for _, status, latency in samples], 30, set(range(50)), 6, 600, 0)
        self.assertFalse(mixed_evaluation(measured, classes, profile, 200)['local_mixed_probe_pass'])
        self.assertEqual(1, classes['basic_recommendation']['status_counts']['503'])

    def test_archive_preserves_raw_failed_report_before_new_measurement(self):
        with TemporaryDirectory() as folder:
            path = Path(folder) / 'mix-load.json'
            original = b'{"pass":false,"errors":3}'
            path.write_bytes(original)
            archive = archive_report(path)
            path.write_bytes(b'{"pass":true}')
            second = archive_report(path)
            self.assertEqual(original, archive.read_bytes())
            self.assertNotEqual(archive, second)
            self.assertEqual(second, archive_report(path))

    def test_worker_failure_restores_fixture_name_in_finally(self):
        responses = [(200, {'access_token': 'synthetic-token'}, {}),
                     (200, {'display_name': 'Original', 'version': 1}, {}),
                     (200, {'display_name': 'Concurrent fixture', 'version': 2}, {}),
                     (200, {'display_name': 'Original', 'version': 3}, {})]
        with patch('p03_verify.request', side_effect=responses) as mocked, \
                patch('p03_verify.prepare', return_value={'IDENTITY_FIXTURE_PASSWORD': 'synthetic'}), \
                patch('p03_verify.probe', side_effect=RuntimeError('injected worker failure')):
            with self.assertRaisesRegex(RuntimeError, 'injected worker failure'):
                load(.1, True)
        restored = mocked.call_args
        self.assertEqual(restored.args[2], 'PATCH')
        self.assertEqual(restored.args[3], {'display_name': 'Original'})
        self.assertEqual(restored.args[5]['If-Match'], '"2"')

    def test_mix_exact_proportions_and_class_budgets(self):
        kinds = [traffic_class(slot) for slot in range(600)]
        self.assertEqual([kinds.count(kind) for kind in ['catalog_read', 'basic_recommendation', 'trip_read', 'authenticated_write']], [300, 120, 90, 90])
        profile = {'latency_target_ms': {'read_p95': 500, 'write_p95': 800, 'basic_recommendation_p95': 1000}}
        measured = class_metrics([(kind, 200, 100) for kind in kinds], profile)
        self.assertTrue(all(v['pass'] for v in measured.values()))
        bad = class_metrics([('authenticated_write', 200, 800), ('catalog_read', 503, 10)], profile)
        self.assertFalse(bad['authenticated_write']['pass'])
        self.assertFalse(bad['catalog_read']['pass'])
        self.assertFalse(bad['basic_recommendation']['pass'])

    def test_windows_line_endings_do_not_invalidate_text_contract(self):
        self.assertEqual(contract_digest(b'a\nb\n'), contract_digest(b'a\r\nb\r\n'))
        self.assertNotEqual(contract_digest(b'a\nb\n'), contract_digest(b'a\nc\n'))

    def test_percentile_is_nearest_rank_and_includes_failed_latency(self):
        self.assertIsNone(percentile([]))
        self.assertEqual(19, percentile(list(range(1, 21))))
        measured = metrics([(200, 10), (503, 900)], 2, {0, 1}, 2, 2, 0)
        self.assertEqual(900, measured['p95_ms'])
        self.assertEqual(.5, measured['error_rate'])
        self.assertEqual(1, measured['actual_rps'])

    def test_small_scope_never_satisfies_release_gate(self):
        measured = metrics([(200, 20)] * 600, 30, set(range(50)), 2, 600, 0)
        profile = {'latency_target_ms': {'read_p95': 500}, 'target_requests_per_second': 20, 'concurrent_users': 50}
        result = evaluate(measured, profile)
        self.assertTrue(result['local_read_probe_pass'])
        self.assertFalse(result['p00_release_gate_pass'])
        self.assertEqual(2, len(result['reasons']))
        self.assertTrue(evaluate(measured, profile, True, True)['p00_release_gate_pass'])

    def test_errors_insufficient_users_and_backpressure_fail(self):
        profile = {'latency_target_ms': {'read_p95': 500}, 'target_requests_per_second': 20, 'concurrent_users': 50}
        measured = metrics([(0, 1000)], 30, {0}, 1, 600, 599)
        result = evaluate(measured, profile, True, True)
        self.assertFalse(result['local_read_probe_pass'])
        self.assertEqual(5, len(result['reasons']))

    def test_path_uses_valid_nonexistent_uuid_for_each_parameter(self):
        resolved = concrete_path('/trips/{trip_id}/days/{day_id}')
        self.assertNotIn('{', resolved)
        self.assertEqual(2, resolved.count('00000000-0000-0000-0000-000000000000'))


if __name__ == '__main__':
    unittest.main()
