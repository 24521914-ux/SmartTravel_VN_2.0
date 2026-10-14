package vn.smarttravel.community.shared.web;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
@Component
public class ScopeInterceptor implements HandlerInterceptor {
    private final vn.smarttravel.community.infrastructure.events.service.EventService events;
    public ScopeInterceptor(vn.smarttravel.community.infrastructure.events.service.EventService events){this.events=events;}
    @Override public boolean preHandle(jakarta.servlet.http.HttpServletRequest request,jakarta.servlet.http.HttpServletResponse response,Object handler){
        String path=request.getRequestURI();if(path.startsWith("/actuator")||path.equals("/error"))return true;
        if(request.getMethod().equals("GET")&&(path.startsWith("/api/v1/places/")||path.startsWith("/api/v1/collections/")))return true;
        var auth=SecurityContextHolder.getContext().getAuthentication();if(!(auth instanceof JwtAuthenticationToken token))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        var jwt=token.getToken();if(!path.startsWith("/internal/")&&!events.allowed(jwt.getSubject()))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Account inactive");String status=jwt.getClaimAsString("status");if(status!=null&&!status.equals("ACTIVE"))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Account inactive");
        String required=path.startsWith("/api/v1/admin")?"community:admin":path.startsWith("/internal/v1/ratings")?"community:ratings:read":request.getMethod().equals("GET")?"community:read":"community:write";
        if(path.startsWith("/internal/")&&(jwt.getClaimAsStringList("roles")==null||!jwt.getClaimAsStringList("roles").contains("SERVICE")))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Workload principal required");
        Object scope=jwt.getClaims().get("scope");List<String> scopes=scope instanceof String text?Arrays.asList(text.split(" ")):scope instanceof List<?> values?values.stream().map(Object::toString).toList():List.of();if(!scopes.contains(required))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Missing scope "+required);return true;
    }
}
