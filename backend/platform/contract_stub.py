"""Schema-driven SYNTHETIC loopback stub for any one service contract.
Never issue real tokens or use this server in production.
python backend/platform/contract_stub.py --service catalog --port 18082
Synthetic authorization: Bearer p00:<service>:all (or :read).
"""
import argparse
import copy
import json
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from jsonschema import Draft202012Validator, FormatChecker, ValidationError

ROOT=Path(__file__).resolve().parents[1]/'contracts'

class Server(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,service,port=0):
        self.service=service
        self.spec=json.loads((ROOT/'openapi'/f'{service}.yaml').read_text(encoding='utf-8'))
        self.fixtures=json.loads((ROOT/'fixtures'/f'{service}.http.json').read_text(encoding='utf-8'))
        self.shared=json.loads((ROOT/'fixtures/shared.json').read_text(encoding='utf-8'))
        self.routes=[]
        for path,methods in self.spec['paths'].items():
            regex='^'+re.sub(r'\{(\w+)\}',r'(?P<\1>[^/]+)',path)+'$'
            self.routes.append((path,re.compile(regex),methods))
        self.routes.sort(key=lambda r:(r[0].count('{'),-len(r[0])))
        super().__init__(('127.0.0.1',port),Handler)

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def reply(self,status,value=None):
        data=json.dumps(value).encode() if value is not None else b''
        try:
            self.send_response(status)
            if data: self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):
            self.close_connection=True
    def error(self,status,code):
        self.reply(status,{'code':code,'message':'Synthetic local stub response','traceId':'local-stub','fieldErrors':[]})
    def handle_request(self):
        parsed=urlsplit(self.path)
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<=size<=1_000_000: return self.error(400,'INVALID_BODY_SIZE')
            raw=self.rfile.read(size) if size else b''
        except ValueError: return self.error(400,'INVALID_BODY_SIZE')
        found=None
        for path,regex,methods in self.server.routes:
            match=regex.match(parsed.path)
            if match:
                found=(match,methods); break
        if not found: return self.error(404,'NOT_FOUND')
        match,methods=found
        op=methods.get(self.command.lower())
        if not op: return self.error(405,'METHOD_NOT_ALLOWED')
        if op['security']:
            token=self.headers.get('Authorization','')
            if token not in [f'Bearer p00:{self.server.service}:all',f'Bearer p00:{self.server.service}:read']:
                return self.error(401,'INVALID_TEST_TOKEN')
            if token.endswith(':read') and not op['x-required-scope'].endswith(':read'):
                return self.error(403,'INSUFFICIENT_TEST_SCOPE')
        scenario=self.headers.get('X-Stub-Scenario','success')
        if scenario in ['403','404','409','503']: return self.error(int(scenario),'SYNTHETIC_SCENARIO')
        if scenario=='timeout': time.sleep(2)
        query=parse_qs(parsed.query)
        body={}
        try:
            for p in op['parameters']:
                value=(match.groupdict().get(p['name']) if p['in']=='path' else self.headers.get(p['name']) if p['in']=='header' else query.get(p['name'],[None])[0])
                if value is None:
                    if p['required']:
                        return self.error(428 if p['name']=='If-Match' else 400,'MISSING_PARAMETER')
                    continue
                if p['schema'].get('type')=='integer': value=int(value)
                elif p['schema'].get('type')=='number': value=float(value)
                Draft202012Validator(p['schema'],format_checker=FormatChecker()).validate(value)
            if 'requestBody' in op:
                if not raw: return self.error(400,'INVALID_BODY_SIZE')
                body=json.loads(raw)
                schema=op['requestBody']['content']['application/json']['schema']
                Draft202012Validator(schema,format_checker=FormatChecker()).validate(body)
        except (ValueError,ValidationError,TypeError): return self.error(400,'INVALID_INPUT')
        case=self.server.fixtures[op['operationId']]
        value=copy.deepcopy(case.get('response'))
        name=op['operationId']
        if name in ['placeBatch','validatePlaces','userStatusBatch','preferencesBatch','sourcePolicyBatch']:
            kind='places' if name in ['placeBatch','validatePlaces'] else 'sources' if name=='sourcePolicyBatch' else 'users'
            key='place_id' if kind=='places' else 'source_id' if kind=='sources' else 'user_id'
            prototype=value['items'][0]
            requested=body['ids']; records=self.server.shared[kind]
            value['items']=[]
            for record in records:
                identifier=record.get(key,record.get('id'))
                if identifier not in requested: continue
                if name=='placeBatch' and record['status']!='PUBLISHED': continue
                item=copy.deepcopy(prototype)
                item.update({k:v for k,v in record.items() if k in item})
                item[key]=identifier
                if name=='validatePlaces': item['public']=record['status']=='PUBLISHED'
                if name=='userStatusBatch': item['status']='ACTIVE'
                if name=='preferencesBatch': item['personalization_enabled']=record['consent']
                value['items'].append(item)
            returned={item[key] for item in value['items']}
            value['missing_ids']=[identifier for identifier in requested if identifier not in returned]
        self.reply(case['status'],value)
    do_GET=handle_request
    do_POST=handle_request
    do_PUT=handle_request
    do_PATCH=handle_request
    do_DELETE=handle_request

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--service',required=True,choices=['identity','catalog','community','trip','ingestion','intelligence']); parser.add_argument('--port',type=int,default=18082)
    args=parser.parse_args()
    print(f'SYNTHETIC {args.service} stub on loopback port {args.port}; tokens are fake fixture markers',flush=True)
    Server(args.service,args.port).serve_forever()
