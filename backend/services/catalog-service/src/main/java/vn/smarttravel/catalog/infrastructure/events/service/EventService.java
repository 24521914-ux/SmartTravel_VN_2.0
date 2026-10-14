package vn.smarttravel.catalog.infrastructure.events.service;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.springframework.stereotype.Service;
import vn.smarttravel.catalog.infrastructure.events.repository.EventRepository;
@Service
public class EventService {
    private final EventRepository repo;public EventService(EventRepository repo){this.repo=repo;}
    public boolean accept(JsonNode event){return repo.accept(event);}
    public boolean userAllowed(UUID user){return repo.userAllowed(user);}
}
