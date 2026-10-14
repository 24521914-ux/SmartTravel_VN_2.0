package vn.smarttravel.catalog.taxonomy.service;
import java.util.*;
import org.springframework.stereotype.Service;
import vn.smarttravel.catalog.taxonomy.repository.TaxonomyRepository;
@Service
public class TaxonomyService {
    private final TaxonomyRepository repository;public TaxonomyService(TaxonomyRepository repository){this.repository=repository;}
    public Object list(String kind){return repository.list(kind);}
    public Object get(String kind,UUID id){return repository.get(kind,id);}
    public Object create(String kind,Map<String,Object> body,UUID actor){return repository.create(kind,body,actor);}
    public Object update(String kind,UUID id,Long version,Map<String,Object> body,UUID actor){return repository.update(kind,id,version,body,actor);}
    public void delete(String kind,UUID id,Long version,UUID actor){repository.delete(kind,id,version,actor);}
}
