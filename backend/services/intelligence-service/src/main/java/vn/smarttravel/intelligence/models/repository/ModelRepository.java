package vn.smarttravel.intelligence.models.repository;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import vn.smarttravel.intelligence.models.artifacts.ArtifactStore;
import vn.smarttravel.intelligence.projections.service.ProjectionService;
import vn.smarttravel.intelligence.recommendations.client.DependencyClient;
import vn.smarttravel.intelligence.recommendations.repository.BasicRepository.Candidate;

@Repository
public class ModelRepository {
    private final JdbcTemplate db;
    private final ArtifactStore artifacts;
    private final DependencyClient dependencies;
    private final ProjectionService projections;
    private final boolean deploymentEnabled;
    private final String cursorSecret=UUID.randomUUID().toString();
    public ModelRepository(JdbcTemplate db,ArtifactStore artifacts,DependencyClient dependencies,ProjectionService projections,@Value("${intelligence.model-deployment-enabled:false}") boolean enabled){this.db=db;this.artifacts=artifacts;this.dependencies=dependencies;this.projections=projections;deploymentEnabled=enabled;}
    private Map<String,Object> one(String sql,Object...params){var rows=db.queryForList(sql,params);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"NOT_FOUND");return rows.getFirst();}
    private void lock(String key){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,key);}
    private void policyCheck(List<UUID> ids,Map<UUID,JsonNode> snapshots) {
        require(!ids.isEmpty()&&ids.size()<=100,"SOURCE_LINEAGE_REQUIRED");
        var policies=dependencies.policies(ids);var returned=new HashSet<UUID>();
        for(JsonNode p:policies){UUID source=uuid(p,"source_id");require(ids.contains(source)&&returned.add(source),"INVALID_POLICY_RESPONSE");
            require(p.path("allow_training").asBoolean()&&p.path("status").asText().equals("PERMITTED"),"SOURCE_TRAINING_FORBIDDEN");
            require(p.path("source_version").asLong()>0&&!p.path("license_version").asText().isBlank(),"SOURCE_LINEAGE_REQUIRED");
            var local=db.queryForList("select source_version,allow_training,license_version from intelligence.source_policies where source_id=?",source);
            if(!local.isEmpty()){var cached=local.getFirst();require(((Number)cached.get("source_version")).longValue()<=p.path("source_version").asLong(),"STALE_SOURCE_POLICY");if(((Number)cached.get("source_version")).longValue()==p.path("source_version").asLong())require(Boolean.TRUE.equals(cached.get("allow_training"))&&cached.get("license_version").equals(p.path("license_version").asText()),"SOURCE_TRAINING_FORBIDDEN");}
            if(snapshots!=null&&snapshots.containsKey(source)){var old=snapshots.get(source);require(old.path("source_version").asLong()==p.path("source_version").asLong()&&old.path("license_version").asText().equals(p.path("license_version").asText()),"LICENSE_VERSION_CHANGED");}
        }
        require(returned.size()==ids.size(),"SOURCE_POLICY_MISSING");
    }
    public Map<String,Object> build(UUID actor,JsonNode request) {
        fields(request,Set.of("source_ids","feature_schema_version","criteria"));require(request.path("feature_schema_version").asInt()==1,"UNSUPPORTED_FEATURE_SCHEMA");
        var sources=new TreeSet<UUID>();for(var id:request.path("source_ids"))sources.add(UUID.fromString(id.asText()));require(sources.size()==request.path("source_ids").size(),"DUPLICATE_SOURCE");
        List<UUID> ids=new ArrayList<>(sources);for(UUID source:ids)lock("source:"+source);policyCheck(ids,null);
        Instant start=time(request.path("criteria"),"start"),end=time(request.path("criteria"),"end");require(start.isBefore(end)&&!end.isAfter(Instant.now().plusSeconds(60)),"INVALID_DATASET_WINDOW");
        var rows=new ArrayList<Object>();
        db.query("select place_id,features,catalog_version,rating_version,as_of,embedding::text from intelligence.place_features where status='PUBLISHED' and as_of>=? and as_of<? order by as_of,place_id",rs->{
            JsonNode f=read(rs.getString(2));if(!f.hasNonNull("source_id"))return;UUID source=UUID.fromString(f.path("source_id").asText());if(!sources.contains(source))return;
            double rating=f.path("rating_count").asLong()>0?f.path("rating_sum").asDouble()/(5*f.path("rating_count").asLong()):.7;
            double popularity=Math.max(0,Math.min(1,f.path("popularity").asDouble()/100));
            // Public snapshot adapter: no cross-service DB reads or personal information.
            // Target is public smoothed relevance; fixture proves fitting mechanics, not user utility.
            double target=(f.path("rating_sum").asDouble()+35)/(5*(f.path("rating_count").asLong()+10));
            require(Double.isFinite(rating)&&Double.isFinite(target)&&target>=0&&target<=1,"INVALID_TRAINING_FEATURE");
            require(rs.getString(6)!=null,"FEATURE_EMBEDDING_MISSING");
            rows.add(Map.of("place_id",rs.getObject(1).toString(),"source_id",source.toString(),"catalog_version",rs.getLong(3),"rating_version",rs.getLong(4),"observed_at",rs.getTimestamp(5).toInstant().toString(),"x",read(rs.getString(6)),"label",target));
        },Timestamp.from(start),Timestamp.from(end));
        require(rows.size()>=15,"INSUFFICIENT_DATASET_ROWS");
        var current=dependencies.policies(ids);var lineage=new TreeMap<String,Object>();for(var p:current)lineage.put(p.path("source_id").asText(),Map.of("source_version",p.path("source_version").asLong(),"license_version",p.path("license_version").asText(),"allow_training",p.path("allow_training").asBoolean()));policyCheck(ids,null);
        var snapshot=new LinkedHashMap<String,Object>();snapshot.put("feature_schema_version",1);snapshot.put("criteria",request.path("criteria"));snapshot.put("sources",lineage);snapshot.put("rows",rows);snapshot.put("split","temporal-60-20-20");snapshot.put("consent_cutoff",end.toString());snapshot.put("personal_data",false);
        String content=json(snapshot);UUID dataset=UUID.randomUUID();String key=artifacts.write(content);
        db.update("insert into intelligence.dataset_versions(dataset_version_id,name,criteria,feature_schema_version,row_count,artifact_object_key,checksum,created_by) values(?,'public-snapshot',?::jsonb,'1',?,?,?,?)",dataset,json(request.path("criteria")),rows.size(),key,hash(content),actor);
        for(UUID source:ids){JsonNode p=read(json(lineage.get(source.toString())));db.update("insert into intelligence.dataset_sources(dataset_version_id,source_id,source_version,license_version,allow_training_snapshot) values(?,?,?,?,true)",dataset,source,p.path("source_version").asLong(),p.path("license_version").asText());}
        projections.audit(actor,"dataset",dataset.toString(),"BUILD",Map.of("checksum",hash(content),"rows",rows.size()));return dataset(dataset);
    }
    public Map<String,Object> dataset(UUID id) {
        var row=one("select * from intelligence.dataset_versions where dataset_version_id=?",id);var sources=db.query("select source_id from intelligence.dataset_sources where dataset_version_id=? order by source_id",(r,i)->r.getObject(1,UUID.class),id);
        return Map.of("dataset_id",id,"version",1,"checksum",row.get("checksum"),"feature_schema_version",Integer.parseInt(row.get("feature_schema_version").toString()),"source_ids",sources,"status",row.get("status"));
    }
    private JsonNode checkedDataset(UUID id) {
        var row=one("select * from intelligence.dataset_versions where dataset_version_id=?",id);require(row.get("status").equals("READY"),"DATASET_REVOKED");
        JsonNode content=read(artifacts.read(row.get("artifact_object_key").toString(),row.get("checksum").toString()));require(content.path("feature_schema_version").asInt()==1,"FEATURE_SCHEMA_MISMATCH");
        var sources=db.queryForList("select source_id,source_version,license_version from intelligence.dataset_sources where dataset_version_id=? order by source_id",id);var ids=new ArrayList<UUID>();var snapshots=new HashMap<UUID,JsonNode>();
        for(var source:sources){UUID uuid=(UUID)source.get("source_id");ids.add(uuid);snapshots.put(uuid,read(json(source)));}
        for(UUID source:ids)lock("source:"+source);policyCheck(ids,snapshots);return content;
    }
    public Map<String,Object> enqueue(UUID actor,JsonNode request) {
        fields(request,Set.of("dataset_id","seed","code_revision"));UUID dataset=uuid(request,"dataset_id");require(request.path("seed").canConvertToLong()&&request.path("seed").asLong()>=0,"INVALID_SEED");require(!request.path("code_revision").asText().isBlank()&&request.path("code_revision").asText().length()<=1024,"INVALID_CODE_REVISION");
        checkedDataset(dataset);UUID job=UUID.randomUUID();
        db.update("insert into intelligence.training_jobs(training_job_id,dataset_version_id,algorithm,params,code_revision,random_seed) values(?,?,'linear-sgd-v1',?::jsonb,?,?)",job,dataset,json(Map.of("iterations",300,"learning_rate",.05,"split","temporal-60-20-20")),request.path("code_revision").asText(),request.path("seed").asLong());projections.audit(actor,"training-job",job.toString(),"ENQUEUE",request);return job(job);
    }
    public Map<String,Object> job(UUID id) {var row=one("select * from intelligence.training_jobs where training_job_id=?",id);return Map.of("job_id",id,"dataset_id",row.get("dataset_version_id"),"status",row.get("status"),"seed",row.get("random_seed"),"code_revision",row.get("code_revision"),"version",row.get("mutation_version"));}
    public Map<String,Object> cancel(UUID actor,UUID id){db.update("update intelligence.training_jobs set mutation_version=mutation_version+1,status='CANCELLED',started_at=coalesce(started_at,now()),ended_at=now() where training_job_id=? and status in ('QUEUED','RUNNING')",id);projections.audit(actor,"training-job",id.toString(),"CANCEL",Map.of());return job(id);}
    public Optional<UUID> claim() {
        db.update("update intelligence.training_jobs set mutation_version=mutation_version+1,status='FAILED',ended_at=now() where status='RUNNING' and started_at<now()-interval '15 minutes'");
        var ids=db.query("select training_job_id from intelligence.training_jobs where status='QUEUED' order by created_at for update skip locked limit 1",(r,i)->r.getObject(1,UUID.class));
        if(ids.isEmpty())return Optional.empty();UUID id=ids.getFirst();db.update("update intelligence.training_jobs set mutation_version=mutation_version+1,status='RUNNING',started_at=now() where training_job_id=?",id);return Optional.of(id);
    }
    public UUID train(UUID job) {
        var metadata=one("select * from intelligence.training_jobs where training_job_id=?",job);require(metadata.get("status").equals("RUNNING"),"JOB_NOT_RUNNING");UUID dataset=(UUID)metadata.get("dataset_version_id");
        JsonNode data=checkedDataset(dataset);List<JsonNode> rows=new ArrayList<>();data.path("rows").forEach(rows::add);int trainSize=rows.size()*6/10,validationEnd=rows.size()*8/10;
        require(trainSize>=5&&validationEnd>trainSize&&rows.size()>validationEnd,"INVALID_SPLIT");
        double[] weights={0,0,0};Random random=new Random(((Number)metadata.get("random_seed")).longValue());List<JsonNode> training=new ArrayList<>(rows.subList(0,trainSize));
        for(int epoch=0;epoch<300;epoch++){
            Collections.shuffle(training,random);
            for(var row:training){double prediction=predict(weights,row.path("x"));double error=prediction-row.path("label").asDouble();for(int k=0;k<3;k++)weights[k]-=.05*(error*row.path("x").get(k).asDouble()+.001*weights[k]);}
        }
        var validation=metrics(rows.subList(trainSize,validationEnd),weights);var test=metrics(rows.subList(validationEnd,rows.size()),weights);double mse=0;
        for(var row:rows.subList(validationEnd,rows.size()))mse+=Math.pow(predict(weights,row.path("x"))-row.path("label").asDouble(),2);mse/=rows.size()-validationEnd;
        var metric=new LinkedHashMap<String,Object>();metric.putAll(test);metric.put("validation",validation);metric.put("mse",mse);metric.put("train_rows",trainSize);metric.put("test_rows",rows.size()-validationEnd);metric.put("basic_baseline",metrics(rows.subList(validationEnd,rows.size()),new double[]{.7,0,0}));metric.put("synthetic_quality_only",true);
        String content=json(Map.of("feature_schema_version",1,"algorithm","linear-sgd-v1","weights",List.of(weights[0],weights[1],weights[2]),"dataset_checksum",hash(json(data)),"seed",metadata.get("random_seed"),"code_revision",metadata.get("code_revision")));
        String key=artifacts.write(content);String logs=artifacts.write(json(Map.of("job_id",job,"split","temporal-60-20-20","metrics",metric,"completed_at",Instant.now().toString())));
        checkedDataset(dataset);lock("model-name:public-linear");int version=db.queryForObject("select coalesce(max(version_no),0)+1 from intelligence.model_versions where model_name='public-linear'",Integer.class);UUID model=UUID.randomUUID();
        int updated=db.update("update intelligence.training_jobs set mutation_version=mutation_version+1,status='SUCCEEDED',ended_at=now(),logs_object_key=? where training_job_id=? and status='RUNNING'",logs,job);require(updated==1,"JOB_CANCELLED");
        db.update("insert into intelligence.model_versions(model_version_id,training_job_id,model_name,version_no,artifact_object_key,checksum,metrics,feature_schema_version) values(?,?,'public-linear',?,?,?,?::jsonb,'1')",model,job,version,key,hash(content),json(metric));return model;
    }
    private static double predict(double[] weights,JsonNode x){double result=0;for(int i=0;i<3;i++)result+=weights[i]*x.get(i).asDouble();return Math.max(0,Math.min(1,result));}
    private static Map<String,Double> metrics(List<JsonNode> rows,double[] weights){
        var ranked=new ArrayList<>(rows);ranked.sort(Comparator.<JsonNode>comparingDouble(r->predict(weights,r.path("x"))).reversed().thenComparing(r->r.path("place_id").asText()));var ideal=new ArrayList<>(rows);ideal.sort(Comparator.<JsonNode>comparingDouble(r->r.path("label").asDouble()).reversed());int n=Math.min(10,rows.size());double relevant=0,dcg=0,idcg=0;
        for(int i=0;i<n;i++){double label=ranked.get(i).path("label").asDouble();if(label>=.7)relevant++;double discount=Math.log(i+2)/Math.log(2);dcg+=(Math.pow(2,label)-1)/discount;idcg+=(Math.pow(2,ideal.get(i).path("label").asDouble())-1)/discount;}
        return Map.of("precision_at_10",relevant/n,"ndcg_at_10",idcg==0?1:dcg/idcg);
    }
    public void fail(UUID id,String code){String log=artifacts.write(json(Map.of("job_id",id,"error",code)));db.update("update intelligence.training_jobs set mutation_version=mutation_version+1,status='FAILED',ended_at=now(),logs_object_key=? where training_job_id=? and status='RUNNING'",log,id);}
    public Map<String,Object> model(UUID id){var row=one("select * from intelligence.model_versions where model_version_id=?",id);var metrics=read(row.get("metrics"));boolean active=Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from intelligence.model_deployments where model_version_id=? and deactivated_at is null)",Boolean.class,id));String status=row.get("status").toString();return Map.of("model_id",id,"model_version_id",id,"status",active?"ACTIVE":status.equals("CANDIDATE")?"TRAINED":status.equals("REJECTED")?"REVOKED":status,"metrics",Map.of("precision_at_10",metrics.path("precision_at_10").asDouble(),"ndcg_at_10",metrics.path("ndcg_at_10").asDouble()),"version",row.get("mutation_version"));}
    public Map<String,Object> models(){return models(20,null);}
    public Map<String,Object> models(int limit,String cursor){
        require(limit>=1&&limit<=100,"INVALID_LIMIT");Instant before=Instant.parse("9999-12-31T00:00:00Z");UUID beforeId=new UUID(-1,-1);
        if(cursor!=null){try{String raw=new String(Base64.getUrlDecoder().decode(cursor),java.nio.charset.StandardCharsets.UTF_8);String[] parts=raw.split("\\|");require(parts.length==4&&parts[0].equals(Integer.toString(limit)),"CURSOR_QUERY_MISMATCH");require(hash(cursorSecret+String.join("|",parts[0],parts[1],parts[2])).equals(parts[3]),"INVALID_CURSOR_SIGNATURE");before=Instant.parse(parts[1]);beforeId=UUID.fromString(parts[2]);}catch(IllegalArgumentException ex){throw bad("INVALID_CURSOR");}}
        var rows=db.queryForList("select model_version_id,created_at from intelligence.model_versions where (created_at,model_version_id)<(?,?) order by created_at desc,model_version_id desc limit ?",Timestamp.from(before),beforeId,limit+1);var items=new ArrayList<Object>();for(var row:rows.subList(0,Math.min(limit,rows.size())))items.add(model((UUID)row.get("model_version_id")));
        String next=null;if(rows.size()>limit){var last=rows.get(limit-1);String raw=limit+"|"+((Timestamp)last.get("created_at")).toInstant()+"|"+last.get("model_version_id");next=Base64.getUrlEncoder().withoutPadding().encodeToString((raw+"|"+hash(cursorSecret+raw)).getBytes(java.nio.charset.StandardCharsets.UTF_8));}
        var response=new LinkedHashMap<String,Object>();response.put("items",items);response.put("next_cursor",next);response.put("as_of",Instant.now().toString());response.put("watermark",1);return response;
    }

    private JsonNode checkedModel(UUID id) {
        var row=one("select * from intelligence.model_versions where model_version_id=?",id);require(!Set.of("REVOKED","REJECTED").contains(row.get("status").toString()),"MODEL_REVOKED");
        UUID dataset=(UUID)one("select dataset_version_id from intelligence.training_jobs where training_job_id=?",row.get("training_job_id")).get("dataset_version_id");checkedDataset(dataset);
        JsonNode content=read(artifacts.read(row.get("artifact_object_key").toString(),row.get("checksum").toString()));checkModelSchema(content);return content;
    }
    private static void checkModelSchema(JsonNode content){
        require(content.path("feature_schema_version").isIntegralNumber()&&content.path("feature_schema_version").asInt()==1&&content.path("weights").isArray()&&content.path("weights").size()==3,"FEATURE_SCHEMA_MISMATCH");
        for(var weight:content.path("weights"))require(weight.isNumber()&&Double.isFinite(weight.asDouble()),"NONFINITE_MODEL");
    }
    public Map<String,Object> validate(UUID actor,UUID id,String reason) {
        checkedModel(id);var m=read(one("select metrics from intelligence.model_versions where model_version_id=?",id).get("metrics"));
        require(m.path("test_rows").asInt()>=3&&Double.isFinite(m.path("mse").asDouble())&&m.path("mse").asDouble()<.1&&m.path("ndcg_at_10").asDouble()>=.5,"FIXTURE_VALIDATION_FAILED");
        db.update("update intelligence.model_versions set mutation_version=mutation_version+1,status='VALIDATED' where model_version_id=? and status='CANDIDATE'",id);projections.audit(actor,"model",id.toString(),"VALIDATE",Map.of("reason",reason,"gate","fixture-only"));return Map.of("request_id",UUID.randomUUID(),"status","COMPLETED","version",1);
    }
    public Map<String,Object> deploy(UUID actor,UUID id,String reason,boolean rollback) {
        require(deploymentEnabled,"PRODUCTION_QUALITY_GATE_NOT_APPROVED");require(!reason.isBlank()&&reason.length()<=1024,"REASON_REQUIRED");
        checkedModel(id);lock("deploy:recommendations");require(one("select status from intelligence.model_versions where model_version_id=? for update",id).get("status").equals("VALIDATED"),"MODEL_NOT_VALIDATED");
        if(rollback)require(Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from intelligence.model_deployments where model_version_id=?)",Boolean.class,id)),"NO_PREVIOUS_DEPLOYMENT");
        UUID deployment=UUID.randomUUID();db.update("update intelligence.model_versions set mutation_version=mutation_version+1 where model_version_id=? or model_version_id in(select model_version_id from intelligence.model_deployments where deactivated_at is null and use_case='recommendations')",id);db.update("update intelligence.model_deployments set deactivated_at=now() where use_case='recommendations' and deactivated_at is null");db.update("insert into intelligence.model_deployments(deployment_id,use_case,model_version_id,activated_by,reason) values(?,'recommendations',?,?,?)",deployment,id,actor,reason);
        projections.publish("intelligence.model.deployed.v1","model",id.toString(),((Number)one("select version_no from intelligence.model_versions where model_version_id=?",id).get("version_no")).longValue(),Map.of("use_case","PLACE_RECOMMENDATION","model_version_id",id,"deployment_id",deployment,"reason",reason),null);projections.audit(actor,"model",id.toString(),rollback?"ROLLBACK":"DEPLOY",Map.of("reason",reason));return Map.of("request_id",deployment,"status","COMPLETED","version",1);
    }
    public Optional<UUID> active(){return db.query("select model_version_id from intelligence.model_deployments where use_case='recommendations' and deactivated_at is null",(r,i)->r.getObject(1,UUID.class)).stream().findFirst();}
    public record InferenceInput(JsonNode model,List<UUID> sources,Map<UUID,JsonNode> lineage) {}
    /** Called by the request transaction; its source/deployment locks survive final visibility validation. */
    public InferenceInput prepareInference(UUID id) {
        db.execute("SET LOCAL lock_timeout='500ms'");
        var model=one("select * from intelligence.model_versions where model_version_id=?",id);
        UUID dataset=(UUID)one("select dataset_version_id from intelligence.training_jobs where training_job_id=?",model.get("training_job_id")).get("dataset_version_id");
        var sources=db.queryForList("select source_id,source_version,license_version from intelligence.dataset_sources where dataset_version_id=? order by source_id",dataset);
        var ids=new ArrayList<UUID>();var lineage=new HashMap<UUID,JsonNode>();
        for(var source:sources){UUID sourceId=(UUID)source.get("source_id");ids.add(sourceId);lineage.put(sourceId,read(json(source)));lock("source:"+sourceId);}
        lock("deploy:recommendations");require(active().equals(Optional.of(id)),"MODEL_REVOKED");
        require(one("select status from intelligence.model_versions where model_version_id=?",id).get("status").equals("VALIDATED"),"MODEL_REVOKED");
        var data=one("select * from intelligence.dataset_versions where dataset_version_id=?",dataset);require(data.get("status").equals("READY"),"DATASET_REVOKED");
        JsonNode snapshot=read(artifacts.read(data.get("artifact_object_key").toString(),data.get("checksum").toString()));require(snapshot.path("feature_schema_version").asInt()==1,"FEATURE_SCHEMA_MISMATCH");
        JsonNode artifact=read(artifacts.read(model.get("artifact_object_key").toString(),model.get("checksum").toString()));checkModelSchema(artifact);
        return new InferenceInput(artifact,List.copyOf(ids),Map.copyOf(lineage));
    }
    /** Worker performs bounded read-only policy validation and scoring, with no transaction locks or mutations. */
    public List<Candidate> infer(InferenceInput input,List<Candidate> candidates) {
        policyCheck(input.sources(),input.lineage());
        JsonNode model=input.model();double[] weights=new double[3];for(int i=0;i<3;i++)weights[i]=model.path("weights").get(i).asDouble();var output=new ArrayList<Candidate>();
        for(var c:candidates){var f=c.features();double rating=f.path("rating_count").asLong()>0?f.path("rating_sum").asDouble()/(5*f.path("rating_count").asLong()):.7;double score=predict(weights,read(json(List.of(1.0,rating,Math.max(0,Math.min(1,f.path("popularity").asDouble()/100))))));var components=new LinkedHashMap<>(c.components());components.put("model",score);output.add(new Candidate(c.id(),c.version(),f,c.asOf(),score,components,c.missing()));}
        output.sort(Comparator.comparingDouble(Candidate::score).reversed().thenComparing(c->c.id().toString()));return output;
    }
    public int cleanup(){var refs=new HashSet<>(db.query("select artifact_object_key from intelligence.dataset_versions where status='READY' union select artifact_object_key from intelligence.model_versions where status<>'REVOKED' union select logs_object_key from intelligence.training_jobs where logs_object_key is not null",(r,i)->r.getString(1)));return artifacts.cleanup(refs,Instant.now().minus(Duration.ofDays(7)));}
}
