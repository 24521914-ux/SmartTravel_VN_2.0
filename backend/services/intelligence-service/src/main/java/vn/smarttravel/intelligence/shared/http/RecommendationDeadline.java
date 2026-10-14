package vn.smarttravel.intelligence.shared.http;
import java.time.Duration;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
/** One budget covers database locks, candidate retrieval, inference and every validation page. */
public final class RecommendationDeadline implements AutoCloseable {
 private static final ThreadLocal<Long> END=new ThreadLocal<>();
 private RecommendationDeadline(){END.set(System.nanoTime()+Duration.ofSeconds(3).toNanos());}
 public static RecommendationDeadline start(){return new RecommendationDeadline();}
 public static Duration remaining(){Long end=END.get();if(end==null)return Duration.ofSeconds(2);long left=end-System.nanoTime();if(left<=0)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"RECOMMENDATION_TIMEOUT");return Duration.ofNanos(Math.min(left,Duration.ofSeconds(2).toNanos()));}
 public void close(){END.remove();}
}
