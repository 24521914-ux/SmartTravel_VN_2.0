package vn.smarttravel.community.reviews.client;
import static org.assertj.core.api.Assertions.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
class CatalogClientTests {
    void validate(String body,boolean accepted)throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/internal/v1/places/validate",e->{byte[] bytes=body.getBytes(StandardCharsets.UTF_8);e.sendResponseHeaders(200,bytes.length);e.getResponseBody().write(bytes);e.close();});server.start();
        try{var client=new CatalogClient("http://127.0.0.1:"+server.getAddress().getPort(),"workload",vn.smarttravel.community.shared.http.WorkloadTokens.disabled());if(accepted)assertThatCode(()->client.validate("10000000-0000-4000-8000-000000000001")).doesNotThrowAnyException();else assertThatThrownBy(()->client.validate("10000000-0000-4000-8000-000000000001")).hasMessageContaining("Place unavailable");}finally{server.stop(0);}
    }
    @Test void acceptsActualValidationContract()throws Exception {validate("{\"items\":[{\"place_id\":\"10000000-0000-4000-8000-000000000001\",\"public\":true,\"version\":2}],\"missing_ids\":[]}",true);}
    @Test void rejectsHiddenPlace()throws Exception {validate("{\"items\":[{\"place_id\":\"10000000-0000-4000-8000-000000000001\",\"public\":false}]}",false);}
    @Test void rejectsDifferentIdOrLegacyStatus()throws Exception {validate("{\"items\":[{\"place_id\":\"10000000-0000-4000-8000-000000000002\",\"public\":true}]}",false);validate("{\"valid\":true,\"status\":\"PUBLISHED\"}",false);}
}
