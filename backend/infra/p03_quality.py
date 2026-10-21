"""Offline P00 holdout evaluator; never deploys a model or grants data rights.

Input JSON: provenance {synthetic, license_reference, dataset_sha256},
train_end and users [{user_id, consent, train_items, holdout:
[{place_id, relevant, occurred_at}], basic:[place_id], model:[place_id]}].
IDs must be pseudonymous. Rankings must come from the recorded frozen models,
using pre-cutoff features. These attestations require owner review separately.
"""
import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from p03_candidate import candidate_manifest


def timestamp(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Evaluation timestamps must include timezone')
    return result


def metrics(ranking, relevant):
    if not isinstance(ranking, list) or any(not isinstance(v, str) or not v for v in ranking):
        raise ValueError('Rankings require nonempty string IDs')
    if len(ranking) != len(set(ranking)):
        raise ValueError('Duplicate recommendation ID')
    hits = [int(item in relevant) for item in ranking[:10]]
    dcg = sum(hit / math.log2(index + 2) for index, hit in enumerate(hits))
    ideal = sum(1 / math.log2(index + 2) for index in range(min(10, len(relevant))))
    return {'precision_at_10': sum(hits) / 10,
            'ndcg_at_10': dcg / ideal if ideal else 0.0}


def evaluate(data):
    reasons = []
    provenance = data.get('provenance', {})
    if provenance.get('synthetic') is not False:
        reasons.append('REAL_DATA_REQUIRED')
    if not isinstance(provenance.get('license_reference'), str) or not provenance['license_reference'].strip():
        reasons.append('LICENSE_REVIEW_REQUIRED')
    checksum = provenance.get('dataset_sha256', '')
    if not isinstance(checksum, str) or len(checksum) != 64 or any(c not in '0123456789abcdef' for c in checksum):
        reasons.append('DATASET_CHECKSUM_REQUIRED')
    cutoff = timestamp(data['train_end'])
    users = data['users']
    if not isinstance(users, list):
        raise ValueError('users must be an array')
    identifiers = set()
    valid_users = 0
    interactions = 0
    totals = {name: {'precision_at_10': 0.0, 'ndcg_at_10': 0.0} for name in ('basic', 'model')}
    for user in users:
        identifier = user['user_id']
        if not isinstance(identifier, str) or not identifier or identifier in identifiers:
            raise ValueError('User IDs must be unique nonempty pseudonymous strings')
        identifiers.add(identifier)
        if user.get('consent') is not True:
            reasons.append('CONSENT_MISSING')
            continue
        held = user['holdout']
        if not isinstance(held, list) or not held:
            reasons.append('EMPTY_HOLDOUT')
            continue
        training = user['train_items']
        if (not isinstance(training, list) or any(not isinstance(item, str) or not item for item in training)
                or len(training) != len(set(training))):
            raise ValueError('Training items require an array of unique nonempty string IDs')
        train_items = set(training)
        held_ids = set()
        relevant = set()
        for event in held:
            item = event['place_id']
            if not isinstance(item, str) or not item or item in held_ids:
                raise ValueError('Holdout requires unique nonempty item IDs per user')
            held_ids.add(item)
            if item in train_items or timestamp(event['occurred_at']) <= cutoff:
                reasons.append('TRAIN_HOLDOUT_LEAKAGE')
            if type(event['relevant']) is not bool:
                raise ValueError('Holdout relevance must be boolean')
            if event['relevant']:
                relevant.add(item)
        if not relevant:
            reasons.append('NO_RELEVANT_HOLDOUT')
        for name in totals:
            measured = metrics(user[name], relevant)
            for key, value in measured.items():
                totals[name][key] += value
        valid_users += 1
        interactions += len(held)
    for measured in totals.values():
        for key in measured:
            measured[key] /= max(1, valid_users)
    if valid_users < 100:
        reasons.append('INSUFFICIENT_USERS')
    if interactions < 1000:
        reasons.append('INSUFFICIENT_INTERACTIONS')
    if totals['model']['ndcg_at_10'] + 1e-12 < totals['basic']['ndcg_at_10'] + .02:
        reasons.append('NDCG_IMPROVEMENT_BELOW_0_02')
    if totals['model']['precision_at_10'] + 1e-12 < totals['basic']['precision_at_10']:
        reasons.append('PRECISION_BELOW_BASIC')
    return {'status': 'QUALITY_PENDING' if reasons else 'OFFLINE_METRIC_GATE_PASS',
            'users': valid_users, 'holdout_interactions': interactions,
            'metrics': totals, 'reasons': sorted(set(reasons)),
            'production_activation_authorized': False,
            'limitations': ['Owner must verify license, consent and provenance.',
                            'Owner must verify frozen rankings and pre-cutoff feature lineage.',
                            'Offline metrics do not authorize production deployment.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--release-id', help='Evidence identity; omission cannot satisfy the release gate')
    args = parser.parse_args()
    candidate_before = candidate_manifest()['sha256']
    raw = args.input.read_bytes()
    report = evaluate(json.loads(raw))
    candidate_after = candidate_manifest()['sha256']
    report.update(candidate_before_sha256=candidate_before, candidate_sha256=candidate_after,
                  candidate_unchanged=candidate_before == candidate_after)
    if candidate_before != candidate_after:
        report['status'] = 'QUALITY_PENDING'
        report['reasons'].append('CANDIDATE_CHANGED_DURING_EVALUATION')
    root = Path(__file__).resolve().parents[2]
    report.update(input_sha256=hashlib.sha256(raw).hexdigest(), release_id=args.release_id,
                  timestamp=datetime.now(timezone.utc).isoformat(),
                  source_hashes={str(path.relative_to(root)).replace('\\', '/'): hashlib.sha256(path.read_bytes()).hexdigest()
                    for path in [Path(__file__), root / 'backend/contracts/fixtures/load-profile.json', root / 'plan/P00-DECISIONS.md']})
    local = Path(__file__).resolve().parent / '.local' / 'p03'
    local.mkdir(parents=True, exist_ok=True)
    (local / 'quality-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))
    return 0 if report['status'] == 'OFFLINE_METRIC_GATE_PASS' else 2


if __name__ == '__main__':
    raise SystemExit(main())
