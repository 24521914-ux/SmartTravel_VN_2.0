package vn.smarttravel.community.contributions.service;
import java.util.*;
import org.bson.Document;
import org.springframework.stereotype.Service;
import vn.smarttravel.community.contributions.repository.ContributionRepository;
@Service
public class ContributionService {
    private final ContributionRepository repo;public ContributionService(ContributionRepository repo){this.repo=repo;}
    public Document create(String user,Map<String,Object> body){return repo.create(user,body);}
    public Document edit(String id,String user,long expected,Map<String,Object> body){return repo.edit(id,user,expected,body);}
    public Document withdraw(String id,String user,long expected){return repo.withdraw(id,user,expected);}
    public List<Document> list(String user){return repo.list(user);}
    public List<Document> pending(){return repo.pending();}
    public Document moderate(String id,String user,long expected,String action,String reason){return repo.moderate(id,user,expected,action,reason);}
    public boolean result(String event,String command,String id,boolean applied,Map<String,Object> payload){return repo.result(event,command,id,applied,payload);}
}
