"""Synthetic licensed external source for P02; never substitutes a SmartTravel service."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from urllib.parse import parse_qs, urlparse


class Source(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        run_id = query.get('run', ['local'])[0][:64]
        body = {'records': [{'external_id': 'p02-external-1', 'name': 'P02 source '+run_id,
            'latitude': 16.047079, 'longitude': 108.20623, 'currency': 'VND', 'price': '25000',
            'category_ids': ['20000000-0000-0000-0000-000000000001'], 'opening_hours': []}],
            'next_cursor': None, 'checkpoint': 'p02-source-v1'}
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8080), Source).serve_forever()
