package vn.smarttravel.trip.itinerary.controller;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.trip.itinerary.service.TripService;
/** Workload-only historical delivery stream with original event IDs for inbox deduplication. */
@RestController
public class InteractionSnapshotController {
    private final TripService store;
    public InteractionSnapshotController(TripService store){this.store=store;}
    @GetMapping("/internal/v1/interactions/snapshot") public Object snapshot(){return store.interactionsSnapshot();}
}
