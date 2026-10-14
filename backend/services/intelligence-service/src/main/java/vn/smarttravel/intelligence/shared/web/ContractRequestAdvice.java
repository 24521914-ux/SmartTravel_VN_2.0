package vn.smarttravel.intelligence.shared.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.networknt.schema.*;
import java.lang.reflect.Type;
import java.util.*;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.*;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;
import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;

@RestControllerAdvice
public class ContractRequestAdvice extends RequestBodyAdviceAdapter {
    private final Map<String,JsonSchema> schemas=new LinkedHashMap<>();
    public ContractRequestAdvice()throws java.io.IOException{try(var stream=getClass().getResourceAsStream("/request-contracts.json")){for(JsonNode rule:JSON.readTree(stream))schemas.put(rule.path("method").asText()+" "+rule.path("path").asText().replaceAll("\\{[^}]+}","[^/]+"),JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(rule.path("schema")));}}
    @Override public boolean supports(MethodParameter parameter,Type type,Class<? extends HttpMessageConverter<?>> converter){return true;}
    @Override public Object afterBodyRead(Object body,HttpInputMessage input,MethodParameter parameter,Type type,Class<? extends HttpMessageConverter<?>> converter){var request=((ServletRequestAttributes)RequestContextHolder.currentRequestAttributes()).getRequest();String operation=request.getMethod()+" "+request.getRequestURI();for(var rule:schemas.entrySet())if(operation.matches(rule.getKey())){require(rule.getValue().validate(JSON.valueToTree(body)).isEmpty(),"CONTRACT_INVALID");break;}return body;}
}
