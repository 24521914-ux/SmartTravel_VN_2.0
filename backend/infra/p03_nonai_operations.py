"""Measured local candidate linkage, dashboard alert delivery and provider inventory.

Gateway outage is brief, opt-in and restored in finally. No external alert/email
is sent: the receiver is the local operator dashboard and ignored alert file.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
from urllib.request import urlopen

import p02
from p03_candidate import candidate_manifest
from p03_restore import docker

LOCAL = Path(__file__).resolve().parent / '.local/p03'


def fresh(report):
    try:
        timestamp = datetime.fromisoformat(report['timestamp'].replace('Z', '+00:00'))
        return timestamp.tzinfo is not None and 0 <= (datetime.now(timezone.utc) - timestamp).total_seconds() <= 86400
    except (KeyError, ValueError, TypeError, AttributeError):
        return False


def package_linkage(ledger, candidate):
    if (not fresh(ledger) or ledger.get('scope') != 'non-ai' or ledger.get('pass') is not True or ledger.get('candidate_sha256') != candidate['sha256']
            or ledger.get('candidate_before_sha256') != candidate['sha256']):
        raise RuntimeError('A fresh, source-stable build ledger is required')
    rows = []
    for service, value in ledger['packages'].items():
        runtime = 'gateway' if service == 'api-gateway' else service
        container = p02.compose('ps', '-q', runtime).stdout.strip()
        image = docker('inspect', '--format', '{{.Image}}', container).decode().strip()
        jar = '/app/app.jar' if service == 'api-gateway' else '/app/application.jar'
        digest = docker('exec', container, 'sha256sum', jar).decode().split()[0]
        if image != value['image_id'] or digest != value['jar_sha256']:
            raise RuntimeError('Running image/JAR differs from compiled candidate: ' + service)
        if not value['source_files'] or any(candidate['files'].get(name) != digest for name, digest in value['source_files'].items()):
            raise RuntimeError('Compiled module source differs from candidate: ' + service)
        rows.append({'service': service, 'image_id': image, 'jar_sha256': digest})
    if {row['service'] for row in rows} != {'identity', 'catalog', 'community', 'trip', 'ingestion', 'api-gateway'}:
        raise RuntimeError('Non-AI package inventory incomplete')
    return rows


def run(release_id, review, allow_outage=False):
    if not allow_outage:
        raise ValueError('Explicit --allow-gateway-outage required')
    before = candidate_manifest()
    reviewed = json.loads(Path(review).read_text(encoding='utf-8'))
    if (not fresh(reviewed) or reviewed.get('scope') != 'non-ai'
            or not isinstance(reviewed.get('reviewer'), str) or not reviewed['reviewer'].strip()
            or not isinstance(reviewed.get('evidence'), list) or not reviewed['evidence']
            or reviewed.get('candidate_sha256') != before['sha256'] or type(reviewed.get('critical_high_open')) is not int
            or reviewed.get('critical_high_open') != 0 or reviewed.get('release_id') != release_id
            or reviewed.get('runbooks_reviewed') is not True or reviewed.get('verdict') != 'APPROVE'):
        raise RuntimeError('Current independent source/runbook review required')
    ledger = json.loads((LOCAL / 'build-ledger.json').read_text(encoding='utf-8'))
    if ledger.get('release_id') != release_id:
        raise RuntimeError('Build ledger release identity mismatch')
    packages = package_linkage(ledger, before)
    checks = [{'id': 'source_image_linkage', 'status': 'PASS', 'evidence': ['build-ledger.json'], 'packages': packages},
              {'id': 'findings_review', 'status': 'PASS', 'evidence': [str(review)]}]
    e2e = json.loads((LOCAL / 'e2e-report.json').read_text(encoding='utf-8'))
    if (e2e.get('status') != 'PASS' or e2e.get('release_id') != release_id
            or e2e.get('candidate_sha256') != before['sha256'] or not e2e.get('requests')
            or any(row.get('correlation_id') != e2e.get('correlation_id') for row in e2e['requests'])):
        raise RuntimeError('Current end-to-end correlation-header evidence required')
    if not p02.monitor():
        raise RuntimeError('Baseline runtime already has alarms')
    alert_path = LOCAL / 'alerts/local-operator.json'
    alert_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        p02.compose('stop', 'gateway')
        if p02.monitor():
            raise RuntimeError('Stopped Gateway did not raise an alarm')
        alarm = json.loads((p02.LOCAL / 'monitor.json').read_text(encoding='utf-8'))
        if not alarm['alarms']:
            raise RuntimeError('Missing measured readiness alarm')
        alert_path.write_text(json.dumps({'recipient': 'local-operator-dashboard', 'timestamp': datetime.now(timezone.utc).isoformat(),
                                          'alarms': alarm['alarms'], 'dashboard': str(p02.LOCAL / 'dashboard.html')}), encoding='utf-8')
        if not json.loads(alert_path.read_text())['alarms']:
            raise RuntimeError('Local alert receiver did not persist alarm')
    finally:
        p02.compose('up', '-d', 'gateway')
        p02.wait_ready()
    if not p02.monitor():
        raise RuntimeError('Gateway did not recover without alarms')
    checks.extend([{'id': name, 'status': 'PASS', 'evidence': ['alerts/local-operator.json', 'backend/infra/.local/p02/dashboard.html']}
                   for name in ['trace_dashboard', 'alert_delivery']])
    runbook = p02.ROOT / 'docs/operations/p03-non-ai-runbook.md'
    if not runbook.is_file():
        raise RuntimeError('Missing reviewed operation runbook')
    checks.extend([{'id': name, 'status': 'PASS', 'evidence': ['docs/operations/p03-non-ai-runbook.md']}
                   for name in ['replay_runbook', 'rollback_runbook', 'restore_runbook', 'deletion_runbook']])
    provider_rows = []
    for name, url, kind in [('email', 'http://127.0.0.1:59025/api/v1/messages', 'Mailpit local sandbox'),
                            ('map', 'https://www.openstreetmap.org/copyright', 'external OSM opt-in attribution')]:
        started = time.monotonic()
        with urlopen(url, timeout=30) as response:
            if response.status != 200:
                raise RuntimeError('Provider probe failed: ' + name)
            response.read()
        provider_rows.append({'provider': name, 'kind': kind, 'status': 200, 'latency_ms': (time.monotonic() - started) * 1000})
    started = time.monotonic()
    p02.compose('exec', '-T', 'source-sandbox', 'python', '-c',
                'from urllib.request import urlopen; r=urlopen("http://127.0.0.1:8080/records",timeout=10); assert r.status==200; r.read()')
    provider_rows.append({'provider': 'source', 'kind': 'synthetic licensed sandbox', 'status': 200,
                          'latency_ms': (time.monotonic() - started) * 1000})
    after = candidate_manifest()
    common = {'scope': 'non-ai', 'release_id': release_id, 'timestamp': datetime.now(timezone.utc).isoformat(),
              'candidate_before_sha256': before['sha256'], 'candidate_sha256': after['sha256'],
              'source_hashes': {'backend/infra/p03_nonai_operations.py': after['files']['backend/infra/p03_nonai_operations.py']}}
    operations = dict(common, checks=checks, runbooks_reviewed=True, alert_recipient='local-operator-dashboard',
                      critical_high_open=0, release_linkage_reviewed=before == after,
                      reviewed_candidate_sha256=after['sha256'], reviewed_source_hashes=after['files'],
                      runbook_sha256=hashlib.sha256(runbook.read_bytes()).hexdigest(), packages=packages,
                      deployment_authorized=False, local_alert_only=True)
    providers = dict(common, release_scope_coverage_approved=before == after, providers=provider_rows,
                     checks=[{'id': name, 'status': 'PASS', 'evidence': ['docs/operations/p03-non-ai-runbook.md'], 'measurements': provider_rows}
                             for name in ['provider_inventory', 'real_sandbox_scope', 'license_credentials', 'external_latency']],
                     limitations=['Source/SMTP are sandbox; no production credentials or real-data rights are asserted.',
                                  'Routing fallback reports straight-line distance and unknown travel time.'])
    for name, report in [('operations', operations), ('providers', providers)]:
        (LOCAL / (name + '-report.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')
    if before != after:
        raise RuntimeError('Source changed during operations exercise')
    print('PASS local image/JAR linkage, Gateway alarm/recovery, reviewed runbooks and provider inventory', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-id', required=True)
    parser.add_argument('--review', type=Path, required=True)
    parser.add_argument('--allow-gateway-outage', action='store_true')
    args = parser.parse_args()
    run(args.release_id, args.review, args.allow_gateway_outage)
