import unittest
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
from unittest.mock import patch
from p03_gate import ROOT, REQUIRED_CASES, decision
from p03_candidate import candidate_manifest
from p03_scope import DEFERRED_COMPONENTS, NON_AI_E2E_CASES, load_profile


def accepted_reports():
    source = 'backend/infra/p03_gate.py'
    hashes = {source: hashlib.sha256((ROOT / source).read_bytes()).hexdigest()}
    reports = {
        'contracts': {'pass': True},
        'security': {'pass': True, 'full_role_matrix_pass': True},
        'e2e': {'f01_f11_pass': True, 'business_import_ml_pass': True},
        'resilience': {'pass': True, 'reconciliation_pass': True},
        'load': {'evaluation': {'p00_release_gate_pass': True}},
        'restore': {'pass_checks': True, 'application_disaster_recovery_verified': True},
        'frontend': {'checks': [{'status': 'PASS'}], 'gaps': [], 'ai_http_requests': 0, 'page_errors': 0},
        'quality': {'status': 'OFFLINE_METRIC_GATE_PASS', 'owner_lineage_license_reviewed': True},
        'operations': {'runbooks_reviewed': True, 'alert_recipient': 'test-owner', 'critical_high_open': 0,
                       'release_linkage_reviewed': True, 'reviewed_source_hashes': hashes},
        'providers': {'release_scope_coverage_approved': True},
    }
    for report in reports.values():
        report.update(release_id='test-release', timestamp=datetime.now(timezone.utc).isoformat(), source_hashes=copy.copy(hashes))
    candidate = 'a' * 64  # Unit fixture only; production gate always scans source.
    for name, report in reports.items():
        report.update(candidate_sha256=candidate, candidate_before_sha256=candidate)
        if name in REQUIRED_CASES:
            report['checks'] = [{'id': case, 'status': 'PASS', 'evidence': ['unit-test-only']}
                                for case in sorted(REQUIRED_CASES[name])]
    reports['operations']['reviewed_candidate_sha256'] = candidate
    reports['quality'].update(users=100, holdout_interactions=1000, reasons=[],
        metrics={'basic': {'precision_at_10': .1, 'ndcg_at_10': .2},
                 'model': {'precision_at_10': .1, 'ndcg_at_10': .3}})
    profile = json.loads((ROOT / 'backend/contracts/fixtures/load-profile.json').read_text())
    reports['load'].update(metrics={'requests': 600, 'errors': 0, 'skipped_slots': 0,
        'elapsed_seconds': 30, 'actual_rps': 20, 'achieved_virtual_users': 50,
        'status_counts': {'200': 600}, 'error_rate': 0}, authenticated_principals=50,
        dataset_counts={key: profile[key] for key in ('places', 'users', 'reviews', 'trips', 'interactions')},
        class_metrics={name: {'requests': int(600 * fraction), 'errors': 0, 'pass': True, 'p95_ms': 100,
                             'status_counts': {'200': int(600 * fraction)}, 'error_rate': 0}
                       for name, fraction in profile['mix'].items()}, fixture_name_restored=True)
    reports['load']['evaluation']['reasons'] = []
    return reports


class GateTests(unittest.TestCase):
    def test_non_ai_rejects_contradictory_frontend_or_restore_evidence(self):
        for name, field, value in [('frontend', 'ai_http_requests', 1), ('frontend', 'page_errors', 1),
                                   ('frontend', 'ai_http_requests', False), ('restore', 'pending_cases', ['license_revocation']),
                                   ('restore', 'error', 'failed'), ('restore', 'status', 'FAIL')]:
            reports = self.non_ai_reports()
            reports[name][field] = value
            self.assertEqual(decision(reports, 'test-release', scope='non-ai')['status'], 'NO_GO')
        for field in ('deleted_user_state_preserved', 'revoked_storage_license_preserved', 'stale_versions_replayed_with_new_event_ids'):
            reports = self.non_ai_reports()
            reports['restore']['privacy_state_preservation'].pop(field)
            self.assertEqual(decision(reports, 'test-release', scope='non-ai')['status'], 'NO_GO')
    def setUp(self):
        self.candidate_patch = patch('p03_gate.candidate_manifest', return_value={
            'sha256': 'a' * 64, 'files': {'unit-fixture': 'a' * 64}})
        self.candidate_patch.start()
        self.addCleanup(self.candidate_patch.stop)

    def test_actual_candidate_binding_accepts_only_current_fingerprint(self):
        reports = accepted_reports()
        manifest = candidate_manifest()
        for report in reports.values():
            report.update(candidate_sha256=manifest['sha256'], candidate_before_sha256=manifest['sha256'])
        reports['operations']['reviewed_candidate_sha256'] = manifest['sha256']
        with patch('p03_gate.candidate_manifest', return_value=manifest):
            self.assertEqual(decision(reports, 'test-release')['status'], 'SYSTEM_VERIFIED')

    def non_ai_reports(self):
        reports = accepted_reports()
        for report in reports.values():
            report['scope'] = 'non-ai'
        reports['quality'] = dict(reports['quality'], status='DEFERRED',
            deferred_components=sorted(DEFERRED_COMPONENTS), reason='User explicitly deferred AI')
        reports['e2e'].update(non_ai_f_cases_pass=True, business_import_pass=True, non_ai_admin_pass=True,
            checks=[{'id': case, 'status': 'PASS', 'evidence': ['unit-test-only']}
                    for case in sorted(NON_AI_E2E_CASES)])
        for case in reports['resilience']['checks']:
            if case['id'] == 'rating_feature_reconciliation':
                case['id'] = 'rating_reconciliation'
        reports['resilience']['checks'].append({'id': 'slow_consumer_backpressure', 'status': 'PASS', 'evidence': ['unit-test-only']})
        reports['restore']['privacy_state_preservation'] = {'deleted_user_state_preserved': True,
            'revoked_storage_license_preserved': True, 'stale_versions_replayed_with_new_event_ids': 2}
        profile = load_profile(json.loads((ROOT / 'backend/contracts/fixtures/load-profile.json').read_text()), 'non-ai')
        metrics = reports['load']['metrics']
        metrics.update(requests=640, elapsed_seconds=32, status_counts={'200': 640})
        reports['load']['class_metrics'] = {
            name: {'requests': round(640 * fraction), 'errors': 0, 'pass': True, 'p95_ms': 100,
                   'status_counts': {'200': round(640 * fraction)}, 'error_rate': 0}
            for name, fraction in profile['mix'].items()}
        reports['load']['dataset_counts'].pop('interactions')
        return reports

    def test_explicit_non_ai_acceptance_never_authorizes_full_release(self):
        reports = self.non_ai_reports()
        result = decision(reports, 'test-release', scope='non-ai')
        self.assertEqual(result['status'], 'P03_NON_AI_VERIFIED')
        self.assertFalse(result['system_verified'])
        self.assertFalse(result['production_authorized'])
        self.assertFalse(result['p04_authorized_by_gate'])
        self.assertEqual(next(c for c in result['checks'] if c['gate'] == 'quality')['status'], 'DEFERRED')
        self.assertEqual(decision(reports, 'test-release')['status'], 'NO_GO')

    def test_non_ai_scope_requires_every_report_explicitly_scoped(self):
        for name in self.non_ai_reports():
            reports = self.non_ai_reports()
            reports[name].pop('scope')
            with self.subTest(report=name):
                self.assertEqual(decision(reports, 'test-release', scope='non-ai')['status'], 'NO_GO')

    def test_non_ai_does_not_weaken_security_restore_or_resilience(self):
        for name in ('security', 'restore', 'resilience'):
            required = REQUIRED_CASES[name]
            if name == 'resilience':
                required = (required - {'rating_feature_reconciliation'}) | {'rating_reconciliation'}
            for case in required:
                reports = self.non_ai_reports()
                reports[name]['checks'] = [c for c in reports[name]['checks'] if c['id'] != case]
                self.assertEqual(decision(reports, 'test-release', scope='non-ai')['status'], 'NO_GO')

    def test_non_ai_requires_named_e2e_and_real_deferral(self):
        for case in NON_AI_E2E_CASES:
            reports = self.non_ai_reports()
            reports['e2e']['checks'] = [c for c in reports['e2e']['checks'] if c['id'] != case]
            self.assertEqual(decision(reports, 'test-release', scope='non-ai')['status'], 'NO_GO')
        reports = self.non_ai_reports()
        reports['quality']['status'] = 'OFFLINE_METRIC_GATE_PASS'
        self.assertEqual(decision(reports, 'test-release', scope='non-ai')['status'], 'NO_GO')
        reports = self.non_ai_reports()
        reports['load']['class_metrics']['basic_recommendation'] = {'pass': True}
        self.assertEqual(decision(reports, 'test-release', scope='non-ai')['status'], 'NO_GO')

    def test_unknown_scope_fails_closed(self):
        self.assertEqual(decision({}, 'test-release', scope='skip')['status'], 'NO_GO')

    def test_unreadable_candidate_fails_closed(self):
        reports = accepted_reports()
        with patch('p03_gate.candidate_manifest', side_effect=PermissionError('unreadable')):
            self.assertEqual(decision(reports, 'test-release')['status'], 'NO_GO')

    def test_candidate_must_be_unchanged_and_reviewed_for_every_report(self):
        for name in accepted_reports():
            for field in ('candidate_sha256', 'candidate_before_sha256'):
                reports = accepted_reports()
                reports[name][field] = '0' * 64
                with self.subTest(gate=name, field=field):
                    self.assertEqual(decision(reports, 'test-release')['status'], 'NO_GO')

    def test_local_contract_probe_cannot_replace_compatibility_cases(self):
        reports = accepted_reports()
        reports['contracts']['checks'] = [{'file': 'openapi/identity.yaml', 'pass': True}]
        self.assertEqual(decision(reports, 'test-release')['status'], 'NO_GO')

    def test_missing_failed_duplicate_or_unreferenced_cases_fail(self):
        for name in REQUIRED_CASES:
            for mode in ('missing', 'failed', 'duplicate', 'unreferenced'):
                reports = accepted_reports()
                cases = reports[name]['checks']
                if mode == 'missing':
                    cases.pop()
                elif mode == 'failed':
                    cases[0]['pass'] = False
                elif mode == 'duplicate':
                    cases.append(copy.deepcopy(cases[0]))
                else:
                    cases[0]['evidence'] = []
                with self.subTest(gate=name, mode=mode):
                    self.assertEqual(decision(reports, 'test-release')['status'], 'NO_GO')

    def test_quality_summary_cannot_override_failed_measurements(self):
        changes = [{'users': 0}, {'users': True}, {'holdout_interactions': 999},
                   {'reasons': ['REAL_DATA_REQUIRED']}, {'metrics': {}},
                   {'metrics': {'basic': {'precision_at_10': .5, 'ndcg_at_10': .5},
                                'model': {'precision_at_10': .4, 'ndcg_at_10': float('nan')}}}]
        for change in changes:
            reports = accepted_reports()
            reports['quality'].update(change)
            self.assertEqual(decision(reports, 'test-release')['status'], 'NO_GO')

    def test_load_summary_cannot_override_incomplete_or_failed_measurement(self):
        for section, key, value in [('metrics', 'requests', 0), ('metrics', 'errors', 1),
                ('metrics', 'actual_rps', float('nan')), ('metrics', 'elapsed_seconds', 100),
                ('metrics', 'elapsed_seconds', 10 ** 1000),
                ('metrics', 'achieved_virtual_users', 1), ('metrics', 'status_counts', {'503': 600}),
                ('dataset_counts', 'reviews', 0), ('evaluation', 'reasons', ['pending'])]:
            reports = accepted_reports()
            reports['load'][section][key] = value
            self.assertEqual(decision(reports, 'test-release')['status'], 'NO_GO')
        reports = accepted_reports()
        reports['load']['authenticated_principals'] = 1
        self.assertEqual(decision(reports, 'test-release')['status'], 'NO_GO')
        reports = accepted_reports()
        reports['load']['class_metrics']['basic_recommendation']['p95_ms'] = 1001
        self.assertEqual(decision(reports, 'test-release')['status'], 'NO_GO')

    def test_missing_evidence_blocks_release(self):
        self.assertEqual(decision({})['status'], 'NO_GO')
        self.assertFalse(decision({})['p04_authorized_by_gate'])

    def test_green_smoke_reports_cannot_replace_full_gate(self):
        result = decision({'contracts': {'pass': True}, 'security': {'pass': True},
                           'load': {'evaluation': {'local_read_probe_pass': True}},
                           'restore': {'pass_checks': True},
                           'quality': {'status': 'OFFLINE_METRIC_GATE_PASS'}})
        self.assertEqual(result['status'], 'NO_GO')
        self.assertEqual(sum(c['pass'] for c in result['checks']), 0)

    def test_complete_reviewed_evidence_accepts_only_explicit_same_release(self):
        reports = accepted_reports()
        self.assertEqual(decision(reports, 'test-release')['status'], 'SYSTEM_VERIFIED')
        self.assertEqual(decision(reports)['status'], 'NO_GO')
        self.assertEqual(decision(reports, 'another-release')['status'], 'NO_GO')
        for name in reports:
            changed = copy.deepcopy(reports)
            changed[name].pop('release_id')
            self.assertEqual(decision(changed, 'test-release')['status'], 'NO_GO')

    def test_timestamp_stale_future_naive_missing_fail_closed(self):
        for stamp in [None, 'invalid', '2026-01-01T00:00:00',
                      (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
                      (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()]:
            reports = accepted_reports()
            reports['contracts']['timestamp'] = stamp
            with self.subTest(timestamp=stamp):
                self.assertEqual(decision(reports, 'test-release')['status'], 'NO_GO')

    def test_unreviewed_or_changed_source_hashes_fail_closed(self):
        for change in ('unreviewed', 'missing', 'changed', 'outside'):
            reports = accepted_reports()
            if change == 'unreviewed':
                reports['operations']['release_linkage_reviewed'] = False
            elif change == 'missing':
                reports['contracts']['source_hashes'] = {}
            elif change == 'changed':
                reports['contracts']['source_hashes']['backend/infra/p03_gate.py'] = '0' * 64
                reports['operations']['reviewed_source_hashes']['backend/infra/p03_gate.py'] = '0' * 64
            else:
                reports['contracts']['source_hashes'] = {'../outside': '0' * 64}
                reports['operations']['reviewed_source_hashes']['../outside'] = '0' * 64
            with self.subTest(change=change):
                self.assertEqual(decision(reports, 'test-release')['status'], 'NO_GO')

    def test_malformed_report_fails_without_authorizing(self):
        reports = accepted_reports()
        reports['security'] = ['pass']
        self.assertEqual(decision(reports, 'test-release')['status'], 'NO_GO')

    def test_browser_pending_is_not_pass(self):
        result = decision({'frontend': {'checks': [{'status': 'COVERAGE_PENDING'}], 'gaps': []}})
        self.assertFalse(next(c for c in result['checks'] if c['gate'] == 'frontend')['pass'])


if __name__ == '__main__':
    unittest.main()
