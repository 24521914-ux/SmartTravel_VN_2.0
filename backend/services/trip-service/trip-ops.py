"""Loopback maintenance mode. Credentials arrive exclusively through environment."""
from pathlib import Path
import argparse,os,subprocess,uuid
SERVICE="trip"
def main():
 p=argparse.ArgumentParser();p.add_argument("action",choices=["replay-outbox","replay-dlq"]);p.add_argument("--event-id");p.add_argument("--jar",type=Path,default=Path(__file__).parent/"target"/(SERVICE+"-service-0.0.1-SNAPSHOT.jar"));args=p.parse_args()
 if args.action=="replay-outbox" and args.event_id is None:p.error("--event-id required")
 if args.event_id:uuid.UUID(args.event_id)
 command=["java","-jar",str(args.jar),"--server.address=127.0.0.1","--server.port=0","--spring.flyway.enabled=false","--"+SERVICE+".operator.enabled=true","--"+SERVICE+".operator.action="+args.action,"--"+SERVICE+".transport.enabled=false","--"+SERVICE+".fixtures.enabled=false","--ingestion.worker.enabled=false"]
 if args.event_id:command.append("--"+SERVICE+".operator.event-id="+args.event_id)
 raise SystemExit(subprocess.run(command,env=os.environ.copy()).returncode)
if __name__=="__main__":main()
