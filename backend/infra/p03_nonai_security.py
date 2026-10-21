"""Authenticated, synthetic P03 security scenarios; never calls Intelligence/AI.

Uses the isolated P02 stack and fixtures. Reports contain status codes and case
names only, never credentials, bodies or production user data.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import time
import uuid
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from p02 import request, prepare, compose
from p03_candidate import candidate_manifest
from p03_verify import operations, concrete_path, GATEWAY

SERVICES = ('identity', 'catalog', 'community', 'trip', 'ingestion')


def multipart(file_bytes, mime='image/png'):
    boundary = 'p03-' + uuid.uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.png"\r\n'
            f'Content-Type: {mime}\r\n\r\n').encode() + file_bytes + f'\r\n--{boundary}--\r\n'.encode()
    return body, 'multipart/form-data; boundary=' + boundary


def redaction_stats(logs, sensitive, rows):
    values = {value for value in sensitive if len(value) >= 8}
    leaked = sum(value in logs for value in values)
    report_leaked = sum(value in json.dumps(rows) for value in values)
    return {'pass': bool(logs.strip()) and leaked == 0 and report_leaked == 0,
            'log_lines_reviewed': len(logs.splitlines()),
            'sensitive_values_checked': len(values),
            'leaked_values': leaked, 'report_leaked_values': report_leaked}


class Matrix:
    def __init__(self):
        self.rows = []
        self.sessions = {}
        self.sensitive = []

    def check(self, name, service, path, method='GET', body=None, token=None,
              expected=(200,), version=None):
        headers = {'X-Correlation-ID': str(uuid.uuid4())}
        if method in {'POST', 'PUT', 'PATCH'}:
            headers['Idempotency-Key'] = str(uuid.uuid4())
        if version is not None:
            headers['If-Match'] = '"' + str(version) + '"'
        status, result, _ = request(GATEWAY, '/api/' + service + path, method, body, token, headers)
        for value in (body, result):
            if isinstance(value, dict):
                self.sensitive.extend(str(v) for k, v in value.items()
                                      if k in {'access_token', 'refresh_token', 'password', 'email', 'token'} and v)
        self.rows.append({'name': name, 'service': service, 'method': method,
                          'status': status, 'expected': list(expected), 'pass': status in expected})
        if status not in expected:
            raise AssertionError(f'{name}: expected {expected}; received {status}')
        return result

    def login(self, alias):
        session = self.check('login-' + alias, 'identity', '/api/v1/auth/login', 'POST',
                             {'email': 'fixture-' + alias + '@example.invalid',
                              'password': prepare()['IDENTITY_FIXTURE_PASSWORD']})
        self.sessions[alias] = session
        return session['access_token']

    def synthetic_account(self):
        email = 'p03-security-' + uuid.uuid4().hex + '@example.invalid'
        password = prepare()['IDENTITY_FIXTURE_PASSWORD']
        self.check('ownership-account-register', 'identity', '/api/v1/auth/register', 'POST',
                   {'email': email, 'password': password, 'display_name': 'P03 synthetic owner'}, expected=(202,))
        deadline = time.monotonic() + 45
        message = None
        while time.monotonic() < deadline:
            with urlopen('http://127.0.0.1:59025/api/v1/messages', timeout=5) as response:
                messages = json.load(response).get('messages', [])
            message = next((row for row in messages if email in json.dumps(row)), None)
            if message:
                break
            time.sleep(.5)
        assert message is not None, 'Synthetic ownership verification email missing'
        with urlopen('http://127.0.0.1:59025/api/v1/message/' + message['ID'], timeout=5) as response:
            content = json.load(response)
        matches = re.findall(r'[A-Za-z0-9_-]{32,}', content.get('Text', ''))
        assert matches, 'Synthetic ownership verification token missing'
        self.check('ownership-account-verify', 'identity', '/api/v1/auth/verify-email', 'POST',
                   {'token': matches[-1]}, expected=(202,))
        credentials = {'email': email, 'password': password}
        session = self.check('ownership-account-login', 'identity', '/api/v1/auth/login', 'POST', credentials)
        profile = self.check('ownership-account-profile', 'identity', '/api/v1/me', token=session['access_token'])
        return credentials, session['access_token'], profile

    def upload(self, name, token, content, mime, expected):
        data, content_type = multipart(content, mime)
        req = Request(GATEWAY + '/api/catalog/api/v1/admin/media', data=data, method='POST',
                      headers={'Content-Type': content_type, 'Authorization': 'Bearer ' + token})
        try:
            response = urlopen(req, timeout=20)
        except HTTPError as error:
            response = error
        with response:
            status = response.status
            raw = response.read()
        self.rows.append({'name': name, 'service': 'catalog', 'method': 'POST',
                          'status': status, 'expected': list(expected), 'pass': status in expected})
        if status not in expected:
            raise AssertionError(f'{name}: expected {expected}; received {status}')
        return json.loads(raw) if raw else None


def run():
    matrix = Matrix()
    checks = []

    def case(name, work):
        start = len(matrix.rows)
        try:
            work()
            passed, error = True, None
        except (AssertionError, OSError, ValueError, KeyError) as failure:
            passed, error = False, type(failure).__name__ + ': ' + str(failure)
        checks.append({'id': name, 'status': 'PASS' if passed else 'FAIL', 'pass': passed,
                       'evidence': ['security.json#/checks/' + str(len(checks)) + '/requests'],
                       'requests': matrix.rows[start:], 'error': error})

    tokens = {alias: matrix.login(alias) for alias in ('admin', 'u1', 'u2', 'business')}
    admin, user, other, business = [tokens[a] for a in ('admin', 'u1', 'u2', 'business')]

    def roles():
        for service, path, method, operation, protected in operations():
            if service not in SERVICES or not protected:
                continue
            target = concrete_path(path)
            name = service + ':' + operation.get('operationId', method + path)
            body = {} if method in {'POST', 'PATCH', 'PUT'} else None
            for actor, token in [('guest', None), ('malformed', 'invalid.jwt.signature')]:
                matrix.check(name + '-' + actor, service, target, method, body, token, (401, 403))
            if '/admin/' in path:
                for actor, token in [('USER', user), ('BUSINESS', business)]:
                    matrix.check(name + '-' + actor, service, target, method, body, token, (403,))
        for service in SERVICES:
            matrix.check('internal-hidden-' + service, service, '/internal/v1/forbidden',
                         token=admin, expected=(403, 404))
            matrix.check('actuator-hidden-' + service, service, '/actuator/env', expected=(401, 403, 404))
        for service, path in [('identity', '/api/v1/admin/users'), ('catalog', '/api/v1/admin/places'),
                              ('community', '/api/v1/admin/reviews'), ('ingestion', '/api/v1/admin/data-sources')]:
            matrix.check('admin-positive-' + service, service, path, token=admin)
        matrix.check('business-positive', 'catalog', '/api/v1/businesses', token=business)
        matrix.check('business-denies-user', 'catalog', '/api/v1/businesses', token=user, expected=(403,))

    case('endpoint_role_matrix', roles)

    def bola():
        trip = matrix.check('trip-create', 'trip', '/api/v1/me/trips', 'POST',
            {'name': 'P03 security synthetic', 'start_date': '2026-11-01', 'end_date': '2026-11-02',
             'timezone': 'Asia/Ho_Chi_Minh', 'currency': 'VND', 'budget': 1000000}, user, (201,))
        path = '/api/v1/trips/' + trip['trip_id']
        try:
            matrix.check('trip-owner-read', 'trip', path, token=user)
            matrix.check('trip-stranger-read', 'trip', path, token=other, expected=(404,))
            matrix.check('trip-stranger-write', 'trip', path, 'PATCH', {'name': 'Intrusion'}, other,
                         (404,), trip['version'])
            matrix.check('trip-stranger-delete', 'trip', path, 'DELETE', token=other,
                         expected=(404,), version=trip['version'])
            row = matrix.check('trip-unchanged', 'trip', path, token=user)
            assert row['name'] == 'P03 security synthetic' and row['version'] == trip['version']
        finally:
            matrix.check('trip-cleanup', 'trip', path, 'DELETE', token=user,
                         expected=(204,), version=trip['version'])
        collection = matrix.check('collection-create', 'community', '/api/v1/me/collections', 'POST',
                                  {'name': 'P03 private synthetic', 'visibility': 'PRIVATE'}, user, (201,))
        path = '/api/v1/me/collections/' + collection['collection_id']
        try:
            matrix.check('collection-owner', 'community', path, token=user)
            matrix.check('collection-stranger-read', 'community', path, token=other, expected=(404,))
            matrix.check('collection-stranger-write', 'community', path, 'PATCH', {'name': 'Intrusion'},
                         other, (404,), collection['version'])
            matrix.check('collection-private-anonymous', 'community',
                         '/api/v1/collections/' + collection['collection_id'], expected=(404,))
        finally:
            matrix.check('collection-cleanup', 'community', path, 'DELETE', token=user,
                         expected=(204,), version=collection['version'])
        category = matrix.check('ownership-category', 'catalog', '/api/v1/categories')['items'][0]['id']
        place = matrix.check('ownership-place-create', 'catalog', '/api/v1/admin/places', 'POST',
            {'name': 'P03 security ownership ' + uuid.uuid4().hex, 'latitude': 10.762622, 'longitude': 106.660172,
             'category_ids': [category], 'tag_ids': [], 'amenity_ids': [],
             'geographic_unit_id': '10000000-0000-0000-0000-000000000002', 'destination_ids': [],
             'price': 10000, 'currency': 'VND', 'opening_hours': [], 'media_keys': []}, admin, (201,))
        place_path = '/api/v1/admin/places/' + place['place_id']
        place = matrix.check('ownership-place-publish', 'catalog', place_path + '/status', 'PUT',
                             {'status': 'PUBLISHED'}, admin, version=place['version'])
        review = matrix.check('review-owner-create', 'community', '/api/v1/places/' + place['place_id'] + '/reviews',
                              'POST', {'rating': 5, 'content': 'P03 synthetic owner review', 'media_keys': []}, user, (201,))
        review_path = '/api/v1/reviews/' + review['review_id']
        try:
            matrix.check('review-stranger-edit-denied', 'community', review_path, 'PATCH',
                         {'rating': 1, 'content': 'Unauthorized edit', 'media_keys': []}, other, (403,), review['version'])
            matrix.check('review-stranger-delete-denied', 'community', review_path, 'DELETE',
                         token=other, expected=(403,), version=review['version'])
            review = matrix.check('review-owner-edit', 'community', review_path, 'PATCH',
                                 {'rating': 4, 'content': 'Authorized owner edit', 'media_keys': []},
                                 user, version=review['version'])
        finally:
            matrix.check('review-owner-cleanup', 'community', review_path, 'DELETE', token=user,
                         expected=(204,), version=review['version'])

        credentials, second_user, profile = matrix.synthetic_account()
        account_path = '/api/v1/admin/users/' + profile['user_id']
        account = matrix.check('ownership-business-role', 'identity', account_path + '/roles', 'PUT',
                               {'roles': ['USER', 'BUSINESS']}, admin, version=profile['version'])
        second_business = matrix.check('ownership-business-login', 'identity', '/api/v1/auth/login',
                                       'POST', credentials)['access_token']
        firm = matrix.check('business-owner-create', 'catalog', '/api/v1/businesses', 'POST',
                            {'name': 'P03 first business owner'}, business, (201,))
        firm_path = '/api/v1/businesses/' + firm['business_id']
        try:
            matrix.check('business-owner-read', 'catalog', firm_path, token=business)
            matrix.check('business-stranger-read-denied', 'catalog', firm_path, token=second_business, expected=(403,))
            matrix.check('business-stranger-write-denied', 'catalog', firm_path, 'PATCH',
                         {'name': 'Unauthorized business edit'}, second_business, (404,), firm['version'])
            matrix.check('business-stranger-delete-denied', 'catalog', firm_path, 'DELETE',
                         token=second_business, expected=(404,), version=firm['version'])
            members = matrix.check('business-owner-members', 'catalog', firm_path + '/members', token=business)['items']
            matrix.check('business-stranger-members-denied', 'catalog', firm_path + '/members',
                         token=second_business, expected=(403,))
            matrix.check('business-stranger-member-denied', 'catalog', firm_path + '/members/' + members[0]['member_id'],
                         token=second_business, expected=(403,))
            verified = matrix.check('business-owner-verification', 'catalog', firm_path + '/verification', 'POST',
                                    {'evidence_keys': ['private/p03-security-synthetic-evidence']}, business, (202,))
            matrix.check('business-admin-verify', 'catalog',
                         '/api/v1/admin/business-verifications/' + verified['request_id'] + '/review', 'POST',
                         {'action': 'APPROVE', 'reason': 'P03 synthetic ownership isolation'}, admin, (202,))
            claim = matrix.check('business-owner-claim', 'catalog', firm_path + '/claims', 'POST',
                                 {'place_id': place['place_id'], 'evidence_keys': ['private/p03-security-synthetic-evidence']},
                                 business, (201,))
            matrix.check('business-admin-claim', 'catalog', '/api/v1/admin/claims/' + claim['claim_id'] + '/review',
                         'POST', {'action': 'APPROVE', 'reason': 'P03 synthetic ownership'}, admin, (202,))
            change_path = '/api/v1/claims/' + claim['claim_id'] + '/change-requests'
            change = {'expected_version': place['version'], 'fields': {'name': 'P03 authorized proposal'}}
            matrix.check('claim-stranger-change-denied', 'catalog', change_path, 'POST', change, second_business, (403,))
            matrix.check('claim-owner-change-positive', 'catalog', change_path, 'POST', change, business, (202,))
            matrix.check('claim-stranger-business-claim-denied', 'catalog', firm_path + '/claims', 'POST',
                         {'place_id': place['place_id'], 'evidence_keys': ['private/p03-security-synthetic-evidence']},
                         second_business, (403,))
        finally:
            current = matrix.check('business-cleanup-version', 'catalog', firm_path, token=business)
            matrix.check('business-owner-cleanup', 'catalog', firm_path, 'DELETE', token=business,
                         expected=(204,), version=current['version'])
            matrix.check('ownership-account-disable', 'identity', account_path + '/status', 'PATCH',
                         {'status': 'DISABLED'}, admin, version=account['version'])
            matrix.check('ownership-place-hide', 'catalog', place_path + '/status', 'PUT',
                         {'status': 'HIDDEN'}, admin, version=place['version'])

    case('bola_idor', bola)

    def refresh():
        matrix.login('u2')
        first = matrix.sessions['u2']
        second = matrix.check('refresh-rotate', 'identity', '/api/v1/auth/refresh', 'POST',
                              {'refresh_token': first['refresh_token']})
        assert first['refresh_token'] != second['refresh_token']
        matrix.check('refresh-reuse-denied', 'identity', '/api/v1/auth/refresh', 'POST',
                     {'refresh_token': first['refresh_token']}, expected=(401,))
        matrix.check('refresh-family-revoked', 'identity', '/api/v1/auth/refresh', 'POST',
                     {'refresh_token': second['refresh_token']}, expected=(401,))
        matrix.check('refresh-access-revoked', 'trip', '/api/v1/me/trips',
                     token=second['access_token'], expected=(401,))

    case('refresh_reuse', refresh)

    def revoke():
        token = matrix.login('u2')
        matrix.check('session-live', 'trip', '/api/v1/me/trips', token=token)
        matrix.check('session-logout', 'identity', '/api/v1/auth/logout', 'POST',
                     {'refresh_token': matrix.sessions['u2']['refresh_token']}, token, (204,))
        for service, path in [('identity', '/api/v1/me'), ('trip', '/api/v1/me/trips'),
                              ('community', '/api/v1/me/favorites')]:
            matrix.check('session-revoked-' + service, service, path, token=token, expected=(401,))
        email = 'p03-security-' + uuid.uuid4().hex + '@example.invalid'
        password = prepare()['IDENTITY_FIXTURE_PASSWORD']
        matrix.check('claim-account-register', 'identity', '/api/v1/auth/register', 'POST',
                     {'email': email, 'password': password, 'display_name': 'P03 synthetic security'}, expected=(202,))
        deadline = time.monotonic() + 45
        message = None
        while time.monotonic() < deadline:
            with urlopen('http://127.0.0.1:59025/api/v1/messages', timeout=5) as response:
                messages = json.load(response).get('messages', [])
            message = next((row for row in messages if email in json.dumps(row)), None)
            if message:
                break
            time.sleep(.5)
        assert message is not None, 'Synthetic verification email not delivered'
        with urlopen('http://127.0.0.1:59025/api/v1/message/' + message['ID'], timeout=5) as response:
            content = json.load(response)
        matches = re.findall(r'[A-Za-z0-9_-]{32,}', content.get('Text', ''))
        assert matches, 'Synthetic email had no verification token'
        matrix.check('claim-account-verify', 'identity', '/api/v1/auth/verify-email', 'POST',
                     {'token': matches[-1]}, expected=(202,))

        def account_login():
            return matrix.check('claim-account-login', 'identity', '/api/v1/auth/login', 'POST',
                                {'email': email, 'password': password})['access_token']

        first = account_login()
        profile = matrix.check('claim-account-profile', 'identity', '/api/v1/me', token=first)
        target = '/api/v1/admin/users/' + profile['user_id']
        changed = matrix.check('claim-grant-business', 'identity', target + '/roles', 'PUT',
                               {'roles': ['USER', 'BUSINESS']}, admin, version=profile['version'])
        matrix.check('claim-old-user-token-rejected', 'trip', '/api/v1/me/trips', token=first, expected=(401,))
        second = account_login()
        matrix.check('claim-business-active', 'catalog', '/api/v1/businesses', token=second)
        changed = matrix.check('claim-remove-business', 'identity', target + '/roles', 'PUT',
                               {'roles': ['USER']}, admin, version=changed['version'])
        matrix.check('claim-old-business-token-rejected', 'catalog', '/api/v1/businesses',
                     token=second, expected=(401,))
        third = account_login()
        matrix.check('claim-current-user-role-denied', 'catalog', '/api/v1/businesses',
                     token=third, expected=(403,))
        # Disable the dedicated account, then prove an otherwise live JWT is dead.
        matrix.check('claim-account-disabled', 'identity', target + '/status', 'PATCH',
                     {'status': 'DISABLED'}, admin, version=changed['version'])
        matrix.check('claim-disabled-token-rejected', 'trip', '/api/v1/me/trips', token=third, expected=(401,))

    case('user_claim_revocation', revoke)

    def upload():
        png = bytes.fromhex('89504e470d0a1a0a') + b'P03 synthetic bytes'
        matrix.upload('upload-role-denied', user, png, 'image/png', (403,))
        matrix.upload('upload-mime-denied', admin, b'<script>synthetic</script>', 'image/png', (400,))
        matrix.upload('upload-short-denied', admin, b'x', 'image/png', (400,))
        # Valid bytes enter quarantine; no executable content is made public.
        media = matrix.upload('upload-quarantine', admin, png, 'image/png', (200, 201))
        matrix.check('upload-quarantine-not-readable', 'catalog', '/api/v1/media/' + media['media_id'],
                     token=admin, expected=(404,))

    case('upload', upload)

    def rate():
        address = 'p03-rate-' + uuid.uuid4().hex + '@example.invalid'
        for i in range(10):
            matrix.check('rate-invalid-' + str(i), 'identity', '/api/v1/auth/login', 'POST',
                         {'email': address, 'password': 'Wrong-synthetic-password-123!'}, expected=(401,))
        matrix.check('rate-throttled', 'identity', '/api/v1/auth/login', 'POST',
                     {'email': address, 'password': 'Wrong-synthetic-password-123!'}, expected=(429,))

    case('rate_limit', rate)

    def redaction():
        # Include startup logs as well: successful requests may intentionally be
        # silent. An empty request-only interval is not usable logging evidence.
        captured = compose('logs', '--no-color', *SERVICES, 'gateway')
        logs = captured.stdout + captured.stderr
        values = set(matrix.sensitive)
        values.add(prepare()['IDENTITY_FIXTURE_PASSWORD'])
        stats = redaction_stats(logs, values, matrix.rows)
        matrix.rows.append({'name': 'runtime-log-and-report-redaction', 'service': 'platform',
                            **stats})
        assert stats['pass'], 'Empty logs or sensitive synthetic values found in logs/report'

    case('secret_pii_redaction', redaction)
    passed = all(c['pass'] for c in checks)
    return {'pass': passed, 'full_role_matrix_pass': checks[0]['pass'], 'scope': 'non-ai',
            'checks': checks, 'request_count': len(matrix.rows),
            'role_matrix_scope': 'All protected non-AI contract operations: anonymous/malformed JWT denial; '
                'USER/BUSINESS denial for admin routes; positive samples per service and live ownership mutations. '
                'This is not a claim of positive calls for every endpoint; provider suites supply broader positive API coverage.',
            'excluded': ['intelligence endpoints', 'recommendations', 'training', 'AI quality'],
            'secret_pii_redaction_verified': checks[-1]['pass']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).parent / '.local/p03/security.json')
    parser.add_argument('--release-id', required=True)
    args = parser.parse_args()
    before = candidate_manifest()['sha256']
    report = run()
    for index, check in enumerate(report.get('checks', [])):
        check['evidence'] = [args.output.name + '#/checks/' + str(index) + '/requests']
    manifest = candidate_manifest()
    after = manifest['sha256']
    report.update(release_id=args.release_id, candidate_before_sha256=before, candidate_sha256=after,
                  timestamp=datetime.now(timezone.utc).isoformat(),
                  source_hashes={name: manifest['files'][name] for name in manifest.get('files', {})
                                 if name in {'backend/infra/p03_nonai_security.py', 'backend/infra/test_p03_nonai_security.py'}})
    if before != after:
        report['pass'] = False
        report['source_changed_during_run'] = True
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({key: report[key] for key in ('pass', 'full_role_matrix_pass', 'request_count')}))
    raise SystemExit(0 if report['pass'] else 1)


if __name__ == '__main__':
    main()
