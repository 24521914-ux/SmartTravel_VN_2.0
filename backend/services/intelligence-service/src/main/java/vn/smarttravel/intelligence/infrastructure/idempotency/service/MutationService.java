package vn.smarttravel.intelligence.infrastructure.idempotency.service;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import vn.smarttravel.intelligence.infrastructure.idempotency.repository.MutationRepository;

@Service
public class MutationService {
    private final MutationRepository repository;
    private final vn.smarttravel.intelligence.projections.service.ProjectionService projections;
    public MutationService(MutationRepository repository,vn.smarttravel.intelligence.projections.service.ProjectionService projections){this.repository=repository;this.projections=projections;}
    @Transactional public Map<String,Object> execute(String scope,UUID actor,String key,String resource,String match,Object input,int status,Supplier<Long> version,Supplier<Map<String,Object>> operation){
        projections.guardActor(actor);
        require(key!=null&&!key.isBlank()&&key.length()<=128,"IDEMPOTENCY_KEY_REQUIRED");String checksum=hash(json(List.of(Objects.requireNonNullElse(resource,""),Objects.requireNonNullElse(match,""),input)));repository.lock("idempotency:"+scope+":"+actor+":"+key);var replay=repository.replay(scope,actor,key,checksum);if(replay.isPresent())return replay.get();
        if(resource!=null)repository.lock("mutation:"+resource);
        if(version!=null){if(match==null)throw new ResponseStatusException(HttpStatus.PRECONDITION_REQUIRED,"IF_MATCH_REQUIRED");long expected;try{expected=Long.parseLong(match.replace("\"",""));}catch(Exception e){throw bad("INVALID_IF_MATCH");}if(expected!=version.get())throw conflict("VERSION_CONFLICT");}
        var response=operation.get();repository.store(scope,actor,key,checksum,status,response);return response;
    }
    @Transactional public Map<String,Object> versioned(UUID actor,String resource,String match,Supplier<Long> version,Supplier<Map<String,Object>> operation){projections.guardActor(actor);repository.lock("mutation:"+resource);if(match==null)throw new ResponseStatusException(HttpStatus.PRECONDITION_REQUIRED,"IF_MATCH_REQUIRED");long expected;try{expected=Long.parseLong(match.replace("\"",""));}catch(Exception e){throw bad("INVALID_IF_MATCH");}if(expected!=version.get())throw conflict("VERSION_CONFLICT");return operation.get();}
}
