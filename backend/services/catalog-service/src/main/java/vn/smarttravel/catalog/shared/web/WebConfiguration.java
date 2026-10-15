package vn.smarttravel.catalog.shared.web;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;
import vn.smarttravel.catalog.shared.security.ScopeInterceptor;
@Configuration
public class WebConfiguration implements WebMvcConfigurer {
    private final ScopeInterceptor scopes;public WebConfiguration(ScopeInterceptor scopes){this.scopes=scopes;}
    @Override public void addInterceptors(InterceptorRegistry registry){registry.addInterceptor(scopes);}
}
