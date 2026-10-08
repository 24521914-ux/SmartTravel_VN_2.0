import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request,urlopen
from jsonschema import Draft202012Validator,FormatChecker
from contract_stub import Server,ROOT

class ContractStubTests(unittest.TestCase):
    def test_all_operations_over_real_http_with_fixture_responses(self):
        count=0
        for service in ['identity','catalog','community','trip','ingestion','intelligence']:
            server=Server(service)
            thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
            try:
                for path,methods in server.spec['paths'].items():
                    for method,op in methods.items():
                        with self.subTest(service=service,operation=op['operationId']):
                            case=server.fixtures[op['operationId']]
                            headers={'Content-Type':'application/json','Authorization':f'Bearer p00:{service}:all',**case['headers']}
                            request=Request(f'http://127.0.0.1:{server.server_port}'+case['path'],method=case['method'],headers=headers,data=json.dumps(case['request']).encode() if 'request' in case else None)
                            with urlopen(request,timeout=3) as response:
                                self.assertEqual(response.status,case['status'])
                                if 'response' in case:
                                    value=json.load(response)
                                    schema=op['responses'][str(case['status'])]['content']['application/json']['schema']
                                    Draft202012Validator(schema,format_checker=FormatChecker()).validate(value)
                                count+=1
            finally:
                server.shutdown(); server.server_close(); thread.join()
        registry=json.loads((ROOT/'registry.json').read_text(encoding='utf-8'))
        self.assertEqual(count,sum(len(x) for x in registry['http_operations'].values()))

    def test_common_fixture_visibility_consent_revocation_and_missing_ids(self):
        for service,path,ids,key,expected in [
            ('catalog','/internal/v1/places/batch',['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'],'place_id',1),
            ('identity','/internal/v1/users/preferences/batch',['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'],'user_id',2),
            ('ingestion','/internal/v1/sources/policies/batch',['30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002'],'source_id',2)]:
            server=Server(service); thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
            try:
                request=Request(f'http://127.0.0.1:{server.server_port}'+path,data=json.dumps({'ids':ids}).encode(),headers={'Content-Type':'application/json','Authorization':f'Bearer p00:{service}:all'})
                with urlopen(request,timeout=3) as response: result=json.load(response)
                self.assertEqual(len(result['items']),expected)
                self.assertEqual(set(ids),{item[key] for item in result['items']}|set(result['missing_ids']))
                if service=='catalog': self.assertEqual(result['missing_ids'],[ids[1]])
                if service=='identity': self.assertEqual([item['personalization_enabled'] for item in result['items']],[True,False])
                if service=='ingestion':
                    self.assertEqual([item['status'] for item in result['items']],['PERMITTED','REVOKED'])
                    self.assertFalse(result['items'][1]['allow_training'])
            finally: server.shutdown(); server.server_close(); thread.join()

    def test_auth_precondition_invalid_body_errors_and_timeout(self):
        server=Server('trip'); thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
        case=server.fixtures['createTrip']; url=f'http://127.0.0.1:{server.server_port}'+case['path']
        def call(headers=None,body=None,method='POST',path=None,timeout=3):
            req=Request(path or url,method=method,headers={'Content-Type':'application/json',**(headers or {})},data=json.dumps(body if body is not None else case['request']).encode())
            return urlopen(req,timeout=timeout)
        try:
            for status,headers in [(401,{}),(403,{'Authorization':'Bearer p00:trip:read'}),(409,{'Authorization':'Bearer p00:trip:all','X-Stub-Scenario':'409'})]:
                with self.assertRaises(HTTPError) as error: call(headers)
                self.assertEqual(error.exception.code,status); error.exception.close()
            headers={'Authorization':'Bearer p00:trip:all','Idempotency-Key':'synthetic'}
            with self.assertRaises(HTTPError) as error: call(headers,{'unexpected':True})
            self.assertEqual(error.exception.code,400); error.exception.close()
            detail=f'http://127.0.0.1:{server.server_port}/api/v1/trips/00000000-0000-4000-8000-000000000001'
            with self.assertRaises(HTTPError) as error: call(headers,{'name':'synthetic'},'PATCH',detail)
            self.assertEqual(error.exception.code,428); error.exception.close()
            with self.assertRaises(TimeoutError): call({**headers,'X-Stub-Scenario':'timeout'},timeout=0.1)
        finally:
            server.shutdown(); server.server_close(); thread.join()

if __name__=='__main__': unittest.main()
