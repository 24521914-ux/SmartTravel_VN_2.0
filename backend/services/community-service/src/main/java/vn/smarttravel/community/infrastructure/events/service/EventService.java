package vn.smarttravel.community.infrastructure.events.service;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.smarttravel.community.infrastructure.events.repository.EventRepository;
@Service
public class EventService {
    private final EventRepository repository;
    public EventService(EventRepository repository){this.repository=repository;}
    @Transactional public boolean accept(JsonNode event){return repository.accept(event);}
    public boolean allowed(String user){return repository.allowed(user);}
}
