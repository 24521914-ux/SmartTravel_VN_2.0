import unittest
from p03_scope import DEFERRED_COMPONENTS, load_profile, quality_deferred


class ScopeTests(unittest.TestCase):
    def test_full_profile_preserved_without_mutation(self):
        original = {'mix': {'catalog_read': .5, 'basic_recommendation': .2, 'trip_read': .15,
                            'authenticated_write': .15}, 'interactions': 50000}
        self.assertEqual(load_profile(original), original)
        scoped = load_profile(original, 'non-ai')
        self.assertEqual(set(scoped['mix']), {'catalog_read', 'trip_read', 'authenticated_write'})
        for name, fraction in {'catalog_read': .625, 'trip_read': .1875, 'authenticated_write': .1875}.items():
            self.assertAlmostEqual(scoped['mix'][name], fraction)
        self.assertNotIn('interactions', scoped)
        self.assertIn('interactions', original)

    def test_unknown_scope_rejected(self):
        with self.assertRaises(ValueError):
            load_profile({}, 'skip')

    def test_deferral_requires_explicit_complete_components_and_reason(self):
        report = {'status': 'DEFERRED', 'deferred_components': sorted(DEFERRED_COMPONENTS),
                  'reason': 'User deferred all AI implementation and quality work'}
        self.assertTrue(quality_deferred(report))
        for change in ({'status': 'PASS'}, {'reason': ''}, {'deferred_components': ['quality']}):
            self.assertFalse(quality_deferred(dict(report, **change)))


if __name__ == '__main__':
    unittest.main()
