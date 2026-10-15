package vn.smarttravel.intelligence.projections.controller;

import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.intelligence.projections.service.SnapshotRebuild;

@RestController
public class RebuildController {
    private final SnapshotRebuild rebuild;
    public RebuildController(SnapshotRebuild rebuild){this.rebuild=rebuild;}
    @PostMapping("/internal/v1/features/rebuild") public Object rebuild(Authentication auth){return rebuild.run(UUID.nameUUIDFromBytes(("workload:"+auth.getName()).getBytes(java.nio.charset.StandardCharsets.UTF_8)));}
}
