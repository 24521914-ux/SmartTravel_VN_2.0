package vn.smarttravel.community.security.config;
import java.util.*;
import java.net.URI;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
@Configuration
public class RuntimeGuard {
    @Bean SmartInitializingSingleton rejectMixedRuntime(Environment env){return ()->{var profiles=Set.of(env.getActiveProfiles());boolean production=profiles.contains("prod")||profiles.contains("production")||profiles.contains("staging");boolean fixture=profiles.contains("test")||profiles.contains("p01local")||profiles.contains("local")||profiles.contains("p02-local");if(production&&(fixture||env.getProperty("community.fixtures.enabled",Boolean.class,false)))throw new IllegalStateException("Production/staging cannot enable fixture profiles");if(!fixture){for(String key:List.of("security.jwt.issuer","security.jwt.jwk-set-uri","catalog.base-url","community.media.scanner-url")){String value=env.getProperty(key,"");URI uri;try{uri=URI.create(value);}catch(Exception e){throw new IllegalStateException("Invalid partner origin");}if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getFragment()!=null||uri.getHost().equals("localhost")||uri.getHost().equals("127.0.0.1"))throw new IllegalStateException("Explicit authenticated HTTPS partner configuration required: "+key);}if(env.getProperty("catalog.service-token","").isBlank()&&!vn.smarttravel.community.shared.http.WorkloadTokens.deployable(env))throw new IllegalStateException("Catalog workload token required");}};}
}
