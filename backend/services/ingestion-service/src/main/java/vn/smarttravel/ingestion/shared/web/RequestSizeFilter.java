package vn.smarttravel.ingestion.shared.web;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Bounded buffering protects JSON bodies including chunked requests, not just Content-Length. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE+20)
public class RequestSizeFilter extends OncePerRequestFilter {
    public static final int MAX_BYTES=262144;
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException,IOException {
        response.setHeader("Cache-Control","no-store");
        if(!java.util.Set.of("POST","PUT","PATCH").contains(request.getMethod())) { chain.doFilter(request,response); return; }
        if(request.getContentLengthLong()>MAX_BYTES) { reject(response); return; }
        byte[] bytes=request.getInputStream().readNBytes(MAX_BYTES+1);
        if(bytes.length>MAX_BYTES) { reject(response); return; }
        var wrapped=new HttpServletRequestWrapper(request) {
            @Override public ServletInputStream getInputStream() {
                var source=new ByteArrayInputStream(bytes);
                return new ServletInputStream() {
                    @Override public int read() { return source.read(); }
                    @Override public int read(byte[] target,int offset,int length) { return source.read(target,offset,length); }
                    @Override public boolean isFinished() { return source.available()==0; }
                    @Override public boolean isReady() { return true; }
                    @Override public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException("Synchronous JSON endpoint"); }
                };
            }
            @Override public BufferedReader getReader() { return new BufferedReader(new InputStreamReader(getInputStream(),StandardCharsets.UTF_8)); }
        };
        chain.doFilter(wrapped,response);
    }
    private void reject(HttpServletResponse response) throws IOException {
        response.setStatus(413); response.setContentType("application/json");
        String trace=org.slf4j.MDC.get("traceId");
        new com.fasterxml.jackson.databind.ObjectMapper().writeValue(response.getOutputStream(),Map.of(
                "code","REQUEST_TOO_LARGE","message","Request exceeds the configured limit","traceId",trace==null?"unavailable":trace,"fieldErrors",java.util.List.of()));
    }
}
