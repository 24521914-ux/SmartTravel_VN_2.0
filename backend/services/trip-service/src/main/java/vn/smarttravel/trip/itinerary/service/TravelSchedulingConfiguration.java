package vn.smarttravel.trip.itinerary.service;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/** Routing timeouts must not occupy the scheduler that publishes domain events. */
@Configuration
@EnableScheduling
public class TravelSchedulingConfiguration {
    @Bean("taskScheduler")
    ThreadPoolTaskScheduler domainScheduler() { return scheduler("trip-domain-"); }

    @Bean("dayTravelScheduler")
    ThreadPoolTaskScheduler travelScheduler() { return scheduler("trip-routing-"); }

    private ThreadPoolTaskScheduler scheduler(String prefix) {
        var scheduler=new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix(prefix);
        return scheduler;
    }
}
