package vn.smarttravel.trip.security.config;
import org.springframework.stereotype.Component;
import org.springframework.core.env.Environment;
import org.springframework.beans.factory.InitializingBean;
import java.net.URI;
import java.util.*;
@Component
public class RuntimeGuard implements InitializingBean {
 private final Environment env;
 public RuntimeGuard(Environment env){this.env=env;}
 public void afterPropertiesSet(){Set<String> profiles=Set.of(env.getActiveProfiles());boolean local=profiles.stream().anyMatch(p->Set.of("local","test","p01local","p02-local").contains(p));boolean production=profiles.stream().anyMatch(p->Set.of("prod","production","staging").contains(p));if(local&&production)throw new IllegalStateException("Local or test profiles cannot be mixed with production");if(local)return;for(String key:List.of("security.jwt.jwk-set-uri","trip.catalog.base-url","trip.routing.url")){String endpoint=env.getProperty(key,"");URI uri=URI.create(endpoint);String host=uri.getHost();if(!"https".equals(uri.getScheme())||host==null||Set.of("localhost","127.0.0.1","0.0.0.0","::1").contains(host)||uri.getUserInfo()!=null)throw new IllegalStateException("Production requires an explicit HTTPS dependency endpoint: "+key);}if(env.getProperty("trip.catalog.token","").isBlank())throw new IllegalStateException("Catalog workload credential required");if(env.getProperty("trip.fixtures.enabled",Boolean.class,false))throw new IllegalStateException("Synthetic fixtures cannot run in production");if(!env.getProperty("trip.operator.enabled",Boolean.class,false)&&!env.getProperty("trip.transport.enabled",Boolean.class,false))throw new IllegalStateException("Production transport must be enabled");if(!env.getProperty("trip.operator.enabled",Boolean.class,false)&&env.getProperty("spring.rabbitmq.password","").isBlank())throw new IllegalStateException("Broker workload credential required");}
}
