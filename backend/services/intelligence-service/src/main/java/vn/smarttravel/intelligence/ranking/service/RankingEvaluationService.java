package vn.smarttravel.intelligence.ranking.service;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import vn.smarttravel.intelligence.models.artifacts.ArtifactStore;
import vn.smarttravel.intelligence.projections.service.ProjectionService;
import vn.smarttravel.intelligence.ranking.domain.HardConstraintFilter;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;
import vn.smarttravel.intelligence.ranking.eval.RankingEvaluator;
import vn.smarttravel.intelligence.ranking.eval.RankingEvaluator.*;
import vn.smarttravel.intelligence.ranking.eval.WeightTuner;
import vn.smarttravel.intelligence.ranking.eval.WeightTuner.*;
import vn.smarttravel.intelligence.ranking.repository.RankingDataRepository;

/**
 * Dataset management (create, CSV/JSONL import/export, relevance labeling 0..3, freeze, split validation),
 * async offline Evaluation runs, Baseline vs Challenger comparison, and async Weight Tuning jobs.
 */
@Service
public class RankingEvaluationService {

    private final JdbcTemplate db;
    private final RankingDataRepository data;
    private final RankingServingService serving;
    private final ArtifactStore artifacts;
    private final ProjectionService projections;
    private final RankingBackgroundExecutor bgExecutor;
    private final RankingEvaluator evaluator = new RankingEvaluator();
    private final WeightTuner tuner = new WeightTuner();

    public RankingEvaluationService(
            JdbcTemplate db,
            RankingDataRepository data,
            RankingServingService serving,
            ArtifactStore artifacts,
            ProjectionService projections,
            RankingBackgroundExecutor bgExecutor
    ) {
        this.db = db;
        this.data = data;
        this.serving = serving;
        this.artifacts = artifacts;
        this.projections = projections;
        this.bgExecutor = bgExecutor;
    }

    // ── Datasets & Labeling ──────────────────────────────────────────────────────

    public List<Map<String, Object>> listDatasets() {
        return db.queryForList("""
                SELECT eval_dataset_id, name, dataset_kind, provenance_tier, status,
                       feature_snapshot_ref, cutoff_at, description, query_count, row_count,
                       labeled_count, unlabeled_count, insufficient_info_count,
                       split_counts, checksum, created_at, frozen_at
                FROM intelligence.eval_datasets
                ORDER BY created_at DESC
                LIMIT 50
                """).stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>(r);
            m.put("split_counts", read(r.get("split_counts")));
            return m;
        }).toList();
    }

    @Transactional
    public Map<String, Object> createDataset(UUID actor, JsonNode body) {
        projections.guardActor(actor);
        String name = body.path("name").asText("").trim();
        require(!name.isBlank() && name.length() <= 160, "DATASET_NAME_REQUIRED");
        String kind = body.path("dataset_kind").asText("JUDGMENT").toUpperCase(Locale.ROOT);
        require(Set.of("CATALOG_SNAPSHOT", "JUDGMENT", "INTERACTION").contains(kind), "INVALID_DATASET_KIND");
        String tier = body.path("provenance_tier").asText("HUMAN_LABELED").toUpperCase(Locale.ROOT);
        require(Set.of("SYNTHETIC_FIXTURE", "HUMAN_LABELED", "REAL_BEHAVIORAL").contains(tier), "INVALID_PROVENANCE_TIER");

        String desc = body.path("description").asText("");
        String snapRef = body.path("feature_snapshot_ref").asText("live-projection-" + Instant.now().toEpochMilli());
        Instant cutoff = body.hasNonNull("cutoff_at") ? time(body, "cutoff_at") : Instant.now();

        UUID id = UUID.randomUUID();
        db.update("""
                INSERT INTO intelligence.eval_datasets(
                  eval_dataset_id, name, dataset_kind, provenance_tier, status,
                  feature_snapshot_ref, cutoff_at, description, created_by
                ) VALUES (?,?,?,?,'DRAFT',?,?,?,?)
                """,
                id, name, kind, tier, snapRef, Timestamp.from(cutoff), desc, actor
        );
        projections.audit(actor, "eval_dataset", id.toString(), "CREATE", Map.of("name", name, "tier", tier, "kind", kind));
        return getDatasetDetail(id);
    }

    public Map<String, Object> getDatasetDetail(UUID id) {
        var rows = db.queryForList("SELECT * FROM intelligence.eval_datasets WHERE eval_dataset_id = ?", id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "EVAL_DATASET_NOT_FOUND");
        Map<String, Object> ds = new LinkedHashMap<>(rows.getFirst());
        ds.put("split_counts", read(ds.get("split_counts")));
        var judgments = db.queryForList("""
                SELECT j.judgment_id, j.query_id, j.scenario_group, j.request_payload, j.place_id,
                       j.relevance_grade, j.judgment_status, j.annotator, j.provenance, j.split,
                       j.feature_snapshot_ref, j.judged_at, j.notes,
                       pf.features AS place_features
                FROM intelligence.eval_judgments j
                LEFT JOIN intelligence.place_features pf ON pf.place_id = j.place_id
                WHERE j.eval_dataset_id = ?
                ORDER BY j.split, j.query_id,
                         CASE j.judgment_status WHEN 'UNLABELED' THEN 0 WHEN 'LABELED' THEN 1 ELSE 2 END,
                         j.place_id
                LIMIT 600
                """, id).stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>(r);
            m.put("request_payload", read(r.get("request_payload")));
            Object pfRaw = m.remove("place_features");
            if (pfRaw != null) {
                JsonNode f = read(pfRaw);
                Map<String, Object> placeInfo = new LinkedHashMap<>();
                placeInfo.put("name", f.path("name").asText(""));
                placeInfo.put("name_en", f.hasNonNull("name_en") ? f.path("name_en").asText() : null);
                placeInfo.put("address", f.hasNonNull("address") ? f.path("address").asText() : null);
                placeInfo.put("description", f.hasNonNull("description") ? f.path("description").asText() : null);
                Double priceMin = f.hasNonNull("price_min") ? Double.valueOf(f.path("price_min").asDouble())
                        : (f.hasNonNull("price") ? Double.valueOf(f.path("price").asDouble()) : null);
                placeInfo.put("price_min", priceMin);
                placeInfo.put("price_max", f.hasNonNull("price_max") ? Double.valueOf(f.path("price_max").asDouble()) : null);
                placeInfo.put("currency", f.path("currency").asText("VND"));
                placeInfo.put("rating_avg", f.hasNonNull("rating_avg") ? Double.valueOf(f.path("rating_avg").asDouble()) : null);
                placeInfo.put("rating_count", f.path("rating_count").asLong(f.path("review_count").asLong(0)));
                placeInfo.put("category_ids", f.path("category_ids"));
                placeInfo.put("tags", f.has("tags") ? f.path("tags") : f.path("structured_tags"));
                placeInfo.put("space_type", f.path("space_type").asText("UNKNOWN"));
                placeInfo.put("latitude", f.hasNonNull("latitude") ? Double.valueOf(f.path("latitude").asDouble()) : null);
                placeInfo.put("longitude", f.hasNonNull("longitude") ? Double.valueOf(f.path("longitude").asDouble()) : null);
                m.put("place_info", placeInfo);
            }
            return m;
        }).toList();
        ds.put("judgments", judgments);
        return ds;
    }

    @Transactional
    public Map<String, Object> upsertJudgment(UUID actor, UUID datasetId, JsonNode body) {
        projections.guardActor(actor);
        assertDatasetDraft(datasetId);
        String queryId = body.path("query_id").asText("").trim();
        require(!queryId.isBlank() && queryId.length() <= 120, "QUERY_ID_REQUIRED");
        String scenarioGroup = body.path("scenario_group").asText(queryId).trim();
        UUID placeId = uuid(body, "place_id");

        String status = body.hasNonNull("judgment_status") && !body.path("judgment_status").asText().isBlank()
                ? body.path("judgment_status").asText().trim().toUpperCase(Locale.ROOT)
                : (body.hasNonNull("relevance_grade") ? "LABELED" : "UNLABELED");
        require(Set.of("UNLABELED", "LABELED", "INSUFFICIENT_INFO").contains(status), "INVALID_JUDGMENT_STATUS");

        Integer grade = null;
        if ("LABELED".equals(status)) {
            require(body.hasNonNull("relevance_grade"), "RELEVANCE_GRADE_REQUIRED_FOR_LABELED");
            int g = body.path("relevance_grade").asInt(-1);
            require(g >= 0 && g <= 3, "INVALID_RELEVANCE_GRADE");
            grade = g;
        }

        String split = body.path("split").asText("VALIDATION").toUpperCase(Locale.ROOT);
        require(Set.of("TRAIN", "VALIDATION", "TEST").contains(split), "INVALID_SPLIT");
        String annotator = body.path("annotator").asText("admin:" + actor).trim();
        String provenance = body.path("provenance").asText("UNLABELED".equals(status) ? "HUMAN_REVIEW_PENDING" : "HUMAN_UI").trim();
        String notes = body.has("notes") ? body.path("notes").asText("") : null;

        // Preserve existing request_payload when updating label from UI without resending criteria
        JsonNode reqPayload;
        if (body.has("request_payload") && body.path("request_payload").isObject()) {
            reqPayload = body.path("request_payload");
        } else {
            var existingReq = db.queryForList(
                    "SELECT request_payload, notes FROM intelligence.eval_judgments WHERE eval_dataset_id = ? AND query_id = ? LIMIT 1",
                    datasetId, queryId
            );
            reqPayload = !existingReq.isEmpty()
                    ? read(existingReq.getFirst().get("request_payload"))
                    : read("{\"topN\":10,\"currency\":\"VND\"}");
            if (notes == null && !existingReq.isEmpty() && existingReq.getFirst().get("notes") != null) {
                notes = String.valueOf(existingReq.getFirst().get("notes"));
            }
        }
        if (notes == null) notes = "";

        // Group-split leakage prevention: scenario_group cannot span multiple splits
        enforceScenarioSplitIntegrity(datasetId, scenarioGroup, split);

        db.update("""
                INSERT INTO intelligence.eval_judgments(
                  judgment_id, eval_dataset_id, query_id, scenario_group, request_payload,
                  place_id, relevance_grade, judgment_status, annotator, provenance, split, notes
                ) VALUES (?,?,?,?,?::jsonb,?,?,?,?,?,?,?)
                ON CONFLICT (eval_dataset_id, query_id, place_id) DO UPDATE SET
                  scenario_group = excluded.scenario_group,
                  request_payload = excluded.request_payload,
                  relevance_grade = excluded.relevance_grade,
                  judgment_status = excluded.judgment_status,
                  annotator = excluded.annotator,
                  provenance = excluded.provenance,
                  split = excluded.split,
                  notes = excluded.notes,
                  judged_at = now()
                """,
                UUID.randomUUID(), datasetId, queryId, scenarioGroup, json(reqPayload),
                placeId, grade, status, annotator, provenance, split, notes
        );
        refreshDatasetCounts(datasetId);
        return getDatasetDetail(datasetId);
    }

    /** Import CSV or JSONL judgment rows with line-level schema & leakage validation. */
    @Transactional
    public Map<String, Object> importJudgments(UUID actor, UUID datasetId, JsonNode body) {
        projections.guardActor(actor);
        assertDatasetDraft(datasetId);
        String format = body.path("format").asText("JSONL").toUpperCase(Locale.ROOT);
        String content = body.path("content").asText("");
        require(!content.isBlank(), "IMPORT_CONTENT_REQUIRED");
        require(Set.of("JSONL", "CSV").contains(format), "UNSUPPORTED_IMPORT_FORMAT");

        List<Map<String, Object>> validationErrors = new ArrayList<>();
        List<JsonNode> parsedRows = new ArrayList<>();
        String[] lines = content.replace("\r\n", "\n").split("\n");

        if ("JSONL".equals(format)) {
            for (int i = 0; i < lines.length; i++) {
                String line = lines[i].trim();
                if (line.isEmpty()) continue;
                try {
                    parsedRows.add(read(line));
                } catch (Exception ex) {
                    validationErrors.add(Map.of("line", i + 1, "error", "INVALID_JSON"));
                }
            }
        } else {
            // CSV: query_id,scenario_group,place_id,relevance_grade,split,annotator,provenance,request_json
            int start = 0;
            if (lines.length > 0 && lines[0].toLowerCase(Locale.ROOT).contains("query_id")) start = 1;
            for (int i = start; i < lines.length; i++) {
                String line = lines[i].trim();
                if (line.isEmpty()) continue;
                List<String> cols = splitCsvLine(line);
                if (cols.size() < 5) {
                    validationErrors.add(Map.of("line", i + 1, "error", "EXPECTED_AT_LEAST_5_CSV_COLUMNS"));
                    continue;
                }
                try {
                    Map<String, Object> obj = new LinkedHashMap<>();
                    obj.put("query_id", cols.get(0).trim());
                    obj.put("scenario_group", cols.get(1).trim().isEmpty() ? cols.get(0).trim() : cols.get(1).trim());
                    obj.put("place_id", cols.get(2).trim());
                    obj.put("relevance_grade", Integer.parseInt(cols.get(3).trim()));
                    obj.put("split", cols.get(4).trim().toUpperCase(Locale.ROOT));
                    obj.put("annotator", cols.size() > 5 && !cols.get(5).isBlank() ? cols.get(5).trim() : "csv-import");
                    obj.put("provenance", cols.size() > 6 && !cols.get(6).isBlank() ? cols.get(6).trim() : "CSV_IMPORT");
                    obj.put("request_payload", cols.size() > 7 && !cols.get(7).isBlank() ? read(cols.get(7)) : read("{\"topN\":10,\"currency\":\"VND\"}"));
                    parsedRows.add(JSON.valueToTree(obj));
                } catch (Exception ex) {
                    validationErrors.add(Map.of("line", i + 1, "error", "CSV_PARSE_ERROR: " + ex.getMessage()));
                }
            }
        }

        int imported = 0;
        Map<String, String> batchGroupSplits = new HashMap<>();
        for (int i = 0; i < parsedRows.size(); i++) {
            JsonNode row = parsedRows.get(i);
            try {
                String qid = row.path("query_id").asText("").trim();
                String group = row.path("scenario_group").asText(qid).trim();
                UUID placeId = UUID.fromString(row.path("place_id").asText(""));
                int grade = row.path("relevance_grade").asInt(-1);
                String split = row.path("split").asText("").toUpperCase(Locale.ROOT);
                if (qid.isBlank() || grade < 0 || grade > 3 || !Set.of("TRAIN", "VALIDATION", "TEST").contains(split)) {
                    validationErrors.add(Map.of("row", i + 1, "error", "INVALID_FIELDS_OR_GRADE_OR_SPLIT"));
                    continue;
                }
                if (batchGroupSplits.containsKey(group) && !batchGroupSplits.get(group).equals(split)) {
                    validationErrors.add(Map.of("row", i + 1, "error", "SCENARIO_SPLIT_LEAKAGE:" + group));
                    continue;
                }
                enforceScenarioSplitIntegrity(datasetId, group, split);
                batchGroupSplits.put(group, split);

                JsonNode reqPayload = row.has("request_payload") && row.path("request_payload").isObject()
                        ? row.path("request_payload") : read("{\"topN\":10,\"currency\":\"VND\"}");
                db.update("""
                        INSERT INTO intelligence.eval_judgments(
                          judgment_id, eval_dataset_id, query_id, scenario_group, request_payload,
                          place_id, relevance_grade, annotator, provenance, split, notes
                        ) VALUES (?,?,?,?,?::jsonb,?,?,?,?,?,?)
                        ON CONFLICT (eval_dataset_id, query_id, place_id) DO UPDATE SET
                          relevance_grade = excluded.relevance_grade,
                          request_payload = excluded.request_payload,
                          split = excluded.split,
                          annotator = excluded.annotator,
                          provenance = excluded.provenance,
                          judged_at = now()
                        """,
                        UUID.randomUUID(), datasetId, qid, group, json(reqPayload),
                        placeId, grade,
                        row.path("annotator").asText("import"),
                        row.path("provenance").asText(format + "_IMPORT"),
                        split, row.path("notes").asText("")
                );
                imported++;
            } catch (Exception ex) {
                validationErrors.add(Map.of("row", i + 1, "error", ex.getMessage()));
            }
        }

        refreshDatasetCounts(datasetId);
        projections.audit(actor, "eval_dataset", datasetId.toString(), "IMPORT", Map.of("format", format, "imported", imported, "errors", validationErrors.size()));
        return Map.of("imported", imported, "validation_errors", validationErrors, "dataset", getDatasetDetail(datasetId));
    }

    public Map<String, Object> exportDataset(UUID datasetId, String format) {
        String fmt = format == null ? "JSONL" : format.toUpperCase(Locale.ROOT);
        var rows = db.queryForList("""
                SELECT query_id, scenario_group, place_id, relevance_grade, judgment_status, split, annotator, provenance, request_payload, notes
                FROM intelligence.eval_judgments
                WHERE eval_dataset_id = ?
                ORDER BY split, query_id, place_id
                """, datasetId);
        StringBuilder sb = new StringBuilder();
        if ("CSV".equals(fmt)) {
            sb.append("query_id,scenario_group,place_id,relevance_grade,judgment_status,split,annotator,provenance,request_json\n");
            for (var r : rows) {
                String reqEsc = r.get("request_payload").toString().replace("\"", "\"\"");
                sb.append(String.format("%s,%s,%s,%s,%s,%s,%s,%s,\"%s\"\n",
                        r.get("query_id"), r.get("scenario_group"), r.get("place_id"),
                        r.get("relevance_grade") == null ? "" : r.get("relevance_grade"),
                        r.get("judgment_status"), r.get("split"), r.get("annotator"), r.get("provenance"), reqEsc));
            }
        } else {
            for (var r : rows) {
                Map<String, Object> line = new LinkedHashMap<>();
                line.put("query_id", r.get("query_id"));
                line.put("scenario_group", r.get("scenario_group"));
                line.put("place_id", r.get("place_id").toString());
                line.put("relevance_grade", r.get("relevance_grade"));
                line.put("judgment_status", r.get("judgment_status"));
                line.put("split", r.get("split"));
                line.put("annotator", r.get("annotator"));
                line.put("provenance", r.get("provenance"));
                line.put("notes", r.get("notes"));
                line.put("request_payload", read(r.get("request_payload")));
                sb.append(json(line)).append("\n");
            }
        }
        return Map.of("format", fmt, "row_count", rows.size(), "content", sb.toString());
    }

    @Transactional
    public Map<String, Object> freezeDataset(UUID actor, UUID datasetId) {
        projections.guardActor(actor);
        assertDatasetDraft(datasetId);
        Integer labeledRows = Optional.ofNullable(db.queryForObject(
                "SELECT COUNT(*) FROM intelligence.eval_judgments WHERE eval_dataset_id = ? AND judgment_status = 'LABELED'",
                Integer.class, datasetId
        )).orElse(0);
        require(labeledRows >= 1, "NO_LABELED_ROWS_CANNOT_FREEZE");

        var export = exportDataset(datasetId, "JSONL");
        int rowCount = ((Number) export.get("row_count")).intValue();
        require(rowCount >= 1, "EMPTY_DATASET_CANNOT_FREEZE");

        String content = String.valueOf(export.get("content"));
        String key = artifacts.write(json(Map.of("eval_dataset_id", datasetId, "jsonl", content)));
        String checksum = hash(content);
        db.update("""
                UPDATE intelligence.eval_datasets
                SET status = 'FROZEN', checksum = ?, artifact_object_key = ?, frozen_at = now(), mutation_version = mutation_version + 1
                WHERE eval_dataset_id = ?
                """, checksum, key, datasetId);
        projections.audit(actor, "eval_dataset", datasetId.toString(), "FREEZE",
                Map.of("checksum", checksum, "rows", rowCount, "labeled_rows", labeledRows));
        return getDatasetDetail(datasetId);
    }

    /**
     * Generates an UNLABELED human evaluation dataset from REAL published places in the database.
     * - Leaves every candidate UNLABELED (relevance_grade = NULL) for human annotators to grade 0..3 or mark INSUFFICIENT_INFO.
     * - NEVER uses HybridRankingEngine scores to select candidates or prefill labels (zero model leakage).
     * - Splits distinct scenario_groups strictly into VALIDATION and TEST holdout with zero overlap.
     */
    @Transactional
    public Map<String, Object> createHumanLabelingPool(UUID actor, JsonNode body) {
        projections.guardActor(actor);
        List<PlaceSnapshot> allPlaces = data.loadPublishedPlaceSnapshots(30);
        require(allPlaces.size() >= 8, "NEED_AT_LEAST_8_PUBLISHED_PLACES_FOR_LABELING_POOL");

        String name = (body != null && body.hasNonNull("name") && !body.path("name").asText().isBlank())
                ? body.path("name").asText().trim()
                : "Human Evaluation Benchmark Pool (" + Instant.now().toString().substring(0, 10) + ")";
        int candidatesPerQuery = (body != null && body.has("candidates_per_query"))
                ? Math.max(4, Math.min(12, body.path("candidates_per_query").asInt(8)))
                : 8;

        UUID datasetId = UUID.randomUUID();
        db.update("""
                INSERT INTO intelligence.eval_datasets(
                  eval_dataset_id, name, dataset_kind, provenance_tier, status,
                  feature_snapshot_ref, cutoff_at, description, created_by
                ) VALUES (?,?,'JUDGMENT','HUMAN_LABELED','DRAFT',?,?,?,?)
                """,
                datasetId, name, "real-db-pool-" + Instant.now().toEpochMilli(), Timestamp.from(Instant.now()),
                "Tập ứng viên tạo từ địa điểm thật trong DB, nhãn để trống (UNLABELED) cho người chấm 0–3 hoặc 'Không đủ thông tin'. Không dùng điểm Hybrid để chọn/chấm; tách nhóm VALIDATION/TEST chống rò rỉ.",
                actor
        );

        // Organize real places by destination, category, and price availability (pure catalog facts, zero Hybrid score)
        Map<UUID, List<PlaceSnapshot>> byCat = new LinkedHashMap<>();
        Map<UUID, List<PlaceSnapshot>> byDest = new LinkedHashMap<>();
        List<PlaceSnapshot> withPrice = new ArrayList<>();
        List<PlaceSnapshot> withCoords = new ArrayList<>();
        for (PlaceSnapshot p : allPlaces) {
            for (UUID c : p.categoryIds()) byCat.computeIfAbsent(c, k -> new ArrayList<>()).add(p);
            for (UUID d : p.destinationIds()) byDest.computeIfAbsent(d, k -> new ArrayList<>()).add(p);
            if (p.effectivePrice() != null) withPrice.add(p);
            if (p.latitude() != null && p.longitude() != null) withCoords.add(p);
        }

        List<UUID> topCats = byCat.entrySet().stream()
                .filter(e -> e.getValue().size() >= 4)
                .sorted((a, b) -> Integer.compare(b.getValue().size(), a.getValue().size()))
                .map(Map.Entry::getKey)
                .toList();
        List<UUID> topDests = byDest.entrySet().stream()
                .filter(e -> e.getValue().size() >= 4)
                .sorted((a, b) -> Integer.compare(b.getValue().size(), a.getValue().size()))
                .map(Map.Entry::getKey)
                .toList();

        record QuerySpec(String queryId, String scenarioGroup, String split, String intentNote, Map<String, Object> requestPayload) {}
        List<QuerySpec> specs = new ArrayList<>();

        // 1..4: Category-focused scenarios split across VALIDATION (odd) and TEST (even) with distinct scenario_groups
        String[] softThemes = {"quiet", "heritage", "family", "local_food"};
        for (int i = 0; i < Math.min(4, topCats.size()); i++) {
            UUID catId = topCats.get(i);
            String split = (i % 2 == 0) ? "VALIDATION" : "TEST";
            Map<String, Object> req = new LinkedHashMap<>();
            req.put("topN", 10);
            req.put("currency", "VND");
            req.put("category_ids", List.of(catId.toString()));
            req.put("soft_preferences", Map.of(softThemes[i], 1.0));
            specs.add(new QuerySpec(
                    "q-cat-" + (i + 1),
                    "grp-category-" + (i + 1),
                    split,
                    "[Danh mục + ưu tiên mềm: " + softThemes[i] + "] Tìm địa điểm đúng danh mục và phù hợp trải nghiệm " + softThemes[i],
                    req
            ));
        }

        // 5..8: Destination-scoped scenarios (disjoint destinations across VALIDATION & TEST)
        for (int i = 0; i < Math.min(4, topDests.size()); i++) {
            UUID destId = topDests.get(i);
            String split = (i % 2 == 0) ? "VALIDATION" : "TEST";
            List<PlaceSnapshot> destPlaces = byDest.get(destId);
            PlaceSnapshot anchor = destPlaces.stream().filter(p -> p.latitude() != null && p.longitude() != null).findFirst().orElse(null);
            Map<String, Object> req = new LinkedHashMap<>();
            req.put("topN", 10);
            req.put("currency", "VND");
            req.put("destination_id", destId.toString());
            if (anchor != null) {
                req.put("origin", Map.of("latitude", anchor.latitude(), "longitude", anchor.longitude()));
                req.put("max_distance_km", 15.0);
            }
            specs.add(new QuerySpec(
                    "q-dest-" + (i + 1),
                    "grp-destination-" + (i + 1),
                    split,
                    "[Theo điểm đến + bán kính 15km] Gợi ý địa điểm nổi bật, thuận tiện di chuyển trong điểm đến",
                    req
            ));
        }

        // 9..10: Urban proximity scenarios (Hanoi Hoan Kiem -> VALIDATION; HCMC District 1 -> TEST)
        Map<String, Object> hanoiNear = new LinkedHashMap<>();
        hanoiNear.put("topN", 10);
        hanoiNear.put("currency", "VND");
        hanoiNear.put("origin", Map.of("latitude", 21.0285, "longitude", 105.8542));
        hanoiNear.put("max_distance_km", 10.0);
        hanoiNear.put("soft_preferences", Map.of("space:indoor", 1.0));
        specs.add(new QuerySpec(
                "q-near-hanoi",
                "grp-proximity-hanoi",
                "VALIDATION",
                "[Gần trung tâm Hà Nội <=10km + ưu tiên trong nhà] Chấm mức độ phù hợp vị trí & loại hình",
                hanoiNear
        ));

        Map<String, Object> hcmcNear = new LinkedHashMap<>();
        hcmcNear.put("topN", 10);
        hcmcNear.put("currency", "VND");
        hcmcNear.put("origin", Map.of("latitude", 10.7769, "longitude", 106.7009));
        hcmcNear.put("max_distance_km", 10.0);
        hcmcNear.put("soft_preferences", Map.of("space:outdoor", 1.0));
        specs.add(new QuerySpec(
                "q-near-hcmc",
                "grp-proximity-hcmc",
                "TEST",
                "[Gần trung tâm TP.HCM <=10km + ưu tiên ngoài trời] Chấm mức độ phù hợp vị trí & trải nghiệm",
                hcmcNear
        ));

        // 11..12: Budget-aware scenarios (only if DB has priced places)
        if (withPrice.size() >= 4) {
            Map<String, Object> budgetVal = new LinkedHashMap<>();
            budgetVal.put("topN", 10);
            budgetVal.put("currency", "VND");
            budgetVal.put("max_budget", 200000);
            budgetVal.put("budget_basis", "PER_PERSON");
            budgetVal.put("soft_preferences", Map.of("price:low", 1.0));
            specs.add(new QuerySpec(
                    "q-budget-low",
                    "grp-budget-low",
                    "VALIDATION",
                    "[Ngân sách <= 200.000đ/người, ưu tiên tiết kiệm] Địa điểm có giá rõ ràng, tiết kiệm",
                    budgetVal
            ));

            Map<String, Object> budgetFree = new LinkedHashMap<>();
            budgetFree.put("topN", 10);
            budgetFree.put("currency", "VND");
            budgetFree.put("max_budget", 500000);
            budgetFree.put("budget_basis", "PER_PERSON");
            budgetFree.put("soft_preferences", Map.of("price:free", 1.0));
            specs.add(new QuerySpec(
                    "q-budget-free-pref",
                    "grp-budget-free",
                    "TEST",
                    "[Ngân sách <= 500.000đ/người, ưu tiên miễn phí] Đánh giá sự phù hợp giữa chi phí và giá trị tham quan",
                    budgetFree
            ));
        }

        HardConstraintFilter hardFilter = new HardConstraintFilter();
        RankingConfig baseCfg = data.loadActiveDeployment().config();
        Set<UUID> inactiveCats = data.loadInactiveCategories();

        int insertedQueries = 0;
        for (QuerySpec spec : specs) {
            JsonNode reqNode = JSON.valueToTree(spec.requestPayload());
            RankingRequest parsedReq = serving.parseAndValidateRequest(reqNode, baseCfg);
            var filtered = hardFilter.filter(allPlaces, parsedReq, baseCfg, inactiveCats);
            if (filtered.passed().size() < 2) continue;

            // Unbiased multi-stratum pooling (ZERO Hybrid score used!):
            // Combine canonical-ID stratum, alphabetical stratum, distance stratum (if origin), and review-count stratum.
            List<HardConstraintFilter.FilteredCandidate> poolList = new ArrayList<>(filtered.passed());
            LinkedHashSet<PlaceSnapshot> selected = new LinkedHashSet<>();

            // Stratum 1: distance ascending (if origin present)
            if (parsedReq.hasOrigin()) {
                poolList.stream()
                        .filter(fc -> fc.distanceKm() != null)
                        .sorted(Comparator.comparingDouble(HardConstraintFilter.FilteredCandidate::distanceKm)
                                .thenComparing(fc -> fc.place().placeId().toString()))
                        .limit(Math.max(2, candidatesPerQuery / 2))
                        .forEach(fc -> selected.add(fc.place()));
            }
            // Stratum 2: places with known price / rating (to give annotator rich signals alongside unrated items)
            poolList.stream()
                    .filter(fc -> fc.place().effectivePrice() != null || fc.place().approvedRatingCount() > 0)
                    .sorted(Comparator.comparing(fc -> fc.place().name(), String.CASE_INSENSITIVE_ORDER))
                    .limit(Math.max(2, candidatesPerQuery / 3))
                    .forEach(fc -> selected.add(fc.place()));
            // Stratum 3: evenly strided deterministic sample across all hard-filtered candidates (avoids head-bias)
            int step = Math.max(1, poolList.size() / candidatesPerQuery);
            for (int idx = 0; idx < poolList.size() && selected.size() < candidatesPerQuery; idx += step) {
                selected.add(poolList.get(idx).place());
            }
            // Top up if needed
            for (var fc : poolList) {
                if (selected.size() >= candidatesPerQuery) break;
                selected.add(fc.place());
            }

            if (selected.size() < 2) continue;
            insertedQueries++;
            for (PlaceSnapshot cand : selected) {
                db.update("""
                        INSERT INTO intelligence.eval_judgments(
                          judgment_id, eval_dataset_id, query_id, scenario_group, request_payload,
                          place_id, relevance_grade, judgment_status, annotator, provenance, split, notes
                        ) VALUES (?,?,?,?,?::jsonb,?,NULL,'UNLABELED','pending-human','HUMAN_REVIEW_PENDING',?,?)
                        ON CONFLICT (eval_dataset_id, query_id, place_id) DO NOTHING
                        """,
                        UUID.randomUUID(), datasetId, spec.queryId(), spec.scenarioGroup(),
                        json(spec.requestPayload()), cand.placeId(), spec.split(), spec.intentNote()
                );
            }
        }

        require(insertedQueries >= 2, "INSUFFICIENT_ELIGIBLE_QUERIES_IN_CATALOG");
        refreshDatasetCounts(datasetId);
        projections.audit(actor, "eval_dataset", datasetId.toString(), "CREATE_HUMAN_LABELING_POOL",
                Map.of("queries", insertedQueries, "candidates_per_query", candidatesPerQuery));
        return getDatasetDetail(datasetId);
    }

    /**
     * Seeds a clearly labeled SYNTHETIC_FIXTURE dataset from currently published places
     * ONLY for functional pipeline verification — NEVER usable as production quality evidence.
     */
    @Transactional
    public Map<String, Object> seedSyntheticFixtureDataset(UUID actor) {
        projections.guardActor(actor);
        List<PlaceSnapshot> places = data.loadPublishedPlaceSnapshots(30);
        require(places.size() >= 4, "NEED_AT_LEAST_4_PUBLISHED_PLACES_FOR_FIXTURE");

        UUID datasetId = UUID.randomUUID();
        String name = "Functional Synthetic Fixture (" + Instant.now().toEpochMilli() + ")";
        db.update("""
                INSERT INTO intelligence.eval_datasets(
                  eval_dataset_id, name, dataset_kind, provenance_tier, status,
                  feature_snapshot_ref, cutoff_at, description, created_by
                ) VALUES (?,?,'JUDGMENT','SYNTHETIC_FIXTURE','DRAFT',?,?,?,?)
                """,
                datasetId, name, "projection-snapshot", Timestamp.from(Instant.now()),
                "SYNTHETIC FIXTURE FOR FUNCTIONAL TESTING ONLY. Do NOT treat metrics from this dataset as production quality evidence.",
                actor
        );

        // Group places by category for realistic structured queries (independent of Hybrid scores!)
        Map<UUID, List<PlaceSnapshot>> byCat = new LinkedHashMap<>();
        for (PlaceSnapshot p : places) {
            for (UUID c : p.categoryIds()) {
                byCat.computeIfAbsent(c, k -> new ArrayList<>()).add(p);
            }
        }

        int qIdx = 0;
        for (var entry : byCat.entrySet()) {
            if (entry.getValue().size() < 2) continue;
            qIdx++;
            String split = (qIdx % 2 == 1) ? "VALIDATION" : "TEST";
            String queryId = "fixture-q" + qIdx;
            UUID catId = entry.getKey();
            PlaceSnapshot anchor = entry.getValue().getFirst();
            Map<String, Object> req = new LinkedHashMap<>();
            req.put("topN", 10);
            req.put("currency", "VND");
            req.put("category_ids", List.of(catId.toString()));
            if (anchor.latitude() != null && anchor.longitude() != null) {
                req.put("origin", Map.of("latitude", anchor.latitude(), "longitude", anchor.longitude()));
            }
            List<PlaceSnapshot> pool = entry.getValue().subList(0, Math.min(8, entry.getValue().size()));
            for (int i = 0; i < pool.size(); i++) {
                // Deterministic fixture grades (0..3) based purely on catalog index parity — never from model score
                int grade = i == 0 ? 3 : (i <= 2 ? 2 : (i <= 4 ? 1 : 0));
                db.update("""
                        INSERT INTO intelligence.eval_judgments(
                          judgment_id, eval_dataset_id, query_id, scenario_group, request_payload,
                          place_id, relevance_grade, annotator, provenance, split, notes
                        ) VALUES (?,?,?,?,?::jsonb,?,?,?,?,?,?)
                        ON CONFLICT (eval_dataset_id, query_id, place_id) DO NOTHING
                        """,
                        UUID.randomUUID(), datasetId, queryId, "scenario-" + qIdx, json(req),
                        pool.get(i).placeId(), grade, "synthetic-seeder", "SYNTHETIC_FIXTURE", split,
                        "Functional fixture row (not human judgment)"
                );
            }
            if (qIdx >= 6) break;
        }
        refreshDatasetCounts(datasetId);
        return freezeDataset(actor, datasetId);
    }

    // ── Offline Evaluation Runs ──────────────────────────────────────────────────

    public List<Map<String, Object>> listEvaluationRuns() {
        return db.queryForList("""
                SELECT r.eval_run_id, r.eval_dataset_id, d.name AS dataset_name,
                       r.config_version_id, c.version_tag AS config_version_tag,
                       r.cf_artifact_id, r.baseline_mode, r.split, r.status,
                       r.provenance_tier, r.code_revision, r.dataset_checksum,
                       r.metrics, r.slice_metrics, r.methodology,
                       r.query_evaluated, r.query_excluded, r.judged_coverage,
                       r.error_message, r.started_at, r.ended_at, r.created_at
                FROM intelligence.evaluation_runs r
                JOIN intelligence.eval_datasets d ON d.eval_dataset_id = r.eval_dataset_id
                LEFT JOIN intelligence.ranking_config_versions c ON c.config_version_id = r.config_version_id
                ORDER BY r.created_at DESC
                LIMIT 50
                """).stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>(r);
            m.put("metrics", read(r.get("metrics")));
            m.put("slice_metrics", read(r.get("slice_metrics")));
            m.put("methodology", read(r.get("methodology")));
            return m;
        }).toList();
    }

    @Transactional
    public Map<String, Object> startEvaluation(UUID actor, JsonNode body) {
        projections.guardActor(actor);
        UUID datasetId = uuid(body, "eval_dataset_id");
        var dsRows = db.queryForList("SELECT * FROM intelligence.eval_datasets WHERE eval_dataset_id = ?", datasetId);
        if (dsRows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "EVAL_DATASET_NOT_FOUND");
        var ds = dsRows.getFirst();
        require(!"REVOKED".equals(ds.get("status")), "DATASET_REVOKED");
        require(((Number) ds.get("labeled_count")).intValue() > 0, "NO_LABELED_DATA_FOR_EVALUATION");

        var active = data.loadActiveDeployment();
        UUID configId = body.hasNonNull("config_version_id") && !body.path("config_version_id").asText().isBlank()
                ? uuid(body, "config_version_id") : active.configVersionId();
        UUID cfId = body.hasNonNull("cf_artifact_id") && !body.path("cf_artifact_id").asText().isBlank()
                ? uuid(body, "cf_artifact_id") : active.cfArtifactId();
        BaselineMode mode = BaselineMode.valueOf(body.path("baseline_mode").asText("HYBRID_V1").toUpperCase(Locale.ROOT));
        String split = body.path("split").asText("VALIDATION").toUpperCase(Locale.ROOT);
        require(Set.of("VALIDATION", "TEST", "ALL").contains(split), "INVALID_SPLIT");
        String codeRevision = body.path("code_revision").asText("hybrid-ranking-v1");

        UUID runId = UUID.randomUUID();
        db.update("""
                INSERT INTO intelligence.evaluation_runs(
                  eval_run_id, eval_dataset_id, config_version_id, cf_artifact_id, cohort_snapshot_id,
                  baseline_mode, split, status, provenance_tier, code_revision, dataset_checksum, created_by
                ) VALUES (?,?,?,?,?,?,?,'QUEUED',?,?,?,?)
                """,
                runId, datasetId, configId, cfId, active.cohortSnapshotId(),
                mode.name(), split, ds.get("provenance_tier"), codeRevision, ds.get("checksum"), actor
        );
        projections.audit(actor, "evaluation_run", runId.toString(), "START", Map.of("dataset_id", datasetId, "mode", mode.name(), "split", split));

        bgExecutor.registerAndSubmit(runId, () -> executeEvaluationRun(runId, datasetId, configId, cfId, mode, split));
        return getEvaluationRun(runId);
    }

    private void executeEvaluationRun(UUID runId, UUID datasetId, UUID configId, UUID cfId, BaselineMode mode, String split) {
        try {
            if (db.update("UPDATE intelligence.evaluation_runs SET status='RUNNING', started_at=now() WHERE eval_run_id=? AND status='QUEUED'", runId) == 0) return;

            RankingConfig cfg = data.loadConfig(configId).orElse(RankingConfig.baseline());
            CohortStats cohorts = data.loadLatestCohortStats().orElse(CohortStats.empty());
            CfArtifactData cf = cfId != null ? data.loadCfArtifactSafe(cfId) : null;
            List<PlaceSnapshot> catalog = data.loadPublishedPlaceSnapshots(cfg.popularityWindowDays());
            Set<UUID> inactiveCats = data.loadInactiveCategories();
            List<JudgmentQuery> queries = loadJudgmentQueries(datasetId, split, cfg);

            if (bgExecutor.isCancelled(runId)) {
                db.update("UPDATE intelligence.evaluation_runs SET status='CANCELLED', ended_at=now() WHERE eval_run_id=?", runId);
                return;
            }

            EvaluationReport report = evaluator.evaluate(queries, catalog, cfg, cohorts, cf, mode, inactiveCats);
            db.update("""
                    UPDATE intelligence.evaluation_runs
                    SET status='SUCCEEDED', metrics=?::jsonb, slice_metrics=?::jsonb, methodology=?::jsonb,
                        query_evaluated=?, query_excluded=?, judged_coverage=?, ended_at=now()
                    WHERE eval_run_id=? AND status='RUNNING'
                    """,
                    json(report.metrics()), json(report.slices()), json(report.methodology()),
                    report.queriesEvaluated(), report.queriesExcluded(), report.judgedCoverage(), runId
            );
        } catch (Exception ex) {
            db.update("UPDATE intelligence.evaluation_runs SET status='FAILED', error_message=?, ended_at=now() WHERE eval_run_id=?",
                    ex.getMessage(), runId);
        }
    }

    @Transactional
    public Map<String, Object> cancelEvaluation(UUID actor, UUID runId) {
        projections.guardActor(actor);
        bgExecutor.requestCancel(runId);
        db.update("UPDATE intelligence.evaluation_runs SET status='CANCELLED', ended_at=now() WHERE eval_run_id=? AND status IN ('QUEUED','RUNNING')", runId);
        return getEvaluationRun(runId);
    }

    public Map<String, Object> getEvaluationRun(UUID runId) {
        var rows = db.queryForList("SELECT * FROM intelligence.evaluation_runs WHERE eval_run_id = ?", runId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "EVAL_RUN_NOT_FOUND");
        Map<String, Object> m = new LinkedHashMap<>(rows.getFirst());
        m.put("metrics", read(m.get("metrics")));
        m.put("slice_metrics", read(m.get("slice_metrics")));
        m.put("methodology", read(m.get("methodology")));
        return m;
    }

    // ── Weight Tuning Jobs (Validation Split Only, Never Auto-Activate) ──────────

    public List<Map<String, Object>> listTuningJobs() {
        return db.queryForList("""
                SELECT t.*, d.name AS dataset_name, d.provenance_tier,
                       c.version_tag AS base_config_tag
                FROM intelligence.tuning_jobs t
                JOIN intelligence.eval_datasets d ON d.eval_dataset_id = t.eval_dataset_id
                JOIN intelligence.ranking_config_versions c ON c.config_version_id = t.base_config_version_id
                ORDER BY t.created_at DESC
                LIMIT 30
                """).stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>(r);
            m.put("search_space", read(r.get("search_space")));
            m.put("guardrails", read(r.get("guardrails")));
            return m;
        }).toList();
    }

    public List<Map<String, Object>> listTuningTrials(UUID jobId) {
        return db.queryForList("""
                SELECT trial_id, trial_no, candidate_weights, candidate_sub_params,
                       ndcg_at_10, precision_at_10, hard_violations, catalog_coverage,
                       p95_latency_ms, guardrails_passed, metrics, created_at
                FROM intelligence.tuning_trials
                WHERE tuning_job_id = ?
                ORDER BY trial_no ASC
                """, jobId).stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>(r);
            m.put("candidate_weights", read(r.get("candidate_weights")));
            m.put("candidate_sub_params", read(r.get("candidate_sub_params")));
            m.put("metrics", read(r.get("metrics")));
            return m;
        }).toList();
    }

    @Transactional
    public Map<String, Object> startTuning(UUID actor, JsonNode body) {
        projections.guardActor(actor);
        UUID datasetId = uuid(body, "eval_dataset_id");
        var dsRows = db.queryForList("SELECT * FROM intelligence.eval_datasets WHERE eval_dataset_id = ?", datasetId);
        if (dsRows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "EVAL_DATASET_NOT_FOUND");
        var ds = dsRows.getFirst();
        String tier = String.valueOf(ds.get("provenance_tier"));
        boolean allowDemo = body.path("allow_demo_tuning").asBoolean(false);
        if ("SYNTHETIC_FIXTURE".equals(tier)) {
            require(allowDemo, "SYNTHETIC_DATASET_BLOCKED_FOR_QUALITY_TUNING");
        }
        Integer valLabeledQueries = Optional.ofNullable(db.queryForObject(
                "SELECT COUNT(DISTINCT query_id) FROM intelligence.eval_judgments WHERE eval_dataset_id = ? AND split = 'VALIDATION' AND judgment_status = 'LABELED'",
                Integer.class, datasetId
        )).orElse(0);
        require(valLabeledQueries >= 1, "VALIDATION_SPLIT_REQUIRED_FOR_TUNING");

        var active = data.loadActiveDeployment();
        UUID baseConfigId = body.hasNonNull("base_config_version_id") && !body.path("base_config_version_id").asText().isBlank()
                ? uuid(body, "base_config_version_id") : active.configVersionId();
        Strategy strategy = Strategy.valueOf(body.path("strategy").asText("RANDOM").toUpperCase(Locale.ROOT));
        long seed = body.path("seed").asLong(42L);
        int maxTrials = body.path("max_trials").asInt(20);
        require(maxTrials >= 1 && maxTrials <= 200, "INVALID_MAX_TRIALS");
        String codeRevision = body.path("code_revision").asText("hybrid-tuner-v1");

        Guardrails guardrails = new Guardrails(
                body.path("min_catalog_coverage").asDouble(0.0),
                body.path("max_p95_latency_ms").asDouble(800.0),
                0
        );

        UUID jobId = UUID.randomUUID();
        db.update("""
                INSERT INTO intelligence.tuning_jobs(
                  tuning_job_id, eval_dataset_id, base_config_version_id, split, strategy,
                  seed, max_trials, status, search_space, guardrails, is_demo_run,
                  dataset_checksum, code_revision, created_by
                ) VALUES (?,?,?,'VALIDATION',?,?,?,'QUEUED',?::jsonb,?::jsonb,?,?,?,?)
                """,
                jobId, datasetId, baseConfigId, strategy.name(), seed, maxTrials,
                json(Map.of("outer_weights", List.of("basic", "content", "collaborative", "context"), "sub_params", List.of("rating_m", "distance_scale_km"))),
                json(Map.of("max_hard_violations", 0, "min_catalog_coverage", guardrails.minCatalogCoverage(), "max_p95_latency_ms", guardrails.maxP95LatencyMs())),
                "SYNTHETIC_FIXTURE".equals(tier), ds.get("checksum"), codeRevision, actor
        );
        projections.audit(actor, "tuning_job", jobId.toString(), "START", Map.of("strategy", strategy.name(), "seed", seed, "max_trials", maxTrials));

        bgExecutor.registerAndSubmit(jobId, () -> executeTuningJob(jobId, actor, datasetId, baseConfigId, strategy, seed, maxTrials, guardrails, "SYNTHETIC_FIXTURE".equals(tier)));
        return getTuningJob(jobId);
    }

    private void executeTuningJob(
            UUID jobId, UUID actor, UUID datasetId, UUID baseConfigId,
            Strategy strategy, long seed, int maxTrials, Guardrails guardrails, boolean isDemo
    ) {
        try {
            if (db.update("UPDATE intelligence.tuning_jobs SET status='RUNNING', started_at=now() WHERE tuning_job_id=? AND status='QUEUED'", jobId) == 0) return;

            RankingConfig baseCfg = data.loadConfig(baseConfigId).orElse(RankingConfig.baseline());
            CohortStats cohorts = data.loadLatestCohortStats().orElse(CohortStats.empty());
            CfArtifactData cf = data.loadActiveDeployment().cfArtifact();
            List<PlaceSnapshot> catalog = data.loadPublishedPlaceSnapshots(baseCfg.popularityWindowDays());
            Set<UUID> inactiveCats = data.loadInactiveCategories();
            // Strictly VALIDATION split — holdout TEST is never touched during tuning
            List<JudgmentQuery> valQueries = loadJudgmentQueries(datasetId, "VALIDATION", baseCfg);

            Map<Integer, UUID> trialIds = new HashMap<>();
            TuningResult result = tuner.tune(
                    valQueries, catalog, baseCfg, cohorts, cf, inactiveCats,
                    strategy, seed, maxTrials, guardrails,
                    () -> bgExecutor.isCancelled(jobId),
                    tr -> {
                        UUID tid = UUID.randomUUID();
                        trialIds.put(tr.trialNo(), tid);
                        db.update("""
                                INSERT INTO intelligence.tuning_trials(
                                  trial_id, tuning_job_id, trial_no, candidate_weights, candidate_sub_params,
                                  ndcg_at_10, precision_at_10, hard_violations, catalog_coverage,
                                  p95_latency_ms, guardrails_passed, metrics
                                ) VALUES (?,?,?,?::jsonb,?::jsonb,?,?,?,?,?,?,?::jsonb)
                                """,
                                tid, jobId, tr.trialNo(),
                                json(Map.of("basic", tr.wBasic(), "content", tr.wContent(), "collaborative", tr.wCollaborative(), "context", tr.wContext())),
                                json(Map.of("rating_m", tr.ratingM(), "distance_scale_km", tr.distanceScaleKm())),
                                tr.ndcgAt10(), tr.precisionAt10(), tr.hardViolations(), tr.catalogCoverage(),
                                tr.p95LatencyMs(), tr.guardrailsPassed(), json(tr.metrics())
                        );
                        db.update("UPDATE intelligence.tuning_jobs SET completed_trials = ? WHERE tuning_job_id = ?", tr.trialNo(), jobId);
                    }
            );

            if (result.cancelled()) {
                db.update("UPDATE intelligence.tuning_jobs SET status='CANCELLED', ended_at=now() WHERE tuning_job_id=?", jobId);
                return;
            }

            UUID bestTrialId = null;
            UUID draftConfigId = null;
            if (result.bestTrial() != null) {
                TrialResult best = result.bestTrial();
                bestTrialId = trialIds.get(best.trialNo());
                // Save winning candidate as DRAFT config — NEVER auto-activate
                draftConfigId = UUID.randomUUID();
                String tag = "tuned-" + strategy.name().toLowerCase(Locale.ROOT) + "-" + Instant.now().toEpochMilli();
                Map<String, Object> wMap = Map.of("basic", best.wBasic(), "content", best.wContent(), "collaborative", best.wCollaborative(), "context", best.wContext());
                Map<String, Object> sMap = new LinkedHashMap<>();
                sMap.put("rating_m", best.ratingM());
                sMap.put("rating_weight", baseCfg.ratingWeight());
                sMap.put("popularity_weight", baseCfg.popularityWeight());
                sMap.put("popularity_window_days", baseCfg.popularityWindowDays());
                sMap.put("min_observation_days", baseCfg.minObservationDays());
                sMap.put("cohort_min_sample", baseCfg.cohortMinSample());
                sMap.put("distance_scale_km", best.distanceScaleKm());
                sMap.put("distance_weight", baseCfg.distanceWeight());
                sMap.put("weather_weight", baseCfg.weatherWeight());
                sMap.put("use_max_distance_as_scale", baseCfg.useMaxDistanceAsScale());
                sMap.put("cf_lambda", baseCfg.cfLambda());
                sMap.put("cf_top_k", baseCfg.cfTopK());
                sMap.put("cf_history_limit", baseCfg.cfHistoryLimit());
                sMap.put("cf_favorite_weight", baseCfg.cfFavoriteWeight());
                sMap.put("cf_trip_weight", baseCfg.cfTripWeight());
                sMap.put("candidate_cap", baseCfg.candidateCap());
                sMap.put("top_n_default", baseCfg.topNDefault());
                sMap.put("top_n_max", baseCfg.topNMax());
                sMap.put("diversity_enabled", baseCfg.diversityEnabled());
                sMap.put("unknown_price_policy", baseCfg.unknownPricePolicy().name());

                String csum = hash(json(Map.of("weights", wMap, "sub_params", sMap, "scorer_versions", baseCfg.scorerVersions())));
                db.update("""
                        INSERT INTO intelligence.ranking_config_versions(
                          config_version_id, version_tag, name, description, weights, sub_params,
                          scorer_versions, lifecycle_status, quality_status, config_checksum, created_by
                        ) VALUES (?,?,?,?,?::jsonb,?::jsonb,?::jsonb,'DRAFT','QUALITY_PENDING',?,?)
                        """,
                        draftConfigId, tag,
                        (isDemo ? "[DEMO FIXTURE] " : "") + "Tuned Candidate #" + best.trialNo(),
                        "Generated by tuning job " + jobId + " on VALIDATION split (NDCG@10=" + best.ndcgAt10() + "). Requires holdout review & admin activation.",
                        json(wMap), json(sMap), json(baseCfg.scorerVersions()), csum, actor
                );
            }

            db.update("""
                    UPDATE intelligence.tuning_jobs
                    SET status='SUCCEEDED', best_trial_id=?, best_config_version_id=?, ended_at=now()
                    WHERE tuning_job_id=?
                    """, bestTrialId, draftConfigId, jobId);
        } catch (Exception ex) {
            db.update("UPDATE intelligence.tuning_jobs SET status='FAILED', error_message=?, ended_at=now() WHERE tuning_job_id=?",
                    ex.getMessage(), jobId);
        }
    }

    @Transactional
    public Map<String, Object> cancelTuning(UUID actor, UUID jobId) {
        projections.guardActor(actor);
        bgExecutor.requestCancel(jobId);
        db.update("UPDATE intelligence.tuning_jobs SET status='CANCELLED', ended_at=now() WHERE tuning_job_id=? AND status IN ('QUEUED','RUNNING')", jobId);
        return getTuningJob(jobId);
    }

    public Map<String, Object> getTuningJob(UUID jobId) {
        var rows = db.queryForList("SELECT * FROM intelligence.tuning_jobs WHERE tuning_job_id = ?", jobId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "TUNING_JOB_NOT_FOUND");
        Map<String, Object> m = new LinkedHashMap<>(rows.getFirst());
        m.put("search_space", read(m.get("search_space")));
        m.put("guardrails", read(m.get("guardrails")));
        return m;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    private List<JudgmentQuery> loadJudgmentQueries(UUID datasetId, String split, RankingConfig cfg) {
        // Strictly load ONLY LABELED rows; UNLABELED and INSUFFICIENT_INFO are NEVER coerced to grade 0.
        String sql = "ALL".equals(split)
                ? "SELECT query_id, scenario_group, split, request_payload, place_id, relevance_grade FROM intelligence.eval_judgments WHERE eval_dataset_id = ? AND judgment_status = 'LABELED' AND relevance_grade IS NOT NULL ORDER BY query_id, place_id"
                : "SELECT query_id, scenario_group, split, request_payload, place_id, relevance_grade FROM intelligence.eval_judgments WHERE eval_dataset_id = ? AND split = ? AND judgment_status = 'LABELED' AND relevance_grade IS NOT NULL ORDER BY query_id, place_id";
        var rows = "ALL".equals(split) ? db.queryForList(sql, datasetId) : db.queryForList(sql, datasetId, split);

        Map<String, JsonNode> reqByQuery = new LinkedHashMap<>();
        Map<String, String> groupByQuery = new LinkedHashMap<>();
        Map<String, String> splitByQuery = new LinkedHashMap<>();
        Map<String, Map<UUID, Integer>> gradesByQuery = new LinkedHashMap<>();

        for (var r : rows) {
            String qid = String.valueOf(r.get("query_id"));
            reqByQuery.putIfAbsent(qid, read(r.get("request_payload")));
            groupByQuery.putIfAbsent(qid, String.valueOf(r.get("scenario_group")));
            splitByQuery.putIfAbsent(qid, String.valueOf(r.get("split")));
            gradesByQuery.computeIfAbsent(qid, k -> new LinkedHashMap<>())
                    .put((UUID) r.get("place_id"), ((Number) r.get("relevance_grade")).intValue());
        }

        List<JudgmentQuery> out = new ArrayList<>();
        for (String qid : reqByQuery.keySet()) {
            RankingRequest req = serving.parseAndValidateRequest(reqByQuery.get(qid), cfg);
            out.add(new JudgmentQuery(qid, groupByQuery.get(qid), splitByQuery.get(qid), req, UserContext.guest(), gradesByQuery.get(qid)));
        }
        return out;
    }

    private void assertDatasetDraft(UUID datasetId) {
        var rows = db.queryForList("SELECT status FROM intelligence.eval_datasets WHERE eval_dataset_id = ?", datasetId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "EVAL_DATASET_NOT_FOUND");
        require("DRAFT".equals(rows.getFirst().get("status")), "DATASET_ALREADY_FROZEN_OR_REVOKED");
    }

    private void enforceScenarioSplitIntegrity(UUID datasetId, String scenarioGroup, String split) {
        var existing = db.queryForList(
                "SELECT DISTINCT split FROM intelligence.eval_judgments WHERE eval_dataset_id = ? AND scenario_group = ?",
                datasetId, scenarioGroup
        );
        for (var row : existing) {
            require(split.equals(row.get("split")), "SCENARIO_GROUP_SPLIT_LEAKAGE:" + scenarioGroup);
        }
    }

    private void refreshDatasetCounts(UUID datasetId) {
        var counts = db.queryForMap("""
                SELECT
                  COUNT(*) AS total_rows,
                  COUNT(DISTINCT query_id) AS total_queries,
                  COALESCE(SUM(CASE WHEN judgment_status = 'LABELED' THEN 1 ELSE 0 END), 0) AS labeled_cnt,
                  COALESCE(SUM(CASE WHEN judgment_status = 'UNLABELED' THEN 1 ELSE 0 END), 0) AS unlabeled_cnt,
                  COALESCE(SUM(CASE WHEN judgment_status = 'INSUFFICIENT_INFO' THEN 1 ELSE 0 END), 0) AS insuff_cnt
                FROM intelligence.eval_judgments
                WHERE eval_dataset_id = ?
                """, datasetId);
        var splits = db.queryForList("SELECT split, COUNT(DISTINCT query_id) AS qcnt FROM intelligence.eval_judgments WHERE eval_dataset_id = ? GROUP BY split", datasetId);
        Map<String, Integer> splitMap = new LinkedHashMap<>();
        for (var s : splits) splitMap.put(String.valueOf(s.get("split")), ((Number) s.get("qcnt")).intValue());
        db.update("""
                UPDATE intelligence.eval_datasets
                SET query_count = ?, row_count = ?, labeled_count = ?, unlabeled_count = ?,
                    insufficient_info_count = ?, split_counts = ?::jsonb
                WHERE eval_dataset_id = ?
                """,
                ((Number) counts.get("total_queries")).intValue(),
                ((Number) counts.get("total_rows")).intValue(),
                ((Number) counts.get("labeled_cnt")).intValue(),
                ((Number) counts.get("unlabeled_cnt")).intValue(),
                ((Number) counts.get("insuff_cnt")).intValue(),
                json(splitMap),
                datasetId
        );
    }

    private static List<String> splitCsvLine(String line) {
        List<String> cols = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (ch == '"') {
                if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cur.append('"');
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch == ',' && !inQuotes) {
                cols.add(cur.toString());
                cur.setLength(0);
            } else {
                cur.append(ch);
            }
        }
        cols.add(cur.toString());
        return cols;
    }
}
