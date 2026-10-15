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
  var mode=new java.util.concurrent.atomic.AtomicReference<>("clean");var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  try(var executor=Executors.newVirtualThreadPerTaskExecutor()){
   server.setExecutor(executor);server.createContext("/scan",e->{try{
    assertThat(e.getRequestMethod()).isEqualTo("POST");assertThat(new String(e.getRequestBody().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8)).contains("object_key","checksum");
    String current=mode.get();e.sendResponseHeaders(current.equals("error")?503:200,0);
    if(current.equals("huge")){byte[] bytes=new byte[65536];Arrays.fill(bytes,(byte)' ');for(int i=0;i<20;i++)e.getResponseBody().write(bytes);}
    else if(current.equals("slow")){e.getResponseBody().write('{');e.getResponseBody().flush();Thread.sleep(4000);e.getResponseBody().write('}');}
    else e.getResponseBody().write((current.equals("reject")?"{\"clean\":false}":"{\"clean\":true}").getBytes(java.nio.charset.StandardCharsets.UTF_8));
   }catch(java.io.IOException ignored){}catch(InterruptedException error){Thread.currentThread().interrupt();}finally{e.close();}});server.start();
   try{String base="http://127.0.0.1:"+server.getAddress().getPort();var repo=mock(vn.smarttravel.catalog.media.repository.MediaRepository.class);UUID id=UUID.randomUUID(),actor=UUID.randomUUID();when(repo.get(id,false)).thenReturn(Map.of("object_key","quarantine/fixture","checksum","sha"));var media=new MediaService(repo,System.getProperty("java.io.tmpdir"),base);
    media.review(id,actor,"APPROVED","checked");verify(repo).review(id,actor,"APPROVED","checked"); clearInvocations(repo);
    for(String failure:List.of("huge","slow","error","reject")){mode.set(failure);long start=System.nanoTime();assertThatThrownBy(()->media.review(id,actor,"APPROVED","checked")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);if(failure.equals("slow"))assertThat(java.time.Duration.ofNanos(System.nanoTime()-start).toMillis()).isLessThan(3500);verify(repo,never()).review(any(),any(),any(),any());}
   }finally{server.stop(0);}
  }
 }
}
