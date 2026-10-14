package vn.smarttravel.intelligence.models.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Component;
import vn.smarttravel.intelligence.recommendations.service.BasicService;

@Component
@EnableScheduling
@ConditionalOnProperty(name="intelligence.workers-enabled",havingValue="true",matchIfMissing=true)
public class ModelWorker {
    private final ModelService models;
    private final BasicService basic;
    public ModelWorker(ModelService models,BasicService basic){this.models=models;this.basic=basic;}
    @Scheduled(fixedDelayString="${intelligence.training-poll-ms:1000}") public void train(){models.claim().ifPresent(id->{try{models.train(id);}catch(Exception ex){models.fail(id,"TRAINING_FAILED");}});}
    @Scheduled(fixedDelayString="${intelligence.retention-poll-ms:3600000}") public void retention(){basic.retention();models.cleanup();}
}
