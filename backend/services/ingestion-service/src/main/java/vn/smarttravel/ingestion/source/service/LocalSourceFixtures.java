package vn.smarttravel.ingestion.source.service;

import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Profile;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.transaction.annotation.Transactional;
import vn.smarttravel.ingestion.source.repository.LocalFixturesRepository;

@Component
@Profile("local")
@ConditionalOnProperty(name="ingestion.fixtures.enabled",havingValue="true")
public class LocalSourceFixtures implements ApplicationRunner {
    private final LocalFixturesRepository fixtures;
    private final String uri;
    public LocalSourceFixtures(LocalFixturesRepository fixtures,@Value("${ingestion.fixture.uri:http://127.0.0.1:8305/source}")String uri){this.fixtures=fixtures;this.uri=uri;}
    @Transactional public void run(ApplicationArguments args){fixtures.seed(uri);}
}
