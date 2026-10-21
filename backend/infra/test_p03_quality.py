import copy
import unittest
from p03_quality import evaluate, metrics


def sufficient():
    return {'provenance': {'synthetic': False, 'license_reference': 'owner-reviewed-test',
                           'dataset_sha256': 'a' * 64}, 'train_end': '2026-01-01T00:00:00Z',
            'users': [{'user_id': str(i), 'consent': True, 'train_items': ['old'],
                       'holdout': [{'place_id': str(j), 'relevant': j == 0,
                                    'occurred_at': '2026-02-01T00:00:00Z'} for j in range(10)],
                       'basic': [str(j) for j in range(9, -1, -1)],
                       'model': [str(j) for j in range(10)]} for i in range(100)]}


class QualityTests(unittest.TestCase):
    def test_precision_uses_ten_even_for_short_ranking(self):
        self.assertEqual(metrics(['a'], {'a'})['precision_at_10'], .1)

    def test_invalid_training_item_shapes_fail_closed(self):
        for training in ('old', [None], [''], ['old', 'old'], {'old': True}):
            data = sufficient()
            data['users'][0]['train_items'] = training
            with self.subTest(training=training), self.assertRaises(ValueError):
                evaluate(data)

    def test_timezone_offset_boundary_and_minimum_samples(self):
        data = sufficient()
        data['users'][0]['holdout'][0]['occurred_at'] = '2026-01-01T07:00:00+07:00'
        self.assertIn('TRAIN_HOLDOUT_LEAKAGE', evaluate(data)['reasons'])
        data = sufficient()
        data['users'][0]['holdout'].pop()
        self.assertIn('INSUFFICIENT_INTERACTIONS', evaluate(data)['reasons'])

    def test_precision_regression_fails_even_with_better_ndcg(self):
        data = sufficient()
        for user in data['users']:
            user['holdout'][1]['relevant'] = True
            user['model'] = ['0']
        result = evaluate(data)
        self.assertIn('PRECISION_BELOW_BASIC', result['reasons'])
        self.assertGreater(result['metrics']['model']['ndcg_at_10'], result['metrics']['basic']['ndcg_at_10'])

    def test_ideal_ndcg_and_empty_relevance(self):
        self.assertEqual(metrics(['a'], {'a'})['ndcg_at_10'], 1)
        self.assertEqual(metrics(['a'], set())['ndcg_at_10'], 0)

    def test_duplicate_ranking_rejected(self):
        with self.assertRaises(ValueError):
            metrics(['a', 'a'], {'a'})

    def test_metric_pass_never_authorizes_deployment(self):
        result = evaluate(sufficient())
        self.assertEqual(result['status'], 'OFFLINE_METRIC_GATE_PASS')
        self.assertFalse(result['production_activation_authorized'])

    def test_synthetic_and_insufficient_data_pending(self):
        data = sufficient()
        data['provenance']['synthetic'] = True
        data['users'] = data['users'][:1]
        self.assertTrue({'REAL_DATA_REQUIRED', 'INSUFFICIENT_USERS', 'INSUFFICIENT_INTERACTIONS'}
                        <= set(evaluate(data)['reasons']))

    def test_item_and_temporal_leakage(self):
        for change in ('item', 'time'):
            data = sufficient()
            if change == 'item':
                data['users'][0]['train_items'].append('0')
            else:
                data['users'][0]['holdout'][0]['occurred_at'] = data['train_end']
            self.assertIn('TRAIN_HOLDOUT_LEAKAGE', evaluate(data)['reasons'])

    def test_consent_and_equal_baseline_fail(self):
        data = sufficient()
        data['users'][0]['consent'] = False
        for user in data['users']:
            user['model'] = copy.copy(user['basic'])
        reasons = evaluate(data)['reasons']
        self.assertIn('CONSENT_MISSING', reasons)
        self.assertIn('NDCG_IMPROVEMENT_BELOW_0_02', reasons)

    def test_duplicate_users_and_naive_timestamp_rejected(self):
        data = sufficient()
        data['users'][1]['user_id'] = data['users'][0]['user_id']
        with self.assertRaises(ValueError):
            evaluate(data)
        data = sufficient()
        data['train_end'] = '2026-01-01T00:00:00'
        with self.assertRaises(ValueError):
            evaluate(data)


if __name__ == '__main__':
    unittest.main()
