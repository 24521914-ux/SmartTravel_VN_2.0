"""UNSAFE TEST-ONLY issuer bound to loopback, ephemeral keys, local-test issuer.
Never deploy this server or reuse its tokens/keys outside isolated dev/tests.
GET /jwks; GET /token?aud=catalog&role=USER; POST /rotate.
"""
import argparse
import base64
import json
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit,parse_qs
from cryptography.hazmat.primitives.asymmetric import rsa
import jwt

SERVICES=['identity','catalog','community','trip','ingestion','intelligence']

def b64(number): return base64.urlsafe_b64encode(number.to_bytes((number.bit_length()+7)//8,'big')).decode().rstrip('=')

class Issuer(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,port=0):
        self.lock=threading.Lock(); self.keys={}; self.current=None; self.rotate()
        super().__init__(('127.0.0.1',port),Handler)
    def rotate(self):
        key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        kid=str(uuid.uuid4())
        with self.lock:
            self.keys[kid]=key; self.current=kid
    def jwks(self):
        with self.lock:
            result=[]
            for kid,key in self.keys.items():
                pub=key.public_key().public_numbers()
                result.append({'kty':'RSA','use':'sig','alg':'RS256','kid':kid,'n':b64(pub.n),'e':b64(pub.e)})
            return {'keys':result}
    def token(self,audience,role):
        now=int(time.time())
        claims={'iss':'local-test','sub':'00000000-0000-4000-8000-000000000001','aud':audience,'iat':now,'exp':now+600,'jti':str(uuid.uuid4()),'roles':[role],
            'scope':f'{audience}:read {audience}:write'+(f' {audience}:admin' if role=='ADMIN' else '')}
        with self.lock: return jwt.encode(claims,self.keys[self.current],algorithm='RS256',headers={'kid':self.current})

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def reply(self,status,value):
        data=json.dumps(value).encode(); self.send_response(status)
        self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        url=urlsplit(self.path); params=parse_qs(url.query)
        if url.path=='/jwks': return self.reply(200,self.server.jwks())
        if url.path=='/token':
            audience=params.get('aud',['catalog'])[0]; role=params.get('role',['USER'])[0]
            if audience not in SERVICES or role not in ['USER','BUSINESS','ADMIN']: return self.reply(400,{'error':'invalid-test-claims'})
            return self.reply(200,{'test_only':True,'access_token':self.server.token(audience,role),'token_type':'Bearer','expires_in':600})
        self.reply(404,{'error':'test-route-not-found'})
    def do_POST(self):
        if self.path!='/rotate': return self.reply(404,{'error':'test-route-not-found'})
        self.server.rotate(); self.reply(200,{'test_only':True,'status':'rotated'})

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--port',type=int,default=18083)
    args=parser.parse_args(); server=Issuer(args.port)
    print(f'TEST ONLY issuer/JWKS on 127.0.0.1:{server.server_port}; ephemeral keys, no real users',flush=True)
    server.serve_forever()
