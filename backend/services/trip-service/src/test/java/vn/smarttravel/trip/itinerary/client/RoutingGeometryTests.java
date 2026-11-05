package vn.smarttravel.trip.itinerary.client;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class RoutingGeometryTests {
    @Test void acceptsOnlyBoundedProviderGeoJsonLineStrings() {
        assertThat(RoutingAdapter.validGeometry(Map.of("type","LineString","coordinates",List.of(List.of(106.6,10.7),List.of(106.7,10.8))))).isTrue();
        assertThat(RoutingAdapter.validGeometry(null)).isFalse();
        assertThat(RoutingAdapter.validGeometry("encodedPolyline")).isFalse();
        assertThat(RoutingAdapter.validGeometry(Map.of("type","Point","coordinates",List.of(106,10)))).isFalse();
        for(Object coordinates:List.of(List.of(List.of(181,10),List.of(106,10)),List.of(List.of(106,91),List.of(106,10)),List.of(List.of(Double.NaN,10),List.of(106,10)),Collections.nCopies(10001,List.of(106,10)),List.of(List.of(106,10))))
            assertThat(RoutingAdapter.validGeometry(Map.of("type","LineString","coordinates",coordinates))).isFalse();
    }
}
