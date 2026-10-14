package vn.smarttravel.community.infrastructure.persistence.service;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import vn.smarttravel.community.infrastructure.persistence.repository.FixtureRepository;
@Component @Profile({"local","p01local","test"}) @ConditionalOnProperty(name="community.fixtures.enabled",havingValue="true")
public class LocalFixtures implements ApplicationRunner {
    private final FixtureRepository fixtures;
    public LocalFixtures(FixtureRepository fixtures){this.fixtures=fixtures;}
    @Override public void run(ApplicationArguments arguments){fixtures.seed();}
}
