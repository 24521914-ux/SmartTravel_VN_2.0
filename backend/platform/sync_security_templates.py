"""Export platform security proposals using the service/feature/layer layout.
P01 services have custom security/domain code: never overwrite their source blindly.
Usage: python backend/platform/sync_security_templates.py --write --output <review-directory>
Review and apply the diff manually. Existing proposal files are never overwritten.
"""
import argparse
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
SERVICES = ['identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence']


def sync(output):
    proposals = []
    for service in SERVICES:
        for tree, files in {
            'main': {'SecurityConfiguration.java': 'security/config',
                     'CorrelationFilter.java': 'shared/web', 'ApiErrorController.java': 'shared/web'},
            'test': {'JwksIntegrationTests.java': 'security/config', 'SecurityConfigurationTests.java': 'security/config'},
        }.items():
            for name, folder in files.items():
                source = BACKEND / f'platform/p00-template/src/{tree}/java/vn/smarttravel/platform' / name
                package = f'vn.smarttravel.{service}.{folder.replace("/", ".")}'
                content = source.read_text(encoding='utf-8').replace('package vn.smarttravel.platform;', f'package {package};')
                target = output / f'{service}-service/src/{tree}/java/vn/smarttravel/{service}' / folder / name
                proposals.append((target, content))
    # Validate every destination before writing anything; never target an existing service source tree.
    service_root = (BACKEND / 'services').resolve()
    if output.resolve() == service_root or service_root in output.resolve().parents:
        raise ValueError('Export outside backend/services; review P01 customizations before applying')
    for target, _ in proposals:
        if target.exists():
            raise FileExistsError(f'Refusing to overwrite {target}')
    for target, content in proposals:
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('x', encoding='utf-8') as file:
            file.write(content)
    print('Exported six security proposals; no service source was modified.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not args.write:
        parser.error('--write required')
    sync(args.output)
