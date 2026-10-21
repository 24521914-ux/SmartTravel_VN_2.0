"""Compile a frozen non-AI candidate and bind each JAR to its local Docker image.

Does not deploy, commit or push. Existing DB/broker suite evidence is separate.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

from p02 import ROOT
from p03_candidate import candidate_manifest

SERVICES = ('identity', 'catalog', 'community', 'trip', 'ingestion', 'api-gateway')
LOCAL = Path(__file__).resolve().parent / '.local/p03'


def build(release_id):
    if re.fullmatch(r'[a-z0-9][a-z0-9.-]{0,80}', release_id) is None:
        raise ValueError('Release identity must be a safe image tag')
    before = candidate_manifest()
    logs = LOCAL / 'build-logs'
    logs.mkdir(parents=True, exist_ok=True)
    packages = {}
    for service in SERVICES:
        module = ROOT / ('backend/platform/api-gateway' if service == 'api-gateway' else 'backend/services/' + service + '-service')
        wrapper = [str(ROOT / 'backend/mvnw.cmd')] if os.name == 'nt' else ['bash', str(ROOT / 'backend/mvnw')]
        # Relative -f avoids Maven's Windows Unicode absolute-path launcher failure.
        with (logs / (service + '.log')).open('wb') as log:
            result = subprocess.run(wrapper + ['-B', '-f', (module / 'pom.xml').relative_to(ROOT).as_posix(),
                                              '-DskipTests', 'clean', 'package'], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        if result.returncode:
            raise RuntimeError('Candidate compile failed; inspect ignored build log for ' + service)
        jar = module / 'target' / (service + ('-service' if service != 'api-gateway' else '') + '-0.0.1-SNAPSHOT.jar')
        tag = 'smarttravel-' + service + ':' + release_id
        args = ['docker', 'build', '-t', tag, str(module)] if service == 'api-gateway' else [
            sys.executable, str(ROOT / 'backend/platform/build_service_image.py'), service, '--tag', tag, '--jar', str(jar)]
        with (logs / (service + '-image.log')).open('wb') as log:
            if subprocess.run(args, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT).returncode:
                raise RuntimeError('Candidate image build failed: ' + service)
        image_id = subprocess.run(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag],
                                  capture_output=True, text=True, check=True).stdout.strip()
        packages[service] = {'image': tag, 'image_id': image_id, 'jar_sha256': hashlib.sha256(jar.read_bytes()).hexdigest(),
                             'source_files': {name: digest for name, digest in before['files'].items()
                                              if name.startswith(module.relative_to(ROOT).as_posix() + '/')},
                             'build_log_sha256': hashlib.sha256((logs / (service + '.log')).read_bytes()).hexdigest()}
        print('BUILT non-AI ' + service, flush=True)
    after = candidate_manifest()
    report = {'release_id': release_id, 'scope': 'non-ai', 'timestamp': datetime.now(timezone.utc).isoformat(),
              'candidate_before_sha256': before['sha256'], 'candidate_sha256': after['sha256'],
              'pass': before == after, 'packages': packages,
              'test_scope': 'Fresh compilation/package; real dependency test evidence recorded separately.'}
    (LOCAL / 'build-ledger.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    if not report['pass']:
        raise RuntimeError('Candidate changed while compiling; build cannot be accepted')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-id', required=True)
    build(parser.parse_args().release_id)
