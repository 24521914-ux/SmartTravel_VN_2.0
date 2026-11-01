package vn.smarttravel.catalog.media.service;
import java.util.*;
import java.net.InetSocketAddress;
import java.util.concurrent.Executors;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class ScannerBoundaryTests {
 @Test void scannerApproveAndErrorsAreBoundedWithoutApprovingQuarantine()throws Exception{
  var mode=new java.util.concurrent.atomic.AtomicReference<>("clean");
  var method=new java.util.concurrent.atomic.AtomicReference<String>();
  var requestBody=new java.util.concurrent.atomic.AtomicReference<String>();
  var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  try(var executor=Executors.newVirtualThreadPerTaskExecutor()){
   server.createContext("/ready",e->{e.sendResponseHeaders(204,-1);e.close();});
   server.setExecutor(executor);server.createContext("/scan",e->{try{
    method.set(e.getRequestMethod());requestBody.set(new String(e.getRequestBody().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8));
    String current=mode.get();e.sendResponseHeaders(current.equals("error")?503:200,0);
    if(current.equals("huge")){byte[] bytes=new byte[65536];Arrays.fill(bytes,(byte)' ');for(int i=0;i<20;i++)e.getResponseBody().write(bytes);}
    else if(current.equals("slow")){e.getResponseBody().write('{');e.getResponseBody().flush();Thread.sleep(4000);e.getResponseBody().write('}');}
    else e.getResponseBody().write((current.equals("reject")?"{\"clean\":false}":"{\"clean\":true}").getBytes(java.nio.charset.StandardCharsets.UTF_8));
   }catch(java.io.IOException ignored){}catch(InterruptedException error){Thread.currentThread().interrupt();}finally{e.close();}});server.start();
   try{String base="http://127.0.0.1:"+server.getAddress().getPort();
    // Establish fixture readiness and initialize the JDK HTTP stack before
    // measuring the application's two-second dependency deadline.
    try(var probe=java.net.http.HttpClient.newHttpClient()) {
     var ready=probe.send(java.net.http.HttpRequest.newBuilder(java.net.URI.create(base+"/ready")).timeout(java.time.Duration.ofSeconds(10)).GET().build(),java.net.http.HttpResponse.BodyHandlers.discarding());
     assertThat(ready.statusCode()).isEqualTo(204);
    }
    var repo=mock(vn.smarttravel.catalog.media.repository.MediaRepository.class);UUID id=UUID.randomUUID(),actor=UUID.randomUUID();when(repo.get(id,false)).thenReturn(Map.of("object_key","quarantine/fixture","checksum","sha"));var media=new MediaService(repo,System.getProperty("java.io.tmpdir"),base);
    media.review(id,actor,"APPROVED","checked");
    assertThat(method.get()).isEqualTo("POST");assertThat(requestBody.get()).contains("object_key","checksum");
    verify(repo).review(id,actor,"APPROVED","checked"); clearInvocations(repo);
    for(String failure:List.of("huge","slow","error","reject")){mode.set(failure);long start=System.nanoTime();assertThatThrownBy(()->media.review(id,actor,"APPROVED","checked")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);if(failure.equals("slow"))assertThat(java.time.Duration.ofNanos(System.nanoTime()-start).toMillis()).isLessThan(3500);verify(repo,never()).review(any(),any(),any(),any());}
   }finally{server.stop(0);}
  }
 }
}
