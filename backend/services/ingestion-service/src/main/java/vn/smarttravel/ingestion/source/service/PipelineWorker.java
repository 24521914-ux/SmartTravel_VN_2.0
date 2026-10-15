package vn.smarttravel.ingestion.source.service;
import vn.smarttravel.ingestion.source.repository.PipelineStore;
import vn.smarttravel.ingestion.source.client.*;
import vn.smarttravel.ingestion.source.service.*;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class PipelineWorker {
    private final PipelineService service;
    private final boolean enabled;
    public PipelineWorker(PipelineService service,@Value("${ingestion.worker.enabled:false}")boolean enabled){this.service=service;this.enabled=enabled;}
    @Scheduled(fixedDelayString="${ingestion.worker.poll-ms:1000}") public void tick(){if(!enabled)return;for(var id:service.pendingJobs())try{service.process(id);}catch(Exception e){service.markFetchFailure(id);}}
}
