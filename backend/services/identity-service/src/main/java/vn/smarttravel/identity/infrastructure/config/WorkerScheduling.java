package vn.smarttravel.identity.infrastructure.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "identity.workers.enabled", havingValue = "true", matchIfMissing = true)
public class WorkerScheduling {
}
