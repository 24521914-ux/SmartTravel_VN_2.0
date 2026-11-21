package vn.smarttravel.intelligence.ranking.domain;

import java.util.*;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;

/**
 * Template-based, strictly factual explanation builder (no LLM).
 * Never asserts "open now", "free", or "users like you" unless verified by data.
 */
public final class ExplanationBuilder {

    public record Explanation(
            List<String> reasonCodes,
            List<String> reasonsVi,
            List<String> reasonsEn,
            String summaryVi,
            String summaryEn
    ) {}

    private static final Map<String, String[]> TAG_LABELS = Map.ofEntries(
            Map.entry("sea_view", new String[]{"Phù hợp ưu tiên view biển", "Matches sea view preference"}),
            Map.entry("mountain", new String[]{"Phù hợp ưu tiên núi đồi", "Matches mountain & hill preference"}),
            Map.entry("quiet", new String[]{"Không gian yên tĩnh theo yêu cầu", "Matches quiet atmosphere preference"}),
            Map.entry("sunset", new String[]{"Phù hợp ưu tiên ngắm hoàng hôn", "Matches sunset spot preference"}),
            Map.entry("street_food", new String[]{"Phù hợp ưu tiên ẩm thực địa phương", "Matches local food preference"}),
            Map.entry("heritage", new String[]{"Phù hợp ưu tiên di sản & kiến trúc", "Matches heritage & architecture preference"}),
            Map.entry("companion:solo", new String[]{"Phù hợp đi một mình", "Suitable for solo travel"}),
            Map.entry("companion:couple", new String[]{"Phù hợp cặp đôi", "Suitable for couples"}),
            Map.entry("companion:family", new String[]{"Phù hợp gia đình", "Suitable for families"}),
            Map.entry("companion:friends", new String[]{"Phù hợp nhóm bạn", "Suitable for groups of friends"})
    );

    public Explanation build(
            PlaceSnapshot place,
            Double distanceKm,
            OpeningStatus openingStatus,
            HybridBreakdown breakdown
    ) {
        List<String> codes = new ArrayList<>();
        List<String> vi = new ArrayList<>();
        List<String> en = new ArrayList<>();

        if (breakdown.fallbackUsed()) {
            codes.add("PUBLIC_DISCOVERY_FALLBACK");
            vi.add("Gợi ý khám phá công khai theo dữ liệu hiện có");
            en.add("Public discovery listing based on available catalog data");
        } else {
            // 1. Content matches (strictly verified attributes)
            if (breakdown.content().available()) {
                for (String code : breakdown.content().reasonCodes()) {
                    if (codes.size() >= 3) break;
                    if (code.startsWith("CONTENT_MATCH_TAG:")) {
                        String tag = code.substring("CONTENT_MATCH_TAG:".length());
                        String[] labels = TAG_LABELS.get(tag);
                        codes.add(code);
                        if (labels != null) {
                            vi.add(labels[0]);
                            en.add(labels[1]);
                        } else {
                            vi.add("Khớp thuộc tính ưu tiên (" + tag + ")");
                            en.add("Matches preferred attribute (" + tag + ")");
                        }
                    } else if (code.equals("CONTENT_MATCH_PROFILE_CATEGORY")) {
                        codes.add(code);
                        vi.add("Khớp danh mục trong hồ sơ sở thích của bạn");
                        en.add("Matches a category in your saved preferences");
                    } else if (code.equals("CONTENT_MATCH_INDOOR")) {
                        codes.add(code);
                        vi.add("Không gian trong nhà đã xác minh");
                        en.add("Verified indoor venue");
                    } else if (code.equals("CONTENT_MATCH_OUTDOOR")) {
                        codes.add(code);
                        vi.add("Không gian ngoài trời đã xác minh");
                        en.add("Verified outdoor venue");
                    } else if (code.equals("CONTENT_MATCH_FREE") && place.effectivePrice() != null && place.effectivePrice() == 0.0) {
                        codes.add(code);
                        vi.add("Xác nhận miễn phí vào cửa");
                        en.add("Verified free entry");
                    } else if (code.equals("CONTENT_MATCH_LOW_PRICE") && place.effectivePrice() != null) {
                        codes.add(code);
                        vi.add("Mức giá tham khảo thấp");
                        en.add("Lower reference price");
                    }
                }
            }

            // 2. Context signals (straight-line distance only — never called travel time)
            if (breakdown.context().available() && distanceKm != null && codes.size() < 3) {
                for (String code : breakdown.context().reasonCodes()) {
                    if (code.equals("NEAR_ORIGIN") || code.equals("WITHIN_DISTANCE_SCALE")) {
                        codes.add(code);
                        String distText = distanceKm < 1.0
                                ? Math.round(distanceKm * 1000) + " m"
                                : String.format(Locale.US, "%.1f km", distanceKm);
                        vi.add("Cách điểm chọn khoảng " + distText + " (đường chim bay)");
                        en.add("Approx. " + distText + " away (straight-line)");
                        break;
                    }
                    if (code.equals("WEATHER_INDOOR_SUITABLE")) {
                        codes.add(code);
                        vi.add("Không gian trong nhà phù hợp thời tiết hiện tại");
                        en.add("Indoor setting suitable for current weather");
                    }
                }
            }

            // 3. Basic signals (approved reviews / recent community popularity)
            if (breakdown.basic().available() && codes.size() < 3) {
                for (String code : breakdown.basic().reasonCodes()) {
                    if (code.equals("HIGH_APPROVED_RATING") && place.approvedRatingAvg() != null && place.approvedRatingCount() > 0) {
                        codes.add(code);
                        vi.add(String.format(Locale.US, "Đánh giá đã duyệt %.1f★ (%d lượt)", place.approvedRatingAvg(), place.approvedRatingCount()));
                        en.add(String.format(Locale.US, "Approved rating %.1f★ (%d reviews)", place.approvedRatingAvg(), place.approvedRatingCount()));
                    } else if (code.equals("POPULAR_RECENTLY") && place.uniquePopularityUsers30d() > 0 && codes.size() < 3) {
                        codes.add(code);
                        vi.add("Được cộng đồng lưu nhiều trong 30 ngày qua");
                        en.add("Frequently saved by travelers in the past 30 days");
                    }
                }
            }

            // 4. Collaborative signal (only when CF truly contributed with verified co-interactions)
            if (breakdown.collaborative().available()
                    && breakdown.collaborative().reasonCodes().contains("CF_CO_INTERACTED_WITH_HISTORY")
                    && codes.size() < 3) {
                codes.add("CF_CO_INTERACTED_WITH_HISTORY");
                vi.add("Thường được lưu cùng với các điểm trong lịch sử của bạn");
                en.add("Frequently saved alongside places in your history");
            }
        }

        // 5. Verified opening fact (ONLY if explicitly verified OPEN — never for UNKNOWN)
        if (openingStatus == OpeningStatus.OPEN && codes.size() < 3) {
            codes.add("VERIFIED_OPEN_FOR_SLOT");
            vi.add("Có khung giờ mở cửa khớp thời điểm chọn");
            en.add("Listed opening hours match selected visit slot");
        }

        // 6. Honest default if no strong individual signal fired (never fabricate claims)
        if (vi.isEmpty()) {
            codes.add("MATCHES_FILTER_CRITERIA");
            vi.add("Đáp ứng đầy đủ tiêu chí lọc hiện tại");
            en.add("Matches your active filter criteria");
        }

        String summaryVi = String.join(" · ", vi.subList(0, Math.min(2, vi.size())));
        String summaryEn = String.join(" · ", en.subList(0, Math.min(2, en.size())));
        return new Explanation(List.copyOf(codes), List.copyOf(vi), List.copyOf(en), summaryVi, summaryEn);
    }
}
