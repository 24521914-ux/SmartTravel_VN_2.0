package vn.smarttravel.trip.shared.http;
import org.junit.jupiter.api.Test;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import static org.assertj.core.api.Assertions.*;
class LimitedBodyHandlerTests {
 @Test void oversizedStreamIsCancelledBeforeBufferGrowth()throws Exception{var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/",e->{try{e.sendResponseHeaders(200,64);e.getResponseBody().write(new byte[64]);}finally{e.close();}});server.start();try(var http=HttpClient.newHttpClient()){var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/")).timeout(Duration.ofSeconds(2)).build();assertThatThrownBy(()->http.send(request,new LimitedBodyHandler(8))).hasMessageContaining("size limit");}finally{server.stop(0);}}
 @Test void fullBodyDeadlineIncludesDelayedChunk()throws Exception{var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/",e->{try{e.sendResponseHeaders(200,2);e.getResponseBody().write(65);e.getResponseBody().flush();try{Thread.sleep(1000);}catch(InterruptedException error){Thread.currentThread().interrupt();}e.getResponseBody().write(66);}finally{e.close();}});server.start();try(var http=HttpClient.newHttpClient()){var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/")).timeout(Duration.ofMillis(200)).build();assertThatThrownBy(()->http.send(request,new LimitedBodyHandler(8,Duration.ofMillis(200)))).isInstanceOf(HttpTimeoutException.class);}finally{server.stop(0);}}
}
