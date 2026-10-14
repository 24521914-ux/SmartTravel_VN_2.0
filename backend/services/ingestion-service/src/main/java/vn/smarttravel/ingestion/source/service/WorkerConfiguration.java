package vn.smarttravel.ingestion.source.service;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
@Configuration
@EnableScheduling
@ConditionalOnProperty(name="ingestion.worker.enabled",havingValue="true")
public class WorkerConfiguration {}
