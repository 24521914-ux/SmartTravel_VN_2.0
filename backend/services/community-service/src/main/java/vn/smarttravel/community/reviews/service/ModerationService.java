package vn.smarttravel.community.reviews.service;
import java.util.*;
import org.bson.Document;
import org.springframework.stereotype.Service;
import vn.smarttravel.community.reviews.repository.ModerationRepository;
@Service
public class ModerationService {
    private final ModerationRepository repository;
    public ModerationService(ModerationRepository repository){this.repository=repository;}
    public Document report(String review,String user,String reason){return repository.report(review,user,reason);}
    public List<Document> queue(String collection){return repository.queue(collection);}
    public Document moderate(String report,String actor,long version,String action,String reason){return repository.moderate(report,actor,version,action,reason);}
    public List<Document> ratings(List<String> ids){return repository.ratings(ids);}
    public List<Document> snapshot(){return repository.snapshot();}
}
