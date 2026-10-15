"""Single Identity maintenance action using injected credentials; no public maintenance endpoint."""
import argparse
from pathlib import Path
import subprocess
from uuid import UUID


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['replay-dlq', 'replay-outbox'])
    parser.add_argument('--event-id', type=UUID)
    parser.add_argument('--jar', type=Path,
                        default=Path(__file__).parent / 'target/identity-service-0.0.1-SNAPSHOT.jar')
    args = parser.parse_args()
    if args.action == 'replay-outbox' and args.event_id is None:
        parser.error('replay-outbox requires --event-id')
    if args.action == 'replay-dlq' and args.event_id is not None:
        parser.error('--event-id is only used by replay-outbox')
    command = ['java', '-jar', str(args.jar.resolve()), '--server.address=127.0.0.1', '--server.port=0',
               '--identity.operator.enabled=true', '--identity.workers.enabled=false',
               '--identity.transport.enabled=false', '--management.health.rabbit.enabled=false',
               '--identity.fixtures.enabled=false', '--spring.flyway.enabled=false',
               '--identity.operator.action=' + args.action]
    if args.event_id:
        command.append('--identity.operator.event-id=' + str(args.event_id))
    raise SystemExit(subprocess.call(command))


if __name__ == '__main__':
    main()
