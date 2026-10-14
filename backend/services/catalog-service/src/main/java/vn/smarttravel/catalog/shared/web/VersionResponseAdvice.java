package vn.smarttravel.catalog.shared.web;
import java.util.Map;
import org.springframework.core.MethodParameter;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;
@RestControllerAdvice
public class VersionResponseAdvice implements ResponseBodyAdvice<Object> {
    @Override public boolean supports(MethodParameter parameter,Class<? extends HttpMessageConverter<?>> type){return true;}
    @Override public Object beforeBodyWrite(Object body,MethodParameter parameter,MediaType type,Class<? extends HttpMessageConverter<?>> converter,org.springframework.http.server.ServerHttpRequest request,org.springframework.http.server.ServerHttpResponse response){if(body instanceof Map<?,?> row&&row.get("version") instanceof Number version)response.getHeaders().setETag("\""+version.longValue()+"\"");return body;}
}
