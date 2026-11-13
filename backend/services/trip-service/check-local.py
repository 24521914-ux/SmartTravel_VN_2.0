"""Non-root packaged provider smoke; owns every container/network, no shared volumes."""
import argparse,importlib.util,json,os,secrets,subprocess,tempfile,time,threading
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
from jsonschema import Draft202012Validator,FormatChecker
ROOT=Path(__file__).resolve().parents[3]
SERVICE="trip"
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result
helper=module("domain_runner",Path(__file__).with_name("test-local.py"))
issuer_module=module("test_issuer",ROOT/"backend/platform/test_issuer.py")
def main():
 parser=argparse.ArgumentParser();parser.add_argument("--image",default="smarttravel-"+SERVICE+":p01-finish-local");args=parser.parse_args()
 name=SERVICE+"-image-"+secrets.token_hex(5);database,app,jwks=[name+x for x in ("-db","-app","-jwks")];portnum="8104" if SERVICE=="trip" else "8105"
 admin,migrator,runtime=[secrets.token_hex(24) for _ in range(3)]
 env=dict(os.environ,POSTGRES_PASSWORD=admin,DB_PASSWORD=runtime,DB_MIGRATION_PASSWORD=migrator,DB_USER=SERVICE+"_runtime",DB_MIGRATION_USER=SERVICE+"_migrator",DB_URL="jdbc:postgresql://"+database+":5432/"+SERVICE+"_db",JWT_JWKS_URI="http://"+jwks+":8000/jwks",JWT_ISSUER="local-test",SPRING_PROFILES_ACTIVE="local",FIXTURES_ENABLED="true",TRANSPORT_ENABLED="false",WORKER_ENABLED="false")
 started=[];network=False;issuer=issuer_module.Issuer()
 spec=json.loads((ROOT/"backend/contracts/openapi"/(SERVICE+".yaml")).read_text(encoding="utf-8"))
 try:
  with tempfile.TemporaryDirectory(prefix=name) as directory:
   Path(directory,"jwks").write_text(json.dumps(issuer.jwks()),encoding="utf-8")
   helper.run(["docker","network","create",name],env);network=True
   helper.run(["docker","run","-d","--name",database,"--network",name,"-e","POSTGRES_PASSWORD","-e","POSTGRES_DB="+SERVICE+"_db","postgres:16-alpine"],env);started.append(database)
   for _ in range(60):
    if subprocess.run(["docker","exec",database,"pg_isready","-h","127.0.0.1","-U","postgres"],capture_output=True).returncode==0:break
    time.sleep(1)
   else:raise RuntimeError("Owned DB readiness failed")
   helper.run(["docker","exec","-i",database,"psql","-U","postgres","-d",SERVICE+"_db","-v","ON_ERROR_STOP=1"],env,f"""CREATE ROLE {SERVICE}_migrator LOGIN PASSWORD '{migrator}';
CREATE ROLE {SERVICE}_runtime LOGIN PASSWORD '{runtime}';
ALTER DATABASE {SERVICE}_db OWNER TO {SERVICE}_migrator;
""")
   helper.run(["docker","run","-d","--name",jwks,"--network",name,"--mount","type=bind,source="+directory+",target=/fixture,readonly","python:3.12-alpine","python","-m","http.server","8000","--directory","/fixture"],env);started.append(jwks)
   command=["docker","run","-d","--name",app,"--network",name,"-p","127.0.0.1::"+portnum]
   for key in ("DB_URL","DB_USER","DB_PASSWORD","DB_MIGRATION_USER","DB_MIGRATION_PASSWORD","JWT_JWKS_URI","JWT_ISSUER","SPRING_PROFILES_ACTIVE","FIXTURES_ENABLED","TRANSPORT_ENABLED","WORKER_ENABLED"):command+=['-e',key]
   helper.run(command+[args.image],env);started.append(app)
   port=helper.run(["docker","port",app,portnum],env).split(":")[-1];base="http://127.0.0.1:"+port
   def request(method,path,body=None,token=None,status=200,headers=None,pattern=None):
    h={"Content-Type":"application/json",**(headers or {})}
    if token:h["Authorization"]="Bearer "+token
    req=Request(base+path,data=None if body is None else json.dumps(body).encode(),headers=h,method=method)
    try:response=urlopen(req,timeout=5)
    except HTTPError as error:response=error
    with response:
     assert response.status==status,(method,path,response.status,status)
     value=json.load(response) if status!=204 else None
     schema=spec["paths"].get(pattern or path,{}).get(method.lower(),{}).get("responses",{}).get(str(status),{}).get("content",{}).get("application/json",{}).get("schema")
     if schema:Draft202012Validator(schema,format_checker=FormatChecker()).validate(value)
     return value
   for _ in range(90):
    try:
     if request("GET","/actuator/health")["status"]=="UP":break
    except (AssertionError,URLError,OSError,TimeoutError):pass
    time.sleep(1)
   else:raise RuntimeError("Owned image readiness failed")
   for probe in ("readiness","liveness"):assert request("GET","/actuator/health/"+probe)["status"]=="UP"
   token=issuer.token(SERVICE,"USER" if SERVICE=="trip" else "ADMIN")
   if SERVICE=="trip":
    request("GET","/api/v1/me/trips",status=401)
    request("GET","/api/v1/me/trips",token=token)
    created=request("POST","/api/v1/me/trips",dict(name="SYNTHETIC image fixture",start_date="2026-10-01",end_date="2026-10-03",timezone="Asia/Ho_Chi_Minh",currency="VND",budget=50000),token,201)
    path="/api/v1/trips/"+created["trip_id"];request("GET",path,token=token,pattern="/api/v1/trips/{trip_id}")
    request("DELETE",path,token=token,status=204,headers={"If-Match":'"'+str(created["version"])+'"'},pattern="/api/v1/trips/{trip_id}")
   else:
    request("GET","/api/v1/admin/data-sources",status=401)
    request("GET","/api/v1/admin/data-sources",token=issuer.token(SERVICE,"USER"),status=403)
    request("GET","/api/v1/admin/data-sources",token=token)
    created=request("POST","/api/v1/admin/data-sources",dict(name="SYNTHETIC image fixture",uri="https://synthetic.invalid/source",secret_reference="none",license_version="CC0-synthetic-v1",allow_storage=True,allow_training=False),token,201)
    path="/api/v1/admin/data-sources/"+created["source_id"];request("GET",path,token=token,pattern="/api/v1/admin/data-sources/{source_id}")
    request("DELETE",path,token=token,status=204,headers={"If-Match":'"'+str(created["version"])+'"'},pattern="/api/v1/admin/data-sources/{source_id}")
   fixture_query="select count(*) from trip.trips where trip_id='40000000-0000-4000-8000-000000000001'" if SERVICE=="trip" else "select count(*) from ingestion.data_sources where source_id='30000000-0000-4000-8000-000000000001' and license_version='CC0-synthetic-v1' and allow_storage and not allow_training"
   assert helper.run(["docker","exec",database,"psql","-U","postgres","-d",SERVICE+"_db","-Atc",fixture_query],env)=="1"
   if SERVICE=="trip":
    for table,count in (("trip_destinations",2),("trip_days",3),("itinerary_items",2)):
     assert int(helper.run(["docker","exec",database,"psql","-U","postgres","-d","trip_db","-Atc","select count(*) from trip."+table+" where trip_id='40000000-0000-4000-8000-000000000001'"],env))==count
   assert helper.run(["docker","exec",app,"id","-u"],env)=="10001"
   count=helper.run(["docker","exec",database,"psql","-U","postgres","-d",SERVICE+"_db","-Atc","select count(*) from public.flyway_schema_history where success and version is not null"],env);assert count=="8"
   print(SERVICE+" image PASS: owned PostgreSQL, Flyway V1-V8, non-root, opt-in seeded fixtures, readiness/liveness, real RS256/JWKS, private authorization, persisted create/read/delete, frozen response schemas")
 finally:
  issuer.server_close()
  for container in reversed(started):helper.run(["docker","rm","-f",container],env)
  if network:helper.run(["docker","network","rm",name],env)
if __name__=="__main__":main()
