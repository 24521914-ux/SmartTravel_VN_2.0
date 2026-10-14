package vn.smarttravel.intelligence.shared.http;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.time.Duration;
import java.net.http.HttpTimeoutException;
import java.util.concurrent.*;
import java.util.concurrent.Flow;
/** Bounded subscriber: every body chunk has explicit size and time limits. */
public final class LimitedBodyHandler implements HttpResponse.BodyHandler<byte[]> {
 private static final ScheduledExecutorService DEADLINES=Executors.newSingleThreadScheduledExecutor(r->{var t=new Thread(r,"dependency-body-deadline");t.setDaemon(true);return t;});
 private final int max;private final Duration deadline;
 public LimitedBodyHandler(int max){this(max,Duration.ofSeconds(3));}
 public LimitedBodyHandler(int max,Duration deadline){if(max<=0)throw new IllegalArgumentException("Positive response bound required");this.max=max;this.deadline=deadline;}
 public HttpResponse.BodySubscriber<byte[]> apply(HttpResponse.ResponseInfo info){return new Subscriber(max,deadline);}
 private static final class Subscriber implements HttpResponse.BodySubscriber<byte[]> {
  private final CompletableFuture<byte[]> body=new CompletableFuture<>();private final ByteArrayOutputStream bytes=new ByteArrayOutputStream();private final int max;private volatile Flow.Subscription subscription;
  Subscriber(int max,Duration deadline){this.max=max;var timer=DEADLINES.schedule(()->{body.completeExceptionally(new HttpTimeoutException("Dependency body deadline exceeded"));if(subscription!=null)subscription.cancel();},deadline.toMillis(),TimeUnit.MILLISECONDS);body.whenComplete((value,error)->timer.cancel(false));}
  public CompletionStage<byte[]> getBody(){return body;}
  public void onSubscribe(Flow.Subscription subscription){this.subscription=subscription;if(body.isDone())subscription.cancel();else subscription.request(1);}
  public void onNext(List<ByteBuffer> chunks){for(var chunk:chunks){if(chunk.remaining()>max-bytes.size()){subscription.cancel();body.completeExceptionally(new IllegalStateException("Dependency response exceeded size limit"));return;}byte[] copy=new byte[chunk.remaining()];chunk.get(copy);bytes.writeBytes(copy);}subscription.request(1);}
  public void onError(Throwable error){body.completeExceptionally(error);}
  public void onComplete(){body.complete(bytes.toByteArray());}
 }
}
