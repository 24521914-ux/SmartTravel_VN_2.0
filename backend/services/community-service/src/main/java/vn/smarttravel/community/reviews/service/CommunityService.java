package vn.smarttravel.community.reviews.service;
import java.util.function.Supplier;
import java.util.List;
import org.springframework.stereotype.Service;
import vn.smarttravel.community.reviews.repository.CommunityRepository;
@Service
public class CommunityService {
    private final CommunityRepository repository;
    public CommunityService(CommunityRepository repository){this.repository=repository;}
    private <T> T retry(Supplier<T> action){
        for(int attempt=0;;attempt++)try{return action.get();}catch(RuntimeException error){
            Throwable cause=error;boolean transientFailure=false;while(cause!=null){if(cause instanceof com.mongodb.MongoException mongo&&mongo.hasErrorLabel("TransientTransactionError"))transientFailure=true;cause=cause.getCause();}
            if(!transientFailure||attempt==2)throw error;
        }
    }
    public Object createReview(String user,String place,int rating,String content){return retry(()->repository.createReview(user,place,rating,content));}
    public Object editReview(String user,String review,long expected,Integer rating,String content,boolean delete){return retry(()->repository.editReview(user,review,expected,rating,content,delete));}
    public Object moderate(String reviewer,String review,long expected,String action,String reason){return retry(()->repository.moderate(reviewer,review,expected,action,reason));}
    public Object reviews(String place){return repository.reviews(place);}
    public void favorite(String user,String place,boolean enabled){retry(()->{repository.favorite(user,place,enabled);return true;});}
    public Object favorites(String user){return repository.favorites(user);}
    public Object createWithMedia(String user,String place,int rating,String content,List<String> keys){return retry(()->repository.createWithMedia(user,place,rating,content,keys));}
    public Object editWithMedia(String user,String review,long version,int rating,String content,List<String> keys){return retry(()->repository.editWithMedia(user,review,version,rating,content,keys));}
}
