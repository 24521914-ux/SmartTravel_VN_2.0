package vn.smarttravel.community.collections.service;
import java.util.*;
import org.bson.Document;
import org.springframework.stereotype.Service;
import vn.smarttravel.community.collections.repository.CollectionRepository;
@Service
public class CollectionService {
    private final CollectionRepository repo;public CollectionService(CollectionRepository repo){this.repo=repo;}
    public Document get(String id,String user,boolean owner){return repo.get(id,user,owner);}
    public List<Document> list(String user){return repo.list(user);}
    public Document create(String user,Map<String,Object> body){return repo.create(user,body);}
    public Document update(String id,String user,long version,Map<String,Object> body){return repo.update(id,user,version,body);}
    public void delete(String id,String user,long version){repo.delete(id,user,version);}
    public List<Document> items(String id,String user){return repo.items(id,user);}
    public Document item(String id,String item,String user){return repo.item(id,item,user);}
    public Document add(String id,String user,long version,Map<String,Object> body){return repo.add(id,user,version,body);}
    public Document updateItem(String id,String item,String user,long version,Map<String,Object> body){return repo.updateItem(id,item,user,version,body);}
    public void deleteItem(String id,String item,String user,long version){repo.deleteItem(id,item,user,version);}
    public List<Document> reorder(String id,String user,long version,List<String> order){return repo.reorder(id,user,version,order);}
}
