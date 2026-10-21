"""Frozen and live HTTP contract evidence for P03 non-AI scope.

Live checks use P02 synthetic fixture accounts and read non-AI endpoints only.
This proves HTTP schema consumption, not broker producer compatibility; actual
review-to-Catalog propagation remains covered by the E2E/resilience exercises.
"""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import uuid

from jsonschema import Draft202012Validator, FormatChecker
from p02 import ROOT, prepare, request
from p03_candidate import candidate_manifest
from p03_verify import contracts

SERVICES = ('identity','catalog','community','trip','ingestion')
PATCH_PATH = '/api/v1/admin/offerings/{offering_id}'
STATUS_SCHEMA = {'type':'string','enum':['DRAFT','PUBLISHED','HIDDEN','ARCHIVED']}


def compatibility(old, new, service):
    """Accept only the documented optional offering PATCH field addition.

    All legacy request fields, response schemas, enum/error sets and operations
    must otherwise remain byte-structure equivalent. This intentionally rejects
    unreviewed changes rather than claiming a general schema subtyping proof.
    """
    normalized = deepcopy(new)
    addition = False
    if service == 'catalog':
        old_op = old['paths'][PATCH_PATH]['patch']
        new_op = normalized['paths'][PATCH_PATH]['patch']
        old_schema = old_op['requestBody']['content']['application/json']['schema']
        new_schema = new_op['requestBody']['content']['application/json']['schema']
        if 'status' not in old_schema.get('properties',{}) and 'status' in new_schema.get('properties',{}):
            if new_schema['properties']['status'] != STATUS_SCHEMA or 'status' in new_schema.get('required',[]):
                return {'pass':False,'optional_status_added':False,'reason':'Unreviewed or required publication field'}
            del new_schema['properties']['status']
            addition = True
            if 'description' not in old_op:
                new_op.pop('description',None)
    return {'pass':old == normalized,'optional_status_added':addition,
            'reason':'Only optional publication status added' if old == normalized and addition else
                     'Legacy contract unchanged' if old == normalized else 'Unreviewed contract change'}


def response_schema(document, path, method, status):
    for template,item in document['paths'].items():
        pattern = re.sub(r'\{[^}]+\}','[^/]+',template)
        if re.fullmatch(pattern,path.split('?')[0]) and method.lower() in item:
            return item[method.lower()]['responses'][str(status)]['content']['application/json']['schema']
    raise ValueError('No frozen response schema for live request')


def run(release_id, output, gateway='http://127.0.0.1:58080'):
    before = candidate_manifest()['sha256']
    trace = str(uuid.uuid4())
    frozen = contracts()
    if not frozen['pass']:
        raise RuntimeError('Frozen contract validation failed')
    documents = {s:json.loads((ROOT/f'backend/contracts/openapi/{s}.yaml').read_text(encoding='utf-8')) for s in SERVICES}
    baseline = subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
    evolution = {}
    for service in SERVICES:
        old = subprocess.run(['git','show',baseline+f':backend/contracts/openapi/{service}.yaml'],
                             cwd=ROOT,capture_output=True,check=True).stdout
        evolution[service] = compatibility(json.loads(old),documents[service],service)
    if not all(value['pass'] for value in evolution.values()):
        raise RuntimeError('Unreviewed contract evolution')
    rows = []

    def call(service,path,method='GET',body=None,token=None,expected=200):
        # Deny AI even if this script is modified to include its routes later.
        if service not in SERVICES:
            raise ValueError('AI service outside contract exercise')
        code,data,headers = request(gateway,'/api/'+service+path,method,body,token,{'X-Correlation-ID':trace})
        if code != expected:
            raise RuntimeError('Unexpected non-AI contract HTTP status: '+service+' '+str(code))
        Draft202012Validator(response_schema(documents[service],path,method,code),format_checker=FormatChecker()).validate(data)
        rows.append({'service':service,'method':method,'path':path,'status':code,
                     'response_schema_validated':True,'correlation_id':trace})
        return data

    sessions = {}
    for alias in ('u1','admin'):
        sessions[alias] = call('identity','/api/v1/auth/login','POST',
            {'email':'fixture-'+alias+'@example.invalid','password':prepare()['IDENTITY_FIXTURE_PASSWORD']})['access_token']
    user,admin = sessions['u1'],sessions['admin']
    call('identity','/api/v1/me',token=user)
    call('catalog','/api/v1/categories')
    call('catalog','/api/v1/places?limit=20')
    call('community','/api/v1/me/favorites',token=user)
    call('trip','/api/v1/me/trips',token=user)
    call('ingestion','/api/v1/admin/data-sources',token=admin)
    call('identity','/api/v1/admin/users',token=user,expected=403)
    call('catalog','/api/v1/places/00000000-0000-4000-8000-000000000000',expected=404)
    frontend = subprocess.run(['node','--test','scripts/mock-contract-test.mjs'],cwd=ROOT/'frontend',
                              capture_output=True,text=True,encoding='utf-8')
    if frontend.returncode:
        raise RuntimeError('Frontend contract tests failed')
    output.parent.mkdir(parents=True,exist_ok=True)
    log = output.with_suffix('.frontend.log')
    log.write_text(frontend.stdout+frontend.stderr,encoding='utf-8')
    after = candidate_manifest()['sha256']
    reference = output.resolve().as_posix()
    checks = [
        {'id':'producer_consumer','status':'PASS','evidence':[reference+'#live_http'],
         'assertion':'Actual responses from five non-AI HTTP producers consumed and validated against frozen JSON schemas'},
        {'id':'frontend_contracts','status':'PASS','evidence':[log.resolve().as_posix()],
         'assertion':'Actual Node frontend transport contract tests passed; mock HTTP, no AI endpoint calls'},
        {'id':'old_new_compatibility','status':'PASS','evidence':[reference+'#evolution'],
         'assertion':'All five legacy OpenAPI documents unchanged except optional Catalog offering PATCH status'},
        {'id':'enum_error_schema_evolution','status':'PASS','evidence':[reference+'#evolution',reference+'#live_http'],
         'assertion':'Legacy enums/error schemas unchanged and live403/404 responses validate'}]
    sources = ['backend/infra/p03_nonai_contracts.py','backend/infra/p03_verify.py',
               'backend/infra/p02.py','frontend/scripts/mock-contract-test.mjs']
    report = {'scope':'non-ai','release_id':release_id,'timestamp':datetime.now(timezone.utc).isoformat(),
              'candidate_before_sha256':before,'candidate_sha256':after,'candidate_unchanged':before==after,
              'source_hashes':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in sources},
              'pass':before==after,'checks':checks,'frozen':frozen,'live_http':rows,'evolution':evolution,
              'baseline_commit':baseline,'frontend_log_sha256':hashlib.sha256(log.read_bytes()).hexdigest(),
              'ai_endpoints_called':0,'limitations':['HTTP consumer compatibility measured; broker behavior requires separate E2E/resilience evidence.']}
    output.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'pass':report['pass'],'live_non_ai_responses_validated':len(rows),'report':str(output)}))
    return 0 if report['pass'] else 2


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-id',required=True)
    parser.add_argument('--output',type=Path,default=Path(__file__).parent/'.local/p03/contracts.json')
    args = parser.parse_args()
    raise SystemExit(run(args.release_id,args.output))
