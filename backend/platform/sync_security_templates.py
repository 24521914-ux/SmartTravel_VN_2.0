"""Sync platform security boilerplate into generated P00 service skeletons.
Only platform classes, never domain entities/repositories. Explicit --write.
After P01 starts, service owners must review these updates instead of blind sync.
"""
import argparse
from pathlib import Path

BACKEND=Path(__file__).resolve().parents[1]
SOURCE=BACKEND/'platform/p00-template/src/main/java/vn/smarttravel/platform'

def sync():
    for service in ['identity','catalog','community','trip','ingestion','intelligence']:
        dest=BACKEND/f'services/{service}-service/src/main/java/vn/smarttravel/{service}'
        for name in ['SecurityConfiguration.java','CorrelationFilter.java','ApiErrorController.java']:
            content=(SOURCE/name).read_text(encoding='utf-8').replace('package vn.smarttravel.platform;',f'package vn.smarttravel.{service};')
            (dest/name).write_text(content,encoding='utf-8')
        for name in ['JwksIntegrationTests.java','SecurityConfigurationTests.java']:
            source=BACKEND/'platform/p00-template/src/test/java/vn/smarttravel/platform'/name
            target=BACKEND/f'services/{service}-service/src/test/java/vn/smarttravel/{service}'/name
            target.write_text(source.read_text(encoding='utf-8').replace('package vn.smarttravel.platform;',f'package vn.smarttravel.{service};'),encoding='utf-8')
    print('Synced platform security/trace boilerplate into six P00 skeletons.')

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--write',action='store_true')
    if not parser.parse_args().write: parser.error('--write required')
    sync()
