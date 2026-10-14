package vn.smarttravel.identity.shared.web;

import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import static org.assertj.core.api.Assertions.*;

class RequestSizeFilterTests {
    @Test void boundedChunkedAndDeclaredOversizedBodiesAreRejectedWithoutInvokingController() throws Exception {
        var filter=new RequestSizeFilter();
        for(boolean chunked:new boolean[]{true,false}) {
            var request=new MockHttpServletRequest("POST","/api/v1/auth/register");
            request.setContent(new byte[RequestSizeFilter.MAX_BYTES+1]);
            jakarta.servlet.http.HttpServletRequest input=request;
            if(chunked) input=new jakarta.servlet.http.HttpServletRequestWrapper(request) {
                @Override public long getContentLengthLong() { return -1; }
                @Override public int getContentLength() { return -1; }
            };
            var response=new MockHttpServletResponse(); var called=new AtomicBoolean();
            filter.doFilter(input,response,(a,b) -> called.set(true));
            assertThat(called.get()).isFalse(); assertThat(response.getStatus()).isEqualTo(413);
            assertThat(response.getContentAsString()).contains("REQUEST_TOO_LARGE","fieldErrors");
        }
    }
    @Test void smallJsonBodyRemainsReadableAfterSizeCheck() throws Exception {
        var request=new MockHttpServletRequest("PATCH","/api/v1/me"); request.setContent("{\"display_name\":\"Test\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        var response=new MockHttpServletResponse();
        new RequestSizeFilter().doFilter(request,response,(a,b) -> assertThat(new String(a.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8)).contains("display_name"));
    }
}
