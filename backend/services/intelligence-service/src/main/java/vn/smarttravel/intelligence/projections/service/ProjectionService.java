package vn.smarttravel.intelligence.projections.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.smarttravel.intelligence.projections.repository.ProjectionRepository;

@Service
public class ProjectionService {
    private final ProjectionRepository repository;
    public ProjectionService(ProjectionRepository repository){this.repository=repository;}
    public void userLock(UUID user){repository.userLock(user);}
    public void guardActor(UUID user){repository.guardActor(user);}
    public boolean tombstoned(UUID user){return repository.tombstoned(user);}
    public Optional<JsonNode> profile(UUID user){return repository.profile(user);}
    @Transactional public boolean consume(JsonNode event){return repository.consume(event);}
    @Transactional public int rebuild(UUID actor,JsonNode snapshot){return repository.rebuild(actor,snapshot);}
    @Transactional public int rebuild(UUID actor,String source,JsonNode snapshot){return repository.rebuild(actor,source,snapshot);}
    public void purge(UUID user,boolean tombstone){repository.purge(user,tombstone);}
    public void purgeHistory(UUID user){repository.purgeHistory(user);}
    public void revokeModels(){repository.revokeModels();}
    public void publish(String type,String aggregate,String id,long version,Object payload,UUID causation){repository.publish(type,aggregate,id,version,payload,causation);}
    public void audit(UUID actor,String entity,String id,String action,Object value){repository.audit(actor,entity,id,action,value);}
}
