package vn.smarttravel.intelligence.models.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.smarttravel.intelligence.models.repository.ModelRepository;
import vn.smarttravel.intelligence.projections.service.ProjectionService;
import vn.smarttravel.intelligence.recommendations.service.BasicService;

@Service
public class ModelService {
    private final ModelRepository repository;
    private final BasicService basic;
    private final ProjectionService projections;
    private final int deadline;
    private final ThreadPoolExecutor inference=new ThreadPoolExecutor(2,2,30,TimeUnit.SECONDS,new ArrayBlockingQueue<>(10),r->{Thread t=new Thread(r,"model-inference");t.setDaemon(true);return t;},new ThreadPoolExecutor.AbortPolicy());
    public ModelService(ModelRepository repository,BasicService basic,ProjectionService projections,@Value("${intelligence.inference-deadline-ms:100}") int deadline){this.repository=repository;this.basic=basic;this.projections=projections;this.deadline=deadline;}
    @Transactional public Map<String,Object> build(UUID actor,JsonNode request){projections.guardActor(actor);return repository.build(actor,request);}
    public Map<String,Object> dataset(UUID id){return repository.dataset(id);}
    @Transactional public Map<String,Object> enqueue(UUID actor,JsonNode request){projections.guardActor(actor);return repository.enqueue(actor,request);}
    public Map<String,Object> job(UUID id){return repository.job(id);}
    @Transactional public Map<String,Object> cancel(UUID actor,UUID id){projections.guardActor(actor);return repository.cancel(actor,id);}
    @Transactional public Optional<UUID> claim(){return repository.claim();}
    @Transactional public UUID train(UUID id){return repository.train(id);}
    @Transactional public void fail(UUID id,String code){repository.fail(id,code);}
    public Map<String,Object> models(){return repository.models();}
    public Map<String,Object> models(int limit,String cursor){return repository.models(limit,cursor);}
    public Map<String,Object> model(UUID id){return repository.model(id);}
    @Transactional public Map<String,Object> validate(UUID actor,UUID id,String reason){projections.guardActor(actor);return repository.validate(actor,id,reason);}
    @Transactional public Map<String,Object> deploy(UUID actor,UUID id,String reason,boolean rollback){projections.guardActor(actor);return repository.deploy(actor,id,reason,rollback);}
    @Transactional public Map<String,Object> recommend(UUID user,JsonNode criteria){
        try(var budget=vn.smarttravel.intelligence.shared.http.RecommendationDeadline.start()){
        basic.beginRecommendation();
        if(user!=null)projections.userLock(user);
        var candidates=basic.candidates(user,criteria);var active=repository.active();if(active.isEmpty())return basic.persist(user,criteria,candidates,"BASIC","basic-v1",null,null);
        String fallback="MODEL_UNAVAILABLE";Future<List<vn.smarttravel.intelligence.recommendations.repository.BasicRepository.Candidate>> result=null;
        List<vn.smarttravel.intelligence.recommendations.repository.BasicRepository.Candidate> ranked=null;
        try{
            var input=repository.prepareInference(active.get());
            result=inference.submit(()->repository.infer(input,candidates));ranked=result.get(Math.min(deadline,vn.smarttravel.intelligence.shared.http.RecommendationDeadline.remaining().toMillis()),TimeUnit.MILLISECONDS);
            // Recheck deployment after inference to avoid serving a concurrent revoked model.
            if(!repository.active().equals(active))throw new IllegalStateException("MODEL_REVOKED");
        }catch(TimeoutException e){fallback="MODEL_TIMEOUT";if(result!=null)result.cancel(true);}
        catch(InterruptedException e){Thread.currentThread().interrupt();fallback="MODEL_INTERRUPTED";}
        catch(ExecutionException e){fallback="MODEL_VALIDATION_FAILED";}
        catch(RejectedExecutionException e){fallback="MODEL_BUSY";}
        catch(IllegalStateException e){fallback="MODEL_REVOKED";}
        catch(org.springframework.web.server.ResponseStatusException|IllegalArgumentException e){fallback="MODEL_VALIDATION_FAILED";}
        // Final Catalog validation remains outside model fallback handling and fails closed.
        if(ranked!=null&&fallback.equals("MODEL_UNAVAILABLE"))return basic.persist(user,criteria,ranked,"MODEL","linear-sgd-v1",active.get(),null);
        return basic.persist(user,criteria,candidates,"FALLBACK","basic-v1",null,fallback);
        }
    }
    public int cleanup(){return repository.cleanup();}
    @jakarta.annotation.PreDestroy public void close(){inference.shutdownNow();}
}
