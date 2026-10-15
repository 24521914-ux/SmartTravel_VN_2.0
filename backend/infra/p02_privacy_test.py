"""Live consent and licensed-source revocation checks on the owned P02 stack."""
import json
import uuid
from datetime import datetime, timedelta, timezone
from p02 import LOCAL, PORTS, request
from p02_smoke import call, login, eventually, diagnostic_sql, internal


def privacy():
    admin, user = login('admin'), login('u1')
    profile = call('identity', '/api/v1/me', token=user)
    user_id = profile['user_id']
    prefs = call('identity', '/api/v1/me/preferences', token=user)
    body = {k: v for k, v in prefs.items() if k != 'version'}
    body['personalization_enabled'] = False
    call('identity', '/api/v1/me/preferences', 'PUT', body, user,
         version=prefs['version'], key=str(uuid.uuid4()))
    eventually(lambda: diagnostic_sql('intelligence', "SELECT personalization_enabled FROM intelligence.user_feature_profiles WHERE user_id='"+user_id+"'"),
               lambda value: value == 'f', 'live consent revoke disables personalization')
    assert diagnostic_sql('intelligence', "SELECT count(*) FROM intelligence.interactions WHERE user_id='"+user_id+"'") == '0'
    prefs = call('identity', '/api/v1/me/preferences', token=user)
    body = {k: v for k, v in prefs.items() if k != 'version'}
    body['personalization_enabled'] = True
    call('identity', '/api/v1/me/preferences', 'PUT', body, user,
         version=prefs['version'], key=str(uuid.uuid4()))
    eventually(lambda: diagnostic_sql('intelligence', "SELECT personalization_enabled FROM intelligence.user_feature_profiles WHERE user_id='"+user_id+"'"),
               lambda value: value == 't', 'explicit consent grant propagates')
    internal('intelligence', '/internal/v1/features/rebuild', 'POST', {})
    assert diagnostic_sql('intelligence', "SELECT count(*) FROM intelligence.interactions WHERE user_id='"+user_id+"'") == '0', 'Bootstrap resurrected pre-revocation history'
    # Valid human credentials cannot read other users' historical Trip events directly.
    code, _, _ = request('http://127.0.0.1:'+str(PORTS['trip']), '/internal/v1/interactions/snapshot', token=user)
    assert code == 403, 'Historical stream accepted a human token'
    source = call('ingestion', '/api/v1/admin/data-sources', 'POST',
                  {'name': 'P02 privacy '+str(uuid.uuid4()), 'uri': 'http://source-sandbox:8080/records',
                   'secret_reference': 'none', 'license_version': 'synthetic-p02-privacy-v1',
                   'allow_storage': True, 'allow_training': True}, admin, expected=201)
    source_id = source['source_id']
    call('ingestion', '/api/v1/admin/data-sources/'+source_id+'/policy', 'PATCH',
         {'allow_training': False, 'status': 'REVOKED'}, admin, version=source['version'])
    eventually(lambda: diagnostic_sql('intelligence', "SELECT allow_training FROM intelligence.source_policies WHERE source_id='"+source_id+"'"),
               lambda value: value == 'f', 'live source revoke disables training policy')
    end = datetime.now(timezone.utc)
    result = call('intelligence', '/api/v1/admin/datasets', 'POST',
                  {'source_ids': [source_id], 'feature_schema_version': 1,
                   'criteria': {'start': (end-timedelta(days=1)).isoformat(), 'end': end.isoformat()}},
                  admin, expected=400, key=str(uuid.uuid4()))
    assert result['code'] == 'SOURCE_TRAINING_FORBIDDEN'
    report = {'status': 'PASS', 'cases': ['consent-revoke-purge', 'explicit-consent-grant',
              'historical-bootstrap-does-not-resurrect', 'human-historical-stream-denied',
              'source-policy-revoke', 'revoked-source-dataset-denied']}
    (LOCAL/'privacy-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('PASS connected privacy and source revocation checks', flush=True)


if __name__ == '__main__':
    privacy()
