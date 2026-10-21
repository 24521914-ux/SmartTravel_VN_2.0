"""Bounded P03 probes. Never equates a small local dataset with the P00 gate.

python backend/infra/p03_verify.py contracts|security|load [--duration 30]
Reports contain only operation names/status/metrics, never bodies or tokens.
Security only sends empty bodies to protected endpoints, and skips anonymous
mutations. Load defaults to read-only catalog; --full-mix adds synthetic fixture
profile writes, Basic recommendations and trip reads. Full role/BOLA matrix and
production-scale data remain unverified. Run p02_* exercises separately.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import threading
import time
from datetime import datetime, timezone

from jsonschema import Draft202012Validator
from p02 import ROOT, SERVICES, compose, prepare, request
from p03_candidate import candidate_manifest

CONTRACTS = ROOT / 'backend/contracts'
REPORTS = Path(__file__).resolve().parent / '.local/p03'
GATEWAY = 'http://127.0.0.1:58080'
METHODS = {'get', 'post', 'put', 'patch', 'delete', 'head', 'options'}


def operations():
    for service in SERVICES:
        api = json.loads((CONTRACTS / f'openapi/{service}.yaml').read_text(encoding='utf-8'))
        for path, item in api['paths'].items():
            for method, operation in item.items():
                if method in METHODS:
                    security = operation.get('security', api.get('security', []))
                    yield service, path, method.upper(), operation, bool(security) and {} not in security


def concrete_path(path):
    return re.sub(r'\{[^}]+\}', '00000000-0000-0000-0000-000000000000', path)


def probe(path, method='GET', token=None):
    try:
        return request(GATEWAY, path, method, {} if method in {'POST', 'PUT', 'PATCH'} else None, token)[0]
    except (OSError, ValueError):
        return 0


def contracts():
    checks = []
    expected = json.loads((CONTRACTS / 'checksums.json').read_text())
    actual_files = {str(path.relative_to(CONTRACTS)).replace('\\', '/')
                    for path in CONTRACTS.rglob('*') if path.is_file() and path.name != 'checksums.json'}
    for name, digest in expected.items():
        path = CONTRACTS / name
        # Frozen text manifests use LF; Windows Git checkout can use CRLF.
        checks.append({'file': name, 'pass': path.is_file() and contract_digest(path.read_bytes()) == digest})
    schemas = 0
    for path in (CONTRACTS / 'events').glob('*.schema.json'):
        Draft202012Validator.check_schema(json.loads(path.read_text(encoding='utf-8')))
        schemas += 1
    official = contract_validator()
    try:
        official.run(False)
        validation_pass, validation_error = True, None
    except (AssertionError, ValueError) as error:
        validation_pass, validation_error = False, str(error)
    return {'pass': all(c['pass'] for c in checks) and bool(checks) and actual_files == set(expected) and validation_pass, 'checks': checks,
            'unexpected_files': sorted(actual_files - set(expected)),
            'official_validation_pass': validation_pass, 'official_validation_error': validation_error,
            'event_schemas_checked': schemas, 'scope': 'Frozen checksums and schema validity only; live producer/consumer compatibility requires integration exercises.'}


def contract_digest(raw):
    return contract_validator().artifact_checksum(raw)


_VALIDATOR = None


def contract_validator():
    global _VALIDATOR
    if _VALIDATOR is None:
        spec = importlib.util.spec_from_file_location('p03_frozen_contract_validator', ROOT / 'backend/platform/validate_contracts.py')
        _VALIDATOR = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_VALIDATOR)
    return _VALIDATOR


def security():
    checks, skipped = [], []
    role_tokens = {}
    for alias in ['u1', 'business']:
        status, session, _ = request(GATEWAY, '/api/identity/api/v1/auth/login', 'POST',
            {'email': 'fixture-' + alias + '@example.invalid', 'password': prepare()['IDENTITY_FIXTURE_PASSWORD']})
        if status != 200:
            raise RuntimeError('Synthetic role login failed; security evidence not produced')
        role_tokens['USER' if alias == 'u1' else 'BUSINESS'] = session['access_token']
    for service, path, method, operation, protected in operations():
        name = service + ':' + operation.get('operationId', method + ' ' + path)
        if not protected:
            skipped.append({'operation': name, 'reason': 'Anonymous operation; no arbitrary mutation'})
            continue
        url = '/api/' + service + concrete_path(path)
        for actor, token in [('guest', None), ('malformed_bearer', 'invalid.jwt.signature')]:
            status = probe(url, method, token)
            checks.append({'operation': name, 'actor': actor, 'status': status, 'pass': status in {401, 403}})
        if '/admin/' in path or path.startswith('/internal/'):
            for actor, token in role_tokens.items():
                status = probe(url, method, token)
                expected = {403} if '/admin/' in path else {401, 403, 404}
                checks.append({'operation': name, 'actor': actor, 'status': status, 'pass': status in expected})
    for service in SERVICES:
        for path in ['/internal/v1/security/session', '/actuator/env']:
            status = probe('/api/' + service + path)
            checks.append({'operation': service + ':' + path, 'actor': 'guest', 'status': status,
                           'pass': status in {401, 403, 404}})
    return {'pass': bool(checks) and all(c['pass'] for c in checks), 'full_role_matrix_pass': False, 'checks': checks, 'skipped': skipped,
            'scope': 'All protected OpenAPI operations: anonymous and malformed JWT denial. Role/BOLA, upload, revocation, refresh and rate limits require dedicated authenticated scenarios.'}


def percentile(values, fraction=.95):
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)]


def metrics(samples, elapsed, users, peak_inflight, planned, skipped):
    durations = [latency for status, latency in samples]
    errors = sum(status < 200 or status >= 300 for status, _ in samples)
    return {'requests': len(samples), 'errors': errors, 'error_rate': errors / len(samples) if samples else None,
            'status_counts': dict(Counter(str(status) for status, _ in samples)),
            'elapsed_seconds': elapsed, 'actual_rps': len(samples) / elapsed if elapsed > 0 else 0,
            'p95_ms': percentile(durations), 'max_ms': max(durations) if durations else None,
            'achieved_virtual_users': len(users), 'peak_inflight_requests': peak_inflight,
            'planned_requests': planned, 'skipped_slots': skipped}


def evaluate(measured, profile, dataset_matches=False, mix_matches=False, enforce_read_budget=True):
    reasons = []
    if measured['errors'] or not measured['requests']:
        reasons.append('HTTP errors or no successful measurement')
    if enforce_read_budget and (measured['p95_ms'] is None or measured['p95_ms'] >= profile['latency_target_ms']['read_p95']):
        reasons.append('Read p95 target not met')
    if measured['actual_rps'] < profile['target_requests_per_second'] * .95:
        reasons.append('Throughput below 95% of target')
    if measured['achieved_virtual_users'] < profile['concurrent_users']:
        reasons.append('Virtual-user target not achieved')
    if measured['skipped_slots']:
        reasons.append('Scheduling slots dropped due to backpressure')
    local_reasons = list(reasons)
    if not dataset_matches:
        reasons.append('P00 dataset volumes not verified')
    if not mix_matches:
        reasons.append('P00 authenticated write/recommendation/trip mix not measured')
    return {'local_read_probe_pass': not local_reasons, 'p00_release_gate_pass': not reasons, 'reasons': reasons}


def traffic_class(slot):
    position = slot % 20
    return 'catalog_read' if position < 10 else 'basic_recommendation' if position < 14 else 'trip_read' if position < 17 else 'authenticated_write'


def class_metrics(samples, profile):
    result = {}
    for name, target in [('catalog_read', 'read_p95'), ('trip_read', 'read_p95'),
                         ('authenticated_write', 'write_p95'), ('basic_recommendation', 'basic_recommendation_p95')]:
        selected = [(status, latency) for kind, status, latency in samples if kind == name]
        errors = sum(status < 200 or status >= 300 for status, _ in selected)
        p95 = percentile([latency for _, latency in selected])
        result[name] = {'requests': len(selected), 'errors': errors, 'p95_ms': p95,
                        'status_counts': dict(Counter(str(status) for status, _ in selected)),
                        'error_rate': errors / len(selected) if selected else None,
                        'target_ms': profile['latency_target_ms'][target],
                        'pass': bool(selected) and errors == 0 and p95 < profile['latency_target_ms'][target]}
    return result


def mixed_evaluation(measured, classes, profile, restoration_status):
    evaluation = evaluate(measured, profile, mix_matches=True, enforce_read_budget=False)
    generic_pass = evaluation['local_read_probe_pass']
    evaluation['local_read_probe_pass'] = None
    evaluation['p00_release_gate_pass'] = False
    evaluation['reasons'].append('Authenticated load shares one principal; distinct-user contention unverified')
    evaluation['local_mixed_probe_pass'] = generic_pass and all(value['pass'] for value in classes.values()) and restoration_status == 200
    for name, value in classes.items():
        if not value['pass']:
            evaluation['reasons'].append(name + ' class error/latency target not met')
    if restoration_status != 200:
        evaluation['reasons'].append('Fixture display name restoration failed')
    return evaluation


def sanitized_error(kind, status, value=None):
    detail = {'traffic_class': kind, 'status': status}
    if isinstance(value, dict):
        code, trace = value.get('code'), value.get('traceId')
        if isinstance(code, str) and re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code):
            detail['code'] = code
        if isinstance(trace, str) and re.fullmatch('[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', trace):
            detail['traceId'] = trace
    return detail


def archive_report(destination):
    if not destination.is_file():
        return None
    raw = destination.read_bytes()
    folder = destination.parent / 'runs'
    folder.mkdir(parents=True, exist_ok=True)
    archive = folder / (destination.stem + '-' + hashlib.sha256(raw).hexdigest() + '.json')
    if not archive.exists():
        with archive.open('xb') as stream:
            stream.write(raw)
    return archive


def diagnostics():
    profile = json.loads((CONTRACTS / 'fixtures/load-profile.json').read_text())
    def sql(service, statement):
        result = compose('exec', '-T', service + '-db', 'psql', '-U', service + '_admin', '-d', service + '_db',
                         '-At', '-v', 'ON_ERROR_STOP=1', '-c', 'SET default_transaction_read_only=on; SET statement_timeout=5000', '-c', statement)
        return '\n'.join(line for line in result.stdout.strip().splitlines() if line != 'SET')
    counts = {label: int(sql(service, 'SELECT count(*) FROM ' + table)) for label, service, table in [
        ('places', 'catalog', 'catalog.places'), ('users', 'identity', 'identity.users'),
        ('trips', 'trip', 'trip.trips'), ('interactions', 'intelligence', 'intelligence.interactions')]}
    mongo = compose('exec', '-T', 'community-db', 'mongosh', '--quiet', '--eval',
                    "assert(db.getSiblingDB('admin').auth('community_admin',process.env.MONGO_INITDB_ROOT_PASSWORD)); print(db.getSiblingDB('community_db').reviews.countDocuments({}));")
    counts['reviews'] = int(mongo.stdout.strip().splitlines()[-1])
    targets = {name: profile[name] for name in counts}
    query = ("SELECT p.place_id,p.name_vi,p.address,p.status,p.version,p.price_min,p.price_max,p.currency,"
             "r.rating_avg,r.review_count,ST_Y(location::geometry) lat,ST_X(location::geometry) lon "
             "FROM catalog.places p LEFT JOIN catalog.place_rating_summary r USING(place_id) "
             "WHERE p.status='PUBLISHED' ORDER BY p.place_id LIMIT 21")
    plan = json.loads(sql('catalog', 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + query))
    return {'counts': counts, 'targets': targets, 'deficits': {name: max(0, targets[name] - counts[name]) for name in counts},
            'dataset_matches': all(counts[name] >= targets[name] for name in counts),
            'catalog_search_explain': plan, 'scope': 'Read-only operator counts and unfiltered catalog search page EXPLAIN; does not prove realistic data distribution, all hot-query plans, or pool/backpressure.'}


def load(duration, full_mix=False):
    profile = json.loads((CONTRACTS / 'fixtures/load-profile.json').read_text())
    users, rps = profile['concurrent_users'], profile['target_requests_per_second']
    paths = ['/api/catalog/api/v1/places', '/api/catalog/api/v1/categories']
    samples, classified, errors_detail, achieved, futures = [], [], [], set(), []
    write_lock = threading.Lock()
    token, current_profile, original_name = None, None, None
    if full_mix:
        code, login, _ = request(GATEWAY, '/api/identity/api/v1/auth/login', 'POST',
                                 {'email': 'fixture-u2@example.invalid', 'password': prepare()['IDENTITY_FIXTURE_PASSWORD']})
        if code != 200:
            raise RuntimeError('Synthetic fixture login failed; no load started')
        token = login['access_token']
        code, current_profile, _ = request(GATEWAY, '/api/identity/api/v1/me', token=token)
        if code != 200:
            raise RuntimeError('Synthetic profile lookup failed; no load started')
        original_name = current_profile['display_name']
    lock = threading.Lock()
    semaphore = threading.BoundedSemaphore(users)
    active = peak = skipped = 0
    def worker(slot):
        nonlocal active, peak, current_profile
        started = time.monotonic()
        with lock:
            active += 1
            peak = max(peak, active)
            achieved.add(slot % users)
        try:
            kind = traffic_class(slot) if full_mix else 'catalog_read'
            value = None
            if kind == 'catalog_read':
                status = probe(paths[slot % len(paths)])
            else:
                try:
                    if kind == 'authenticated_write':
                        with write_lock:
                            status, value, _ = request(GATEWAY, '/api/identity/api/v1/me', 'PATCH',
                                {'display_name': 'P03 load ' + str(slot % 2)}, token,
                                {'If-Match': '"' + str(current_profile['version']) + '"'})
                            if status == 200:
                                current_profile = value
                    elif kind == 'trip_read':
                        status, value, _ = request(GATEWAY, '/api/trip/api/v1/me/trips', token=token)
                    else:
                        status, value, _ = request(GATEWAY, '/api/intelligence/api/v1/recommendations', 'POST',
                                                  {'topN': 10, 'currency': 'VND'}, token)
                        if status == 200 and value.get('version') != 'basic-v1':
                            status = 0  # Do not label an unknown algorithm a Basic measurement.
                            value = {'code': 'UNEXPECTED_BASIC_VERSION'}
                except (OSError, ValueError):
                    status = 0
            with lock:
                latency = (time.monotonic() - started) * 1000
                samples.append((status, latency))
                classified.append((kind, status, latency))
                if status < 200 or status >= 300:
                    errors_detail.append(sanitized_error(kind, status, value))
        finally:
            with lock:
                active -= 1
            semaphore.release()
    restoration_status = None
    try:
        planned = math.floor(duration * rps)
        start = time.monotonic()
        with ThreadPoolExecutor(max_workers=users) as executor:
            for slot in range(planned):
                due = start + slot / rps
                delay = due - time.monotonic()
                if delay > 0:
                    time.sleep(delay)
                # Never enqueue an unbounded backlog or catch up after the deadline.
                if time.monotonic() >= start + duration or not semaphore.acquire(blocking=False):
                    skipped += 1
                    continue
                futures.append(executor.submit(worker, slot))
            for future in futures:
                future.result()
            remaining = start + duration - time.monotonic()
            if remaining > 0:
                time.sleep(remaining)
        measured = metrics(samples, time.monotonic() - start, achieved, peak, planned, skipped)
    finally:
        if full_mix and token is not None and original_name is not None:
            try:
                code, latest, _ = request(GATEWAY, '/api/identity/api/v1/me', token=token)
                if code == 200:
                    restoration_status = request(GATEWAY, '/api/identity/api/v1/me', 'PATCH',
                        {'display_name': original_name}, token,
                        {'If-Match': '"' + str(latest['version']) + '"'})[0]
                else:
                    restoration_status = code
            except (OSError, ValueError):
                restoration_status = 0
    classes = class_metrics(classified, profile)
    evaluation = mixed_evaluation(measured, classes, profile, restoration_status) if full_mix else evaluate(measured, profile)
    return {'metrics': measured, 'class_metrics': classes, 'evaluation': evaluation,
            'error_details': errors_detail, 'authenticated_principals': 1 if full_mix else 0,
            'fixture_name_restored': restoration_status == 200 if full_mix else None,
            'profile': profile, 'scope': 'Synthetic local paced virtual users; authenticated classes share ONE fixture identity and profile writes serialize optimistic versions. Recommendation requests persist. Full P00 dataset and realistic distinct-user contention remain unverified.' if full_mix else 'Read-only synthetic local catalog; 50 paced virtual users; actual inflight measured separately; full dataset/mix unverified.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['contracts', 'security', 'load', 'diagnostics'])
    parser.add_argument('--duration', type=float, default=30)
    parser.add_argument('--release-id', help='Optional evidence identity; absent identity cannot satisfy the P03 gate')
    parser.add_argument('--full-mix', action='store_true', help='Synthetic fixture profile writes/recommendations/trip reads in frozen proportions')
    parser.add_argument('--run-context', choices=['unspecified', 'isolated-host-window', 'concurrent-isolated-restore'], default='unspecified', help='Operator-declared host context, not a causal diagnosis')
    args = parser.parse_args()
    if not 3 <= args.duration <= 120:
        parser.error('duration must be 3..120 seconds')
    candidate_before = candidate_manifest()['sha256']
    result = load(args.duration, args.full_mix) if args.action == 'load' else globals()[args.action]()
    candidate_after = candidate_manifest()['sha256']
    result.update(candidate_before_sha256=candidate_before, candidate_sha256=candidate_after,
                  candidate_unchanged=candidate_before == candidate_after)
    if candidate_before != candidate_after:
        result['pass'] = False
        if 'evaluation' in result:
            result['evaluation'].update(local_read_probe_pass=False, local_mixed_probe_pass=False,
                                        p00_release_gate_pass=False)
            result['evaluation']['reasons'].append('Candidate source changed during measurement')
    result.update(release_id=args.release_id, run_context=args.run_context, timestamp=datetime.now(timezone.utc).isoformat(), source_hashes={
        str(path.relative_to(ROOT)).replace('\\', '/'): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in [Path(__file__), ROOT / 'backend/infra/p02.py',
                     ROOT / 'backend/platform/validate_contracts.py', CONTRACTS / 'checksums.json',
                     CONTRACTS / 'fixtures/load-profile.json']})
    REPORTS.mkdir(parents=True, exist_ok=True)
    destination = REPORTS / ('mix-load.json' if args.action == 'load' and args.full_mix else args.action + '.json')
    archive_report(destination)
    destination.write_text(json.dumps(result, indent=2), encoding='utf-8')
    archive_report(destination)
    passed = result.get('pass', result.get('evaluation', {}).get('local_mixed_probe_pass', result.get('evaluation', {}).get('local_read_probe_pass', args.action == 'diagnostics')))
    print(json.dumps({'action': args.action, 'probe_pass': passed, 'report': str(destination),
                      'metrics': result.get('metrics'), 'evaluation': result.get('evaluation')}, indent=2))
    raise SystemExit(0 if passed else 1)


if __name__ == '__main__':
    main()
