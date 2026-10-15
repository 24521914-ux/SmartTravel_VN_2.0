package vn.smarttravel.catalog.places.service;
import java.util.*;
import org.springframework.stereotype.Service;
import vn.smarttravel.catalog.places.repository.BusinessRepository;
@Service
public class BusinessService {
    private final BusinessRepository repository;
    public BusinessService(BusinessRepository repository){this.repository=repository;}
    public Object create(UUID user,Map<String,Object> body){return repository.create(user,body);}
    public Object verify(UUID id,long version,String status){return repository.verify(id,version,status);}
    public Object claim(UUID id,UUID user,Map<String,Object> body){return repository.claim(id,user,body);}
    public Object reviewClaim(UUID id,UUID reviewer,String status,String reason){return repository.reviewClaim(id,reviewer,status,reason);}
    public Object request(UUID id,UUID user,long expected,Map<String,Object> fields){return repository.request(id,user,expected,fields);}
    public Object reviewRequest(UUID id,UUID admin,String decision,String reason){return repository.reviewRequest(id,admin,decision,reason);}
    public List<Map<String,Object>> list(UUID user){return repository.list(user);}
    public Map<String,Object> get(UUID id,UUID user){return repository.get(id,user);}
    public Map<String,Object> update(UUID id,UUID user,long version,Map<String,Object> body){return repository.update(id,user,version,body);}
    public void delete(UUID id,UUID user,long version){repository.delete(id,user,version);}
    public List<Map<String,Object>> members(UUID id,UUID user){return repository.members(id,user);}
    public Map<String,Object> member(UUID id,UUID member,UUID user){return repository.member(id,member,user);}
    public Map<String,Object> ownMembership(UUID id,UUID user,String role){return repository.ownMembership(id,user,role);}
    public Map<String,Object> memberUpdate(UUID id,UUID member,UUID user,long version,String role){return repository.memberUpdate(id,member,user,version,role);}
    public void memberDelete(UUID id,UUID member,UUID user,long version){repository.memberDelete(id,member,user,version);}
    public Map<String,Object> verification(UUID id,UUID user,List<String> evidence){return repository.verification(id,user,evidence);}
    public Map<String,Object> verificationReview(UUID id,UUID admin,String action,String reason){return repository.verificationReview(id,admin,action,reason);}
}
