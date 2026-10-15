package vn.smarttravel.intelligence.projections.service;

import java.util.*;
import java.util.function.Function;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.smarttravel.intelligence.recommendations.client.DependencyClient;
import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;

/** Listeners stay subscribed while snapshots merge using each source aggregate version.
 * Older snapshot rows cannot overwrite deltas already delivered by the durable inbox. */
@Service
public class SnapshotRebuild {
    private final DependencyClient dependencies;
    private final ProjectionService projections;
    public SnapshotRebuild(DependencyClient dependencies,ProjectionService projections){this.dependencies=dependencies;this.projections=projections;}
    @Transactional public Map<String,Object> run(UUID actor){
        var sources=new LinkedHashSet<UUID>();
        var catalog=source(actor,"catalog",cursor->{var page=dependencies.snapshot(cursor);for(var row:page.path("items"))if(row.hasNonNull("source_id"))sources.add(UUID.fromString(row.path("source_id").asText()));return page;});
        var ratings=source(actor,"rating",dependencies::ratingsSnapshot);
        var preferences=source(actor,"preferences",dependencies::preferencesSnapshot);
        var interactions=source(actor,"interaction",dependencies::interactionsSnapshot);
        var sourceIds=new ArrayList<>(sources);int policies=0;
        for(int offset=0;offset<sourceIds.size();offset+=100){var rows=dependencies.policies(sourceIds.subList(offset,Math.min(sourceIds.size(),offset+100)));var page=JSON.createObjectNode();page.set("items",JSON.valueToTree(rows));page.put("as_of",java.time.Instant.now().toString());page.put("watermark",rows.stream().mapToLong(row->row.path("source_version").asLong()).max().orElse(1));policies+=projections.rebuild(actor,"policy",page);}

        return Map.of("rebuilt",catalog.get("rebuilt"),"watermark",catalog.get("watermark"),"policies",policies,"sources",Map.of("catalog",catalog,"rating",ratings,"preferences",preferences,"interaction",interactions));
    }
    private Map<String,Object> source(UUID actor,String name,Function<String,JsonNode> fetch){
        String cursor=null;JsonNode watermark=null;int total=0;long deadline=System.nanoTime()+java.time.Duration.ofSeconds(30).toNanos();var seen=new HashSet<String>();
        do{
            require(System.nanoTime()<deadline,"REBUILD_DEADLINE");var snapshot=fetch.apply(cursor);
            var current=snapshot.path("watermark");
            require(current.isIntegralNumber()&&current.asLong()>0 || current.isTextual()&&!current.asText().isBlank(),"INVALID_SNAPSHOT_WATERMARK");
            if(watermark==null)watermark=current;
            require(watermark.equals(current),"SNAPSHOT_WATERMARK_CHANGED");
            total+=projections.rebuild(actor,name,snapshot);
            cursor=snapshot.path("next_cursor").isNull()?null:snapshot.path("next_cursor").asText(null);
            require(cursor==null||seen.add(cursor),"SNAPSHOT_CURSOR_LOOP");
        }while(cursor!=null);
        return Map.of("rebuilt",total,"watermark",watermark.isTextual()?watermark.asText():watermark.asLong());
    }
}
