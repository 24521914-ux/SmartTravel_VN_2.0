"""Measured non-AI E2E against P02 Gateway; synthetic records only, no AI calls."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import uuid

import p02_smoke as http
from p03_candidate import ROOT, candidate_manifest
from p03_scope import NON_AI_E2E_CASES

OUTPUT = Path(__file__).resolve().parent / '.local/p03/e2e-report.json'


def run(release_id, output=OUTPUT):
    before = candidate_manifest()['sha256']
    http.EVIDENCE.clear()
    http.TRACE = str(uuid.uuid4())
    checks = []
    run_id = str(uuid.uuid4())
    reference = output.resolve().as_posix() + '#requests'

    def mark(name, start, assertion):
        checks.append({'id': name, 'status': 'PASS', 'evidence': [reference],
                       'assertion': assertion, 'request_start': start,
                       'request_end': len(http.EVIDENCE), 'correlation_id': http.TRACE})
        print('PASS non-AI ' + name, flush=True)

    call = http.call
    try:
        admin, user, other, business = [http.login(alias) for alias in ('admin', 'u1', 'u2', 'business')]
        start = len(http.EVIDENCE)
        profile = call('identity', '/api/v1/me', token=user)
        assert profile
        http.deletion_flow(run_id)
        mark('F01', start, 'Real register, SMTP verification, login, profile and deletion with session revocation')

        start = len(http.EVIDENCE)
        category = call('catalog', '/api/v1/categories')['items'][0]['id']
        places = []
        for offset in (0, .01):
            place = call('catalog', '/api/v1/admin/places', 'POST', {
                'name': 'P03 non-AI ' + run_id + (' A' if offset == 0 else ' B'),
                'latitude': 10.762622 + offset, 'longitude': 106.660172 + offset,
                'category_ids': [category], 'tag_ids': [], 'amenity_ids': [],
                'geographic_unit_id': '10000000-0000-0000-0000-000000000002',
                'destination_ids': [], 'price': 10000, 'currency': 'VND', 'opening_hours': [], 'media_keys': []},
                admin, expected=201, key=run_id + str(offset))
            place = call('catalog', '/api/v1/admin/places/' + place['place_id'] + '/status', 'PUT',
                         {'status': 'PUBLISHED'}, admin, version=place['version'])
            detail = call('catalog', '/api/v1/places/' + place['place_id'])
            assert detail['place_id'] == place['place_id']
            places.append(detail)
        place_id = places[0]['place_id']
        mark('F02', start, 'Admin creates/publishes two geolocated places and public detail matches persisted IDs')

        start = len(http.EVIDENCE)
        offering = call('catalog', '/api/v1/admin/offerings', 'POST', {
            'place_id': place_id, 'type': 'ACTIVITY', 'name': 'P03 local activity ' + run_id,
            'price': 50000, 'currency': 'VND'}, admin, expected=201)
        listed = call('catalog', '/api/v1/places/' + place_id + '/offerings')['items']
        assert not any(row['offering_id'] == offering['offering_id'] for row in listed), 'Draft offering leaked publicly'
        offering = call('catalog', '/api/v1/admin/offerings/' + offering['offering_id'], 'PATCH',
                        {'price': 60000, 'status': 'PUBLISHED'}, admin, version=offering['version'])
        assert offering['price'] == 60000
        fetched = call('catalog', '/api/v1/admin/offerings/' + offering['offering_id'], token=admin)
        assert fetched['place_id'] == place_id and fetched['price'] == 60000
        assert any(row['offering_id'] == offering['offering_id'] for row in
                   call('catalog', '/api/v1/places/' + place_id + '/offerings')['items'])
        hidden = call('catalog', '/api/v1/admin/places/' + place_id + '/status', 'PUT',
                      {'status': 'HIDDEN'}, admin, version=places[0]['version'])
        call('catalog', '/api/v1/places/' + place_id, expected=404)
        assert not call('catalog', '/api/v1/places/' + place_id + '/offerings')['items']
        call('catalog', '/api/v1/admin/offerings/' + offering['offering_id'], 'PATCH',
             {'status': 'PUBLISHED'}, admin, version=offering['version'], expected=404)
        assert call('catalog', '/api/v1/admin/offerings/' + offering['offering_id'], token=admin)['version'] == offering['version']
        call('catalog', '/api/v1/admin/places/' + place_id + '/status', 'PUT',
             {'status': 'PUBLISHED'}, admin, version=hidden['version'])
        mark('F03', start, 'Activity draft hidden, API publication visible; hidden anchor blocks listing and republish without version mutation')

        start = len(http.EVIDENCE)
        results = call('catalog', '/api/v1/places?q=' + run_id + '&limit=1')['items']
        assert len(results) == 1 and results[0]['place_id'] in {row['place_id'] for row in places}
        mark('F04', start, 'Search unique synthetic place name with bounded pagination returns matching published place')

        start = len(http.EVIDENCE)
        review = call('community', '/api/v1/places/' + place_id + '/reviews', 'POST',
                      {'rating': 5, 'content': 'P03 non-AI moderation', 'media_keys': []}, user,
                      expected=201, key=run_id)
        call('community', '/api/v1/admin/reviews/' + review['review_id'] + '/moderate', 'POST',
             {'action': 'APPROVE', 'reason': 'P03 synthetic E2E'}, admin, expected=202, version=review['version'])
        http.eventually(lambda: call('community', '/api/v1/places/' + place_id + '/reviews'),
                        lambda value: any(row['review_id'] == review['review_id'] for row in value['items']),
                        'approved review visible')
        http.eventually(lambda: http.diagnostic_sql('catalog',
                        "SELECT review_count FROM catalog.place_rating_summary WHERE place_id='" + place_id + "'"),
                        lambda value: value == '1', 'review rating propagated to Catalog')
        mark('F06', start, 'Real review moderation produces public review and Catalog count=1 via broker')

        start = len(http.EVIDENCE)
        favorite_path = '/api/v1/me/favorites/' + place_id
        call('community', favorite_path, 'PUT', token=user, expected=204)
        call('community', favorite_path, 'PUT', token=user, expected=204)
        favorites = call('community', '/api/v1/me/favorites', token=user)['items']
        assert sum(row['place_id'] == place_id for row in favorites) == 1
        call('community', favorite_path, 'DELETE', token=user, expected=204)
        assert not any(row['place_id'] == place_id for row in call('community', '/api/v1/me/favorites', token=user)['items'])
        mark('F07', start, 'Favorite PUT twice is idempotent and DELETE removes it from owner list')

        start = len(http.EVIDENCE)
        trip = call('trip', '/api/v1/me/trips', 'POST', {'name': 'P03 non-AI ' + run_id,
                    'start_date': '2026-11-01', 'end_date': '2026-11-02', 'timezone': 'Asia/Ho_Chi_Minh',
                    'currency': 'VND', 'budget': 1000000}, user, expected=201)
        trip_path = '/api/v1/trips/' + trip['trip_id']
        day = call('trip', trip_path + '/days', 'POST', {'date': '2026-11-01'}, user,
                   expected=201, version=trip['version'])
        item_path = trip_path + '/days/' + day['day_id'] + '/items'
        items = []
        for place in places:
            trip = call('trip', trip_path, token=user)
            item = call('trip', item_path, 'POST', {'place_id': place['place_id'], 'note': 'Manual selection',
                        'duration_minutes': 60, 'locked': True, 'recommendation_request_id': None}, user,
                        expected=201, version=trip['version'], key=str(uuid.uuid4()))
            assert item['snapshot']['place_id'] == place['place_id'] and item['locked'] is True
            items.append(item)
        call('trip', trip_path, token=other, expected=404)
        trip = call('trip', trip_path, token=user)
        call('trip', trip_path, 'PATCH', {'name': 'P03 updated ' + run_id}, user, version=trip['version'])
        call('trip', trip_path, 'PATCH', {'name': 'Stale update'}, user, version=trip['version'], expected=409)
        mark('F09', start, 'Manual trip/day/two place items, owner isolation and stale optimistic update rejection')

        start = len(http.EVIDENCE)
        trip = call('trip', trip_path, token=user)
        route = call('trip', trip_path + '/route-estimates', 'POST', {'from_item_id': items[0]['item_id'],
                     'to_item_id': items[1]['item_id'], 'mode': 'WALK'}, user, version=trip['version'])
        assert route['distance_m'] > 0 and isinstance(route['fallback'], bool)
        assert route['duration_seconds'] is None if route['fallback'] else route['duration_seconds'] > 0
        mark('F10', start, 'Two Catalog coordinates generate positive distance with explicit fallback; unknown travel time stays null')

        start = len(http.EVIDENCE)
        firm = call('catalog', '/api/v1/businesses', 'POST', {'name': 'P03 business ' + run_id}, business, expected=201)
        firm_path = '/api/v1/businesses/' + firm['business_id']
        verification = call('catalog', firm_path + '/verification', 'POST', {'evidence_keys': ['private/p03-synthetic-evidence']}, business, expected=202)
        call('catalog', '/api/v1/admin/business-verifications/' + verification['request_id'] + '/review', 'POST',
             {'action': 'APPROVE', 'reason': 'P03 synthetic verification'}, admin, expected=202)
        claim = call('catalog', firm_path + '/claims', 'POST', {'place_id': place_id, 'evidence_keys': ['private/p03-synthetic-evidence']}, business, expected=201)
        call('catalog', '/api/v1/admin/claims/' + claim['claim_id'] + '/review', 'POST',
             {'action': 'APPROVE', 'reason': 'P03 synthetic ownership'}, admin, expected=202)
        assert call('catalog', firm_path, token=business)['status'] == 'VERIFIED'
        mark('business', start, 'Business creation, admin verification and place ownership claim approval')

        start = len(http.EVIDENCE)
        source = call('ingestion', '/api/v1/admin/data-sources', 'POST', {'name': 'P03 non-AI ' + run_id,
                      'uri': 'http://source-sandbox:8080/records?run=' + run_id, 'secret_reference': 'none',
                      'license_version': 'synthetic-p03-nonai-v1', 'allow_storage': True, 'allow_training': False}, admin, expected=201)
        imported = []
        for mode in ('FULL', 'REPLAY'):
            job = call('ingestion', '/api/v1/admin/data-sources/' + source['source_id'] + '/import-jobs',
                       'POST', {'mode': mode}, admin, expected=202, key=run_id + mode)
            job_path = '/api/v1/admin/import-jobs/' + job['job_id']
            def settle():
                current = call('ingestion', job_path, token=admin)
                if current['status'] in ('QUEUED', 'RUNNING'):
                    for row in call('ingestion', job_path + '/items', token=admin)['items']:
                        if row['status'] == 'NEEDS_REVIEW':
                            call('ingestion', '/api/v1/admin/import-items/' + row['item_id'] + '/decision', 'POST',
                                 {'action': 'CREATE', 'place_id': None, 'reason': 'P03 non-AI synthetic'},
                                 admin, version=row['version'])
                return current
            http.eventually(settle, lambda value: value['status'] == 'SUCCEEDED', 'import ' + mode, seconds=45)
            imported.append({row['proposed_place_id'] for row in call('ingestion', job_path + '/items', token=admin)['items']
                             if row.get('proposed_place_id')})
        assert imported[0] and imported[0] == imported[1]
        mark('import', start, 'Licensed synthetic storage-only source imports and replay preserves canonical IDs; training denied')

        start = len(http.EVIDENCE)
        for service, path in [('identity', '/api/v1/admin/users'), ('catalog', '/api/v1/admin/places'),
                              ('community', '/api/v1/admin/reviews'), ('ingestion', '/api/v1/admin/data-sources')]:
            call(service, path, token=admin)
            call(service, path, token=user, expected=403)
        mark('F11', start, 'Non-AI owner admin routes accessible to admin and forbidden to USER; AI data/model admin deferred')
        assert {check['id'] for check in checks} == NON_AI_E2E_CASES
        success = True
        error = None
    except Exception as failure:
        success = False
        # p02 helper failures expose status/operation only; never serialize response bodies.
        error = type(failure).__name__
        if isinstance(failure, (AssertionError, KeyError)):
            error += ': ' + str(failure)[:500]
        print('FAIL non-AI E2E: ' + error, flush=True)
    after = candidate_manifest()['sha256']
    stable = before == after
    if not stable:
        success = False
        error = 'SOURCE_CHANGED_DURING_RUN'
    paths = ['backend/infra/p03_nonai_e2e.py', 'backend/infra/p02_smoke.py']
    report = {'scope': 'non-ai', 'release_id': release_id, 'timestamp': datetime.now(timezone.utc).isoformat(),
              'candidate_before_sha256': before, 'candidate_sha256': after,
              'source_hashes': {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in paths},
              'status': 'PASS' if success else 'FAIL', 'source_stable': stable, 'non_ai_f_cases_pass': success,
              'business_import_pass': success, 'non_ai_admin_pass': success, 'checks': checks,
              'correlation_id': http.TRACE, 'requests': http.EVIDENCE,
              'status_counts': dict(Counter(str(row['status']) for row in http.EVIDENCE)), 'error': error,
              'providers': {'source': 'synthetic sandbox', 'email': 'Mailpit sandbox', 'route': 'explicit application fallback'}}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    return 0 if success and before == after else 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-id', required=True)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    return run(args.release_id, args.output)


if __name__ == '__main__':
    raise SystemExit(main())
