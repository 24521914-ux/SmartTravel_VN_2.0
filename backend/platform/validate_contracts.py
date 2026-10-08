"""Validate all contract candidate schemas/examples and verify revision hashes.
Use --refresh-checksums only after an intentional reviewed artifact change.
"""
import argparse
import copy
import hashlib
import json
import re
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate_spec

ROOT = Path(__file__).resolve().parents[1] / 'contracts'
FORMAT = FormatChecker()

def validator(schema):
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FORMAT)

def artifact_checksum(data):
    """Ignore Git's CRLF/LF conversion, but preserve all other artifact bytes."""
    return hashlib.sha256(data.replace(b'\r\n', b'\n')).hexdigest()

def run(refresh=False):
    registry = json.loads((ROOT/'registry.json').read_text(encoding='utf-8'))
    count = 0
    for service in registry['services']:
        spec = json.loads((ROOT/'openapi'/f'{service}.yaml').read_text(encoding='utf-8'))
        validate_spec(spec)
        fixtures = json.loads((ROOT/'fixtures'/f'{service}.http.json').read_text(encoding='utf-8'))
        operations = set()
        for path, methods in spec['paths'].items():
            for method, operation in methods.items():
                name = operation['operationId']
                assert name not in operations, f'Duplicate operationId: {service}/{name}'
                operations.add(name)
                case = fixtures[name]
                assert case['method'] == method.upper()
                route='^'+re.sub(r'\{\w+\}', '[^/]+', path)+'$'
                assert re.match(route, case['path']), f'Example route mismatch: {name}'
                assert str(case['status']) in operation['responses']
                if path.startswith('/internal/') or '/admin/' in path:
                    assert operation['security'], f'Unprotected privileged API {path}'
                for parameter in operation.get('parameters', []):
                    validator(parameter['schema'])
                    if parameter['in'] == 'header' and parameter['required']:
                        validator(parameter['schema']).validate(case['headers'][parameter['name']])
                if 'requestBody' in operation:
                    schema = operation['requestBody']['content']['application/json']['schema']
                    check = validator(schema)
                    check.validate(case['request'])
                    invalid = copy.deepcopy(case['request'])
                    invalid['__unexpected__'] = True
                    assert list(check.iter_errors(invalid)), f'Unexpected fields accepted {name}'
                    if schema.get('required'):
                        invalid = copy.deepcopy(case['request'])
                        del invalid[schema['required'][0]]
                        assert list(check.iter_errors(invalid)), f'Missing required field accepted {name}'
                response = operation['responses'][str(case['status'])]
                if 'content' in response:
                    validator(response['content']['application/json']['schema']).validate(case['response'])
                for code, response in operation['responses'].items():
                    if int(code) >= 400:
                        validator(response['content']['application/json']['schema']).validate({'code':'SYNTHETIC','message':'Synthetic error','traceId':'local-test','fieldErrors':[]})
                count += 1
        assert operations == set(fixtures) == set(registry['http_operations'][service])
    for name, metadata in registry['messages'].items():
        schema = json.loads((ROOT/'events'/f'{name}.schema.json').read_text(encoding='utf-8'))
        event = json.loads((ROOT/'fixtures/events'/f'{name}.json').read_text(encoding='utf-8'))
        check = validator(schema)
        check.validate(json.loads(json.dumps(event)))
        invalid = copy.deepcopy(event); invalid['event_id']='invalid-uuid'
        assert list(check.iter_errors(invalid))
        invalid = copy.deepcopy(event); invalid['schema_version']=999
        assert list(check.iter_errors(invalid))
        assert metadata['consumers'] and metadata['producer']
        assert metadata['kind'] in ['event','command']
    shared = json.loads((ROOT/'fixtures/shared.json').read_text(encoding='utf-8'))
    assert len({u['id'] for u in shared['users']}) == 4
    assert {u['consent'] for u in shared['users']} == {True, False}
    assert shared['model']['production_eligible'] is False
    manifest = {str(p.relative_to(ROOT)).replace('\\','/'):artifact_checksum(p.read_bytes())
                for p in sorted(ROOT.rglob('*')) if p.is_file() and p.name!='checksums.json'}
    if refresh:
        (ROOT/'checksums.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    else:
        expected=json.loads((ROOT/'checksums.json').read_text(encoding='utf-8'))
        assert expected==manifest, 'Contract revision changed: review artifacts and explicitly refresh checksums'
    print(f'PASS {count} HTTP operations/examples/errors; {len(registry["messages"])} event/command examples, negative cases and SHA-256 manifest.')

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--refresh-checksums',action='store_true')
    run(parser.parse_args().refresh_checksums)
