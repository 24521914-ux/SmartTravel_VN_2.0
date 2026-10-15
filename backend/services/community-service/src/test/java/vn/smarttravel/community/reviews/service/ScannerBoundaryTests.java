package vn.smarttravel.community.reviews.service;
import java.util.*;
import java.net.InetSocketAddress;
import java.util.concurrent.Executors;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class ScannerBoundaryTests {
 @Test void scannerApproveAndErrorsAreBoundedWithoutApprovingQuarantine()throws Exception{
  var mode=new java.util.concurrent.atomic.AtomicReference<>("clean");var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  try(var executor=Executors.newVirtualThreadPerTaskExecutor()){
   server.setExecutor(executor);server.createContext("/scan",e->{try{
    assertThat(e.getRequestMethod()).isEqualTo("POST");assertThat(new String(e.getRequestBody().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8)).contains("object_key","checksum");
    String current=mode.get();e.sendResponseHeaders(current.equals("error")?503:200,0);
    if(current.equals("huge")){byte[] bytes=new byte[65536];Arrays.fill(bytes,(byte)' ');for(int i=0;i<20;i++)e.getResponseBody().write(bytes);}
    else if(current.equals("slow")){e.getResponseBody().write('{');e.getResponseBody().flush();Thread.sleep(4000);e.getResponseBody().write('}');}
    else e.getResponseBody().write((current.equals("reject")?"{\"clean\":false}":"{\"clean\":true}").getBytes(java.nio.charset.StandardCharsets.UTF_8));
   }catch(java.io.IOException ignored){}catch(InterruptedException error){Thread.currentThread().interrupt();}finally{e.close();}});server.start();
   try{String base="http://127.0.0.1:"+server.getAddress().getPort();var repo=mock(vn.smarttravel.community.reviews.repository.ReviewMediaRepository.class);String actor=UUID.randomUUID().toString(),key="quarantine/fixture";when(repo.get(actor,key)).thenReturn(new org.bson.Document("object_key",key).append("checksum","sha"));var media=new UgcMediaService(repo,System.getProperty("java.io.tmpdir"),base);
    media.scan(actor,key);verify(repo).decision(actor,key,true); clearInvocations(repo);
    for(String failure:List.of("huge","slow","error","reject")){mode.set(failure);long start=System.nanoTime();assertThatThrownBy(()->media.scan(actor,key)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);if(failure.equals("slow"))assertThat(java.time.Duration.ofNanos(System.nanoTime()-start).toMillis()).isLessThan(3500);verify(repo,never()).decision(any(),any(),eq(true));}
   }finally{server.stop(0);}
  }
 }
}
