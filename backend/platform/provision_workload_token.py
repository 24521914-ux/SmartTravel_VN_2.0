"""Sign destination-scoped workloads using the persistent Identity issuer key.

Token is written only to the requested file. Reissue before expiry and reload the
consumer. This utility requires cryptography, and never prints credentials.
"""
import argparse
import base64
import json
import time
import uuid
from pathlib import Path
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa


def b64(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def number(value):
    return int.from_bytes(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)), "big")


def issue(key_file, kid, issuer, client, audience, scopes, ttl=3600):
    if not 60 <= ttl <= 86400:
        raise ValueError("TTL must be between 60 and 86400 seconds")
    if audience not in {"identity", "catalog", "community", "trip", "ingestion", "intelligence"}:
        raise ValueError("Unknown destination")
    if not client or not scopes or any(not s.startswith(audience + ":") for s in scopes):
        raise ValueError("Scope must belong to destination")
    key = next(k for k in json.loads(Path(key_file).read_text(encoding="utf-8"))["keys"] if k["kid"] == kid)
    private = rsa.RSAPrivateNumbers(number(key["p"]), number(key["q"]), number(key["d"]),
        number(key["dp"]), number(key["dq"]), number(key["qi"]),
        rsa.RSAPublicNumbers(number(key["e"]), number(key["n"]))).private_key()
    now = int(time.time())
    claims = {"iss": issuer, "sub": str(uuid.uuid5(uuid.NAMESPACE_URL, "smarttravel-workload:" + client)),
              "aud": [audience], "iat": now, "exp": now + ttl, "jti": str(uuid.uuid4()),
              "roles": ["SERVICE"], "client_id": client, "scope": " ".join(scopes)}
    encoded = lambda value: b64(json.dumps(value, separators=(",", ":")).encode())
    message = encoded({"alg": "RS256", "kid": kid}) + "." + encoded(claims)
    token = message + "." + b64(private.sign(message.encode(), padding.PKCS1v15(), hashes.SHA256()))
    if len(token) > 1024:
        raise ValueError("Workload token exceeds frozen bound; split scopes")
    return token


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("key-file", "kid", "issuer", "client", "audience", "output"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--scope", action="append", required=True)
    parser.add_argument("--ttl", type=int, default=3600)
    args = parser.parse_args()
    token = issue(args.key_file, args.kid, args.issuer, args.client, args.audience, args.scope, args.ttl)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(token, encoding="utf-8")
    print("Scoped credential written; expires in", args.ttl, "seconds")
