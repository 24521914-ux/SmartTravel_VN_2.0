package vn.smarttravel.intelligence.recommendations.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.smarttravel.intelligence.recommendations.repository.BasicRepository;

@Service
public class BasicService {
    private final BasicRepository repository;
    public BasicService(BasicRepository repository){this.repository=repository;}
    @Transactional public Map<String,Object> interactions(UUID user,JsonNode input){return repository.interactions(user,input);}
    @Transactional(readOnly=true) public Map<String,Object> history(UUID user,int limit,String cursor){return repository.history(user,limit,cursor);}
    @Transactional public Map<String,Object> deleteHistory(UUID user){return repository.deleteHistory(user);}
    @Transactional public Map<String,Object> recommend(UUID user,JsonNode criteria){try(var budget=vn.smarttravel.intelligence.shared.http.RecommendationDeadline.start()){repository.beginRecommendation();return repository.recommend(user,criteria);}}
    public void beginRecommendation(){repository.beginRecommendation();}
    public List<BasicRepository.Candidate> candidates(UUID user,JsonNode criteria){return repository.candidates(user,criteria);}
    public Map<String,Object> persist(UUID user,JsonNode criteria,List<BasicRepository.Candidate> candidates,String mode,String version,UUID model,String reason){return repository.persist(user,criteria,candidates,mode,version,model,reason);}
    @Transactional public int retention(){return repository.retention();}
}
