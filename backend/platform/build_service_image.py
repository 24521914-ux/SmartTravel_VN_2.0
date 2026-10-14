"""Build a local service image from a selected verified jar without touching a running checkout jar."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SERVICES = ['identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('service', choices=SERVICES)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--jar', type=Path)
    args = parser.parse_args()
    service = ROOT / f'backend/services/{args.service}-service'
    jar = (args.jar or service / f'target/{args.service}-service-0.0.1-SNAPSHOT.jar').resolve()
    if not jar.is_file() or jar.suffix != '.jar':
        parser.error('Build and verify the service jar before building an image')
    with tempfile.TemporaryDirectory(prefix=f'smarttravel-{args.service}-image-') as directory:
        context = Path(directory)
        (context / 'target').mkdir()
        shutil.copy2(service / 'Dockerfile', context / 'Dockerfile')
        shutil.copy2(jar, context / f'target/{args.service}-service-0.0.1-SNAPSHOT.jar')
        raise SystemExit(subprocess.call(['docker', 'build', '-t', args.tag, str(context)]))


if __name__ == '__main__':
    main()
