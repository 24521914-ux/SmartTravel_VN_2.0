package vn.smarttravel.catalog.offerings.service;
import java.util.*;
import org.springframework.stereotype.Service;
import vn.smarttravel.catalog.offerings.repository.OfferingRepository;
@Service
public class OfferingService {
    private final OfferingRepository repo;public OfferingService(OfferingRepository repo){this.repo=repo;}
    public Object list(UUID place,boolean publicOnly){return repo.list(place,publicOnly);}
    public Object get(UUID id,boolean publicOnly){return repo.get(id,publicOnly);}
    public Object create(Map<String,Object> body,UUID actor){return repo.create(body,actor);}
    public Object update(UUID id,long version,Map<String,Object> body){return repo.update(id,version,body);}
    public void archive(UUID id,long version){repo.archive(id,version);}
}
