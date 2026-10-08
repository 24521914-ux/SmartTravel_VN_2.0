"""HTTP smoke of Vite dev proxy against a synthetic Catalog stub, not browser E2E."""
import json
import os
import socket
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from urllib.request import urlopen
from contract_stub import Server

FRONTEND=Path(__file__).resolve().parents[2]/'frontend'
server=Server('catalog')
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
env=dict(os.environ,P00_STUB_TARGET=f'http://127.0.0.1:{server.server_port}')
thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
try:
    with tempfile.TemporaryFile() as log:
        process=subprocess.Popen(['node','node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',str(port)],cwd=FRONTEND,env=env,stdout=log,stderr=subprocess.STDOUT)
        try:
            ready=False
            for _ in range(30):
                if process.poll() is not None: raise RuntimeError('Vite exited during local proxy smoke test')
                try:
                    with urlopen(f'http://127.0.0.1:{port}',timeout=2) as response: ready=b'id="root"' in response.read()
                    if ready: break
                except OSError: pass
                time.sleep(1)
            assert ready
            with urlopen(f'http://127.0.0.1:{server.server_port}/api/v1/places?limit=20',timeout=3) as response: json.load(response)
            with urlopen(f'http://127.0.0.1:{port}/api/v1/places?limit=20',timeout=15) as response: page=json.load(response)
            assert page['items'] and all(p['status']=='PUBLISHED' for p in page['items'])
            print('PASS frontend scaffold HTTP and Vite proxy to Catalog synthetic fixture; browser/E2E not tested.')
        finally:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait()
finally:
    server.shutdown(); server.server_close(); thread.join()
