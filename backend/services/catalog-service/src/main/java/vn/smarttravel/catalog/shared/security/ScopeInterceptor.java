package vn.smarttravel.catalog.shared.security;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
@Component
public class ScopeInterceptor implements HandlerInterceptor {
    private final vn.smarttravel.catalog.infrastructure.events.service.EventService events;
    public ScopeInterceptor(vn.smarttravel.catalog.infrastructure.events.service.EventService events){this.events=events;}
    @Override public boolean preHandle(jakarta.servlet.http.HttpServletRequest request,jakarta.servlet.http.HttpServletResponse response,Object handler){
        String path=request.getRequestURI();if(path.startsWith("/actuator")||path.equals("/error"))return true;
        if(request.getMethod().equals("GET")&&!path.startsWith("/api/v1/admin")&&!path.startsWith("/internal")&&!path.startsWith("/api/v1/businesses")&&!path.startsWith("/api/v1/claims"))return true;
        var auth=SecurityContextHolder.getContext().getAuthentication();if(!(auth instanceof JwtAuthenticationToken token))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        var jwt=token.getToken();String account=jwt.getClaimAsString("status");if(account!=null&&!account.equals("ACTIVE"))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Account inactive");
        try{if(!events.userAllowed(UUID.fromString(jwt.getSubject())))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Account inactive");}catch(IllegalArgumentException error){if(!path.startsWith("/internal/"))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Invalid user principal");}
        String required=path.startsWith("/api/v1/admin")?"catalog:admin":path.startsWith("/internal/v1/places/candidates")?"catalog:candidates:read":path.startsWith("/internal/v1/places")?"catalog:places:read":path.startsWith("/internal")?"catalog:write":request.getMethod().equals("GET")?"catalog:read":"catalog:write";
        if(path.startsWith("/internal/")&&(jwt.getClaimAsStringList("roles")==null||!jwt.getClaimAsStringList("roles").contains("SERVICE")))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Workload principal required");Object scope=jwt.getClaims().get("scope");List<String> scopes=scope instanceof String text?Arrays.asList(text.split(" ")):scope instanceof List<?> values?values.stream().map(Object::toString).toList():List.of();if(!scopes.contains(required))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Missing scope "+required);return true;
    }
}
