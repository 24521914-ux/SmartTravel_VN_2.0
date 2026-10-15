package vn.smarttravel.trip.itinerary.service;

import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Profile;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.transaction.annotation.Transactional;
import vn.smarttravel.trip.itinerary.repository.LocalFixturesRepository;

@Component
@Profile("local")
@ConditionalOnProperty(name="trip.fixtures.enabled",havingValue="true")
public class LocalItineraryFixtures implements ApplicationRunner {
    private final LocalFixturesRepository fixtures;
    public LocalItineraryFixtures(LocalFixturesRepository fixtures){this.fixtures=fixtures;}
    @Transactional public void run(ApplicationArguments args){fixtures.seed();}
}
