"""Identity RS256 signing key (private JWK set), created once and never rotated by this tool.

`generate()` is shared with p02.py; `main()` is the key-init container entrypoint and writes
the key into the Identity signing-key volume only when it does not exist yet.
"""
import base64
import json
import os
from pathlib import Path


def generate(kid):
    from cryptography.hazmat.primitives.asymmetric import rsa
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048).private_numbers()
    public = private.public_numbers

    def encoded(number):
        return base64.urlsafe_b64encode(number.to_bytes((number.bit_length()+7)//8, 'big')).rstrip(b'=').decode()
    key = dict(kty='RSA', kid=kid, use='sig', alg='RS256',
               **{k: encoded(v) for k, v in dict(n=public.n, e=public.e, d=private.d,
                   p=private.p, q=private.q, dp=private.dmp1, dq=private.dmq1, qi=private.iqmp).items()})
    return {'keys': [key]}


def main():
    path = Path(os.environ.get('IDENTITY_KEYS_FILE', '/keys/keys.json'))
    kid = os.environ.get('IDENTITY_ACTIVE_KID', 'p02-identity-1')
    owner = int(os.environ.get('IDENTITY_KEYS_UID', '10001'))
    if path.exists():
        keys = json.loads(path.read_text(encoding='utf-8'))['keys']
        if not any(key.get('kid') == kid for key in keys):
            raise SystemExit(f'key-init: {path} exists without active kid {kid}; refusing to replace it')
        print(f'key-init: existing signing key kept ({kid})', flush=True)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('x', encoding='utf-8') as stream:
            stream.write(json.dumps(generate(kid)))
        print(f'key-init: created signing key {kid}', flush=True)
    if os.name != 'nt':
        os.chown(path, owner, owner)
        path.chmod(0o600)


if __name__ == '__main__':
    main()
