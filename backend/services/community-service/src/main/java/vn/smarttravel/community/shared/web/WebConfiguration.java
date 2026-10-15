package vn.smarttravel.community.shared.web;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;
@Configuration
public class WebConfiguration implements WebMvcConfigurer {
    private final ScopeInterceptor scopes;public WebConfiguration(ScopeInterceptor scopes){this.scopes=scopes;}
    @Override public void addInterceptors(InterceptorRegistry registry){registry.addInterceptor(scopes);}
}
