package vn.smarttravel.catalog.infrastructure.persistence.service;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;
import vn.smarttravel.catalog.infrastructure.persistence.repository.IdempotencyRepository;
@Service
public class IdempotencyService {
    private final IdempotencyRepository repo;public IdempotencyService(IdempotencyRepository repo){this.repo=repo;}
    public Object execute(String actor,String operation,String key,Map<String,Object> request,Supplier<Object> action){return repo.execute(actor,operation,key,request,action);}
}
