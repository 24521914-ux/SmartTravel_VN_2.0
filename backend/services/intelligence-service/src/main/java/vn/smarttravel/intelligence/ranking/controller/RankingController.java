package vn.smarttravel.intelligence.ranking.controller;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.intelligence.ranking.repository.RankingDataRepository;
import vn.smarttravel.intelligence.ranking.service.RankingServingService;

/**
 * Public & user-facing Recommendation Ranking endpoints (never exposes raw debug or PII).
 */
@RestController
@RequestMapping("/api/v1/recommendations")
public class RankingController {

    private final RankingServingService serving;
    private final RankingDataRepository data;

    public RankingController(RankingServingService serving, RankingDataRepository data) {
        this.serving = serving;
        this.data = data;
    }

    private static UUID userId(Authentication auth) {
        if (auth == null || auth.getName() == null || auth.getName().isBlank()) return null;
        try { return UUID.fromString(auth.getName()); } catch (Exception e) { return null; }
    }

    @PostMapping("/rank")
    public Map<String, Object> rank(Authentication auth, @RequestBody JsonNode request) {
        return serving.rankPublic(userId(auth), request);
    }

    @GetMapping("/stats")
    public Map<String, Object> stats() {
        return data.loadPublicStats();
    }

    @PostMapping("/impressions")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, Object> impressions(Authentication auth, @RequestBody JsonNode body) {
        return serving.recordImpressions(userId(auth), body);
    }

    @PostMapping("/feedback")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, Object> feedback(Authentication auth, @RequestBody JsonNode body) {
        return serving.recordFeedback(userId(auth), body);
    }
}
