"""Owned disposable PostgreSQL/RabbitMQ verification. Never accesses P01 data volumes."""
from pathlib import Path
import os,sys,argparse,secrets,subprocess,time
ROOT=Path(__file__).resolve().parents[3]
SERVICE="ingestion"
def run(args,env,content=None):
 result=subprocess.run(args,cwd=ROOT,env=env,input=None if content is None else content.encode(),capture_output=True)
 output=(result.stdout+result.stderr).decode("utf-8",errors="replace")
 if result.returncode:
  for key,value in env.items():
   if any(marker in key for marker in ["PASSWORD","PASS","TOKEN","SECRET"]) and value:output=output.replace(value,"[REDACTED]")
  raise RuntimeError(output[-8000:])
 return result.stdout.decode().strip()
def main():
 parser=argparse.ArgumentParser();parser.add_argument("--transport",action="store_true");args=parser.parse_args()
 name="smarttravel-"+SERVICE+"-test-"+secrets.token_hex(6);broker=name+"-broker"
 admin,migrator,runtime=[secrets.token_hex(24) for _ in range(3)]
 env=dict(os.environ,POSTGRES_PASSWORD=admin)
 started=broker_started=False
 try:
  run(["docker","run","--rm","-d","--name",name,"-e","POSTGRES_PASSWORD","-e","POSTGRES_DB="+SERVICE+"_db","-p","127.0.0.1::5432","postgres:16-alpine"],env);started=True
  for _ in range(60):
   if subprocess.run(["docker","exec",name,"pg_isready","-h","127.0.0.1","-U","postgres"],capture_output=True).returncode==0:break
   time.sleep(1)
  else:raise RuntimeError("Disposable PostgreSQL failed readiness")
  run(["docker","exec","-i",name,"psql","-U","postgres","-d",SERVICE+"_db","-v","ON_ERROR_STOP=1"],env,f"CREATE ROLE {SERVICE}_migrator LOGIN PASSWORD '{migrator}';\nCREATE ROLE {SERVICE}_runtime LOGIN PASSWORD '{runtime}';\nALTER DATABASE {SERVICE}_db OWNER TO {SERVICE}_migrator;\n")
  port=run(["docker","port",name,"5432"],env).split(":")[-1]
  test_env=dict(os.environ,DOMAIN_DB_TESTS="true",LOGGING_LEVEL_ROOT="INFO",LOGGING_LEVEL_ORG_SPRINGFRAMEWORK="INFO",DB_URL=f"jdbc:postgresql://127.0.0.1:{port}/{SERVICE}_db",DB_USER=SERVICE+"_runtime",DB_PASSWORD=runtime,DB_MIGRATION_USER=SERVICE+"_migrator",DB_MIGRATION_PASSWORD=migrator)
  test_env.pop("SPRING_PROFILES_ACTIVE",None)
  test_env["DEBUG"]="false"
  test_env.pop("SPRING_APPLICATION_JSON",None)
  test_env.pop("JAVA_TOOL_OPTIONS",None)
  if args.transport:
   broker_admin,broker_runtime,broker_operator=[secrets.token_hex(24) for _ in range(3)]
   benv=dict(env,RABBITMQ_DEFAULT_USER="platform_admin",RABBITMQ_DEFAULT_PASS=broker_admin)
   run(["docker","run","-d","--name",broker,"-e","RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS=+S 2:2","-e","RABBITMQ_CTL_ERL_ARGS=+S 2:2","-e","RABBITMQ_DEFAULT_USER","-e","RABBITMQ_DEFAULT_PASS","-p","127.0.0.1::5672","rabbitmq:4.1-management-alpine"],benv);broker_started=True
   for _ in range(120):
    if subprocess.run(["docker","exec","--user","rabbitmq",broker,"rabbitmq-diagnostics","-q","check_running"],capture_output=True).returncode==0:break
    time.sleep(1)
   else:raise RuntimeError("Disposable RabbitMQ failed readiness: "+run(["docker","logs",broker],benv)[-4000:])
   run(["docker","exec","--user","rabbitmq",broker,"rabbitmqctl","add_vhost","smarttravel"],benv)
   run(["docker","exec","--user","rabbitmq",broker,"rabbitmqctl","add_user",SERVICE+"_runtime",broker_runtime],benv)
   run(["docker","exec","--user","rabbitmq",broker,"rabbitmqctl","set_permissions","-p","smarttravel",SERVICE+"_runtime","^"+SERVICE+"\\..*","^"+SERVICE+"\\.(events|inbox|dlq|deadletters|p01\\.capture)$","^"+SERVICE+"\\..*"],benv)
   run(["docker","exec","--user","rabbitmq",broker,"rabbitmqctl","set_topic_permissions","-p","smarttravel",SERVICE+"_runtime",SERVICE+".inbound","^$",".*"],benv)
   run(["docker","exec","--user","rabbitmq",broker,"rabbitmqctl","set_topic_permissions","-p","smarttravel",SERVICE+"_runtime",SERVICE+".events","^("+SERVICE+r"\..*|domain\.user-data-deleted\.v1)$",".*"],benv)
   run(["docker","exec","--user","rabbitmq",broker,"rabbitmqctl","set_permissions","-p","smarttravel","platform_admin",".*",".*",".*"],benv)
   run(["docker","exec","--user","rabbitmq",broker,"rabbitmqctl","add_user",SERVICE+"_operator",broker_operator],benv)
   run(["docker","exec","--user","rabbitmq",broker,"rabbitmqctl","set_permissions","-p","smarttravel",SERVICE+"_operator","^$","^"+SERVICE+r"\.inbound$","^"+SERVICE+r"\.dlq$"],benv)
   run(["docker","exec","--user","rabbitmq",broker,"rabbitmqctl","set_topic_permissions","-p","smarttravel",SERVICE+"_operator",SERVICE+".inbound",'^(catalog\\.place-import\\.applied\\.v1|catalog\\.place-import\\.rejected\\.v1|identity\\.user\\.status-changed\\.v1|identity\\.user\\.deletion-requested\\.v1)$',".*"],benv)
   bport=run(["docker","port",broker,"5672"],benv).split(":")[-1]
   test_env.update(DOMAIN_TRANSPORT_TESTS="true",BROKER_HOST="127.0.0.1",BROKER_PORT=bport,BROKER_USERNAME=SERVICE+"_runtime",BROKER_PASSWORD=broker_runtime,BROKER_VHOST="smarttravel",BROKER_ADMIN_PASSWORD=broker_admin,BROKER_OPERATOR_PASSWORD=broker_operator)
  wrapper=str(ROOT/"backend"/("mvnw.cmd" if os.name=="nt" else "mvnw"))
  command=[wrapper] if os.name=="nt" else ["bash",wrapper]
  result=subprocess.run(command+["-B","-f",f"backend/services/{SERVICE}-service/pom.xml","clean","verify"],cwd=ROOT,env=test_env)
  if result.returncode:raise RuntimeError("Domain verification failed; inspect Maven output")
 finally:
  try:
   if broker_started:run(["docker","rm","-f","-v",broker],env)
  finally:
   if started:run(["docker","stop",name],env)
if __name__=="__main__":main()
