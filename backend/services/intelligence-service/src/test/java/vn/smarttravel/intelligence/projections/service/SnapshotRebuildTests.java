package vn.smarttravel.intelligence.projections.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.junit.jupiter.api.Test;
import vn.smarttravel.intelligence.recommendations.client.DependencyClient;

class SnapshotRebuildTests {
    final DependencyClient dependencies=mock(DependencyClient.class);
    final ProjectionService projections=mock(ProjectionService.class);
    final UUID actor=UUID.randomUUID();
    JsonNode page(long watermark,String cursor)throws Exception {
        var body=new LinkedHashMap<String,Object>();body.put("items",List.of());body.put("watermark",watermark);body.put("as_of","2026-10-11T00:00:00Z");body.put("next_cursor",cursor);
        return new ObjectMapper().valueToTree(body);
    }
    @Test void walksEverySourceAndKeepsWatermarksSeparate()throws Exception {
        var first=page(7,"next");var second=page(7,null);var ratings=page(4,null);var preferences=page(9,null);
        when(dependencies.snapshot(null)).thenReturn(first);when(dependencies.snapshot("next")).thenReturn(second);
        ((com.fasterxml.jackson.databind.node.ObjectNode)preferences).put("watermark","opaque-identity-fingerprint");
        when(dependencies.ratingsSnapshot(null)).thenReturn(ratings);when(dependencies.preferencesSnapshot(null)).thenReturn(preferences);
        when(dependencies.interactionsSnapshot(null)).thenReturn(page(3,null));
        var result=new SnapshotRebuild(dependencies,projections).run(actor);
        verify(projections).rebuild(actor,"catalog",first);verify(projections).rebuild(actor,"catalog",second);
        verify(projections).rebuild(actor,"rating",ratings);verify(projections).rebuild(actor,"preferences",preferences);
        assertThat(result.get("watermark")).isEqualTo(7L);
        assertThat(result.get("sources").toString()).contains("watermark=4","watermark=opaque-identity-fingerprint");
    }
    @Test void rejectsWatermarkChangeBeforeMergingNextPage()throws Exception {
        when(dependencies.snapshot(null)).thenReturn(page(1,"next"));var changed=page(2,null);when(dependencies.snapshot("next")).thenReturn(changed);
        assertThatThrownBy(()->new SnapshotRebuild(dependencies,projections).run(actor)).hasMessageContaining("SNAPSHOT_WATERMARK_CHANGED");
        verify(projections,never()).rebuild(actor,"catalog",changed);verify(dependencies,never()).ratingsSnapshot(any());
    }
    @Test void stopsRepeatedCursorInsteadOfLooping()throws Exception {
        when(dependencies.snapshot(null)).thenReturn(page(1,"next"));when(dependencies.snapshot("next")).thenReturn(page(1,"next"));
        assertThatThrownBy(()->new SnapshotRebuild(dependencies,projections).run(actor)).hasMessageContaining("SNAPSHOT_CURSOR_LOOP");
    }
}
