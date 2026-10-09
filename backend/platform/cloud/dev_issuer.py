"""UNSAFE development issuer: expose only on isolated Docker network/host loopback."""
import threading
from http.server import ThreadingHTTPServer
from test_issuer import Handler, Issuer


class DockerIssuer(Issuer):
    def __init__(self):
        self.lock = threading.Lock()
        self.keys = {}
        self.current = None
        self.rotate()
        ThreadingHTTPServer.__init__(self, ('0.0.0.0', 18083), Handler)


if __name__ == '__main__':
    print('TEST ONLY: ephemeral JWT keys, no real users; never deploy publicly', flush=True)
    DockerIssuer().serve_forever()
