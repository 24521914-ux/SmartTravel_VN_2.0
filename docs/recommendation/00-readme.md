# Master Plan — Unified Modular Recommendation cho SmartTravel VN

Ngày thiết kế: **29/10/2026**. Source baseline: **`89eb8cb0e2d39889bb903cf01e9f31467ae78d23`**, đã đồng bộ `origin/main` trước khảo sát. Nhánh tài liệu: `docs/intelligence-modular-recommendation-plan`.

Đây là bộ **phân tích source, thiết kế và yêu cầu triển khai**, không phải code Recommendation hoặc báo cáo nghiệm thu. Không thay đổi source, database, migration, dependency, cờ AI hay deployment. Tiến độ/trạng thái task, CI evidence và kết nối BE ↔ FE chỉ ở [progress BE](../../progress_be.md) và [progress FE](../../progress_fe.md), theo [AGENTS.md](../../AGENTS.md). Không tích checklist thực hiện trong bộ kế hoạch này.

## 1. Kiến trúc được chọn

**Một Recommendation Pipeline trong Intelligence Service, mỗi module có implementation Rule/ML thay thế được.** Baseline → Content/Collaborative có điều kiện → Weighted/Learned Hybrid → Context chung → Final Validation → Top N/Explanation/Feedback. Auth/consent, hard constraints, final Catalog validation và logging được kiểm soát xuyên suốt, không tạo một pipeline AI độc lập hoặc dùng LLM thay ranking engine.

MVP phải hoàn chỉnh không cần model. Content Rule và Baseline chạy được khi CF chưa có dữ liệu; CF Rule/ML và Learned Hybrid có support/quality gate. ML từng module chỉ được đề xuất activate khi đánh giá trên dữ liệu thực, toàn cấu hình, privacy/compatibility/latency đạt. ML không mặc định tốt hơn Rule. Agent gọi Recommendation API trung lập strategy, không bỏ business rules hoặc tự ghi dữ liệu owner khác.

Source hiện có Basic scoring và lifecycle dataset/training/model, nhưng global Basic/Model switch chưa phải modular pipeline. Vector3 là `[1,rating,popularity]` thủ công; fixture SGD/rating-derived labels chưa chứng minh Content/CF/Hybrid ML chất lượng thực. Source inventory đầy đủ tại [01](01-current-state.md), thiết kế đích tại [02](02-architecture.md).

## 2. Bộ tài liệu13 file

| File | Nội dung và cách sử dụng |
|---|---|
| [00 — Hướng dẫn đọc](00-readme.md) | Phạm vi, nguồn sự thật, traceability và điểm bắt đầu |
| [01 — Khảo sát source](01-current-state.md) | Cấu trúc repository, sáu service, owner/HTTP/broker/DB/worker/CI, bảng readiness và report-vs-source-vs-proposal |
| [02 — Kiến trúc](02-architecture.md) | So sánh cũ/mới, pipeline/dependencies, folder/interface/pseudocode, migration path |
| [03 — Module](03-module-design.md) | Hồ sơ16 module, 15 khía cạnh/module, công thức/weights/numeric examples/missing/fallback/context rules |
| [04 — Dữ liệu](04-data-design.md) | Canonical vs projections, reuse schema, proposed tables/fields/keys/index/retention/consent/sync, historical/lineage |
| [05 — API contracts](05-api-contracts.md) | 14 operation v1,22 operation public/admin v2 đề xuất,1Catalog internal proposal, strict schemas/JSON/auth/errors/timeouts/idempotence/tool contract |
| [06 — Roadmap](06-implementation-roadmap.md) | Sáu giai đoạn, dependencies/parallel ownership/MVP/gates, Agent→Trip flow |
| [07 — ML training/evaluation](07-ml-training-evaluation.md) | Dataset/PIT/temporal split/leakage/metrics,4ML options, registry/worker/governance/quality/rollout |
| [08 — Ranking policy/fallback](08-ranking-policy-fallback.md) | Per-module selector, actual trace, model/config compatibility, immutable bundles/CAS/fallback/rollback/8 tình huống bắt buộc |
| [09 — Test strategy](09-test-strategy.md) | Unit/integration/contract/security/consent/algorithm/ML/load/E2E,40 test requirements và acceptance gates |
| [10 — Ví dụ end-to-end](10-examples.md) | Năm luồng có scores/tính Hybrid/context/Top N/trace/explanation nhất quán; biến thể sparse/revoke/outage |
| [11 — Backlog](11-implementation-backlog.md) |60 task đủ 15 fields/task, dependencies/effort/priority/AC/testing/DoD/risk và demo-vs-real |
| [12 — Rủi ro/quyết định](12-risks-and-decisions.md) |15quyết định,27rủi ro/trade-offs, assumptions và 11 câu hỏi cần xác nhận trước phần code tương ứng |

Đọc để triển khai: 00→01→02→03→04→05→06→11, sau đó mở 07/08/09/10/12 theo task. Lập trình viên không chỉ đọc backlog rồi bỏ contract/hardfield/consent spec. Khi source/main thay đổi, RC-G1-01 phải re-audit các touchpoints trước khi giữ nguyên estimate và đường dẫn.

## 3. Traceability với yêu cầu đầu vào

| Phần trong yêu cầu người dùng | Nơi đáp ứng chính |
|---|---|
|1Khảo sát toàn dự án/báo cáo/hiện trạng |01, references source/plan; báo cáo gốc ngoài repo ghi rõ chưa xác minh |
|2Kiến trúc chính thức, Rule/ML mixed |02,08,10 |
|3Module và 15khía cạnh,5nhóm thuật toán |03; data/API/evaluation chi tiết dẫn04/05/07 |
|4Lộ trình6 giai đoạn |06 và 11 |
|5Code architecture/interfaces/dependencies |02/03/11; tất cả path mới là đề xuất |
|6Data contracts/canonical/retention |04/07 |
|7Recommendation/feedback/admin/train/model/policy APIs |05 |
|8Testing/quality gates/acceptance |09/07 |
|9Ít nhất5ví dụ hoàn chỉnh |10 |
|10Master backlog15 fields/task |11 |
|11Rủi ro/trade-offs |12 |
|12Tài liệu tiếng Việt/Mermaid/JSON/pseudocode/link |Toàn bộ 13 file |
|13Planning-only, không đổi source/DB/deps/model |Phạm vi00, diff chỉ tài liệu/progress status-lines liên quan |
|14Báo cáo tổng kết/các quyết định còn thiếu |00/06/11/12 và bàn giao trong chat |

## 4. Nguồn sự thật và nhãn phát biểu

- **Quyết định người dùng:** Unified Modular Pipeline trong đề bài29/10/2026; giữ phạm vi chỉ tài liệu của lượt làm việc này.
- **Quy định kế hoạch cũ:** `plan/` là yêu cầu/nguồn thứ cấp; không tự suy code đã có từ checklist hoặc tên service. P00 Basic trước ML là quyết định thứ tự hiện hành, các câu mô tả song song cũ cần được đọc trong bối cảnh đó.
- **Đã thấy trong source:** dẫn file/module ở 01, baseline SHA cố định. Đây là static inspection, không tự thành runtime verification.
- **Thiết kế mới:** mọi v2 API, scorer modular, new tables/fields, policy control plane, real ML và Agent proposal ghi như yêu cầu tương lai; không đánh dấu đã tồn tại.
- **Chưa đủ thông tin:** báo cáo Word/PDF gốc/UC09/UC10 không tìm trong repo, inventory dữ liệu thật/purpose policy/hardware/provider chưa có evidence; ghi Q ở 12 và dependency trước code, không tự điền số liệu.

Không coi F09/F10 là UC09/UC10 nếu chưa có báo cáo gốc xác nhận. Không lấy tên “AI”, vector dependency, số endpoint hoặc model status fixture làm bằng chứng đã có personalization ML chất lượng thực. Synthetic-only test chứng minh mechanics và arithmetic, không chứng minh real quality/business uplift.

## 5. Sáu giai đoạn và effort

| Giai đoạn | Sốtask | Effort dự kiến ngày-người |
|---|---:|---:|
| G1 Foundation & Data Readiness |12|23 |
| G2 Rule-based Recommendation |10|17,5 |
| G3 Evaluation & Data Pipeline |10|22,5 |
| G4 Modular ML Integration |10|20,5 |
| G5 Policy, Model Selection & Rollback |10|20 |
| G6 AI Agent & Trip Planner |8|11,5 |
| **Tổng** |**60**|**115** |

Một ngày-người=6 giờ hữu ích, tổng 690 giờ gồm các lựa chọn ML/Context feasibility/experiment và review; không phải ngày lịch hoặc cam kết hoàn thành. MVP G1+G2=40,5 ngày-người trước contingency; data collection/license/owner review có thời gian chờ riêng. Có thể hoãn kỹ thuật Context ML/A-B khi không có nhu cầu/data; đó là recommendation scope, chưa ghi DEFERRED thay người dùng.

## 6. Điểm bắt đầu và dependency quan trọng

Bắt đầu RC-G1-01→RC-G1-02: xác nhận source/report mapping, owner contracts/purpose và baseline data inventory trước refactor. Tái sử dụng projection/outbox/inbox/Basic golden/auth/worker/artifact lifecycle, nhưng tách scoring thuần khỏi DB và thay global model switch bằng policy module. Sau đó hoàn thiện hard fields/consent/candidate/features trước điểm số; Rule MVP trước real ML. G6 có thể song song nâng ML khi G2 API ổn và scope Agent được duyệt.

Dependency ngoài module ranking quan trọng nhất: Catalog hard-field/current validation; Identity purpose/current consent; source training license; Community review/favorite state; Trip attribution/validation; Gateway routing/security/AI flags; real exposure đủ evaluate. Rủi ro lớn: dữ liệu thật ít, consent/license không rõ, stale projection/hardfields, score calibration/fallback signature và feedback leakage. Các lựa chọn chưa chốt có default bảo thủ và task owner tại [12](12-risks-and-decisions.md#4-điểm-cần-xác-nhận-trước-phần-triển-khai-tương-ứng).

## 7. Quy tắc dùng master plan cho các lượt code sau

Yêu cầu theo ID cụ thể, ví dụ “triển khai RC-G1-01 và RC-G1-02 theo master plan, giữ v1 tương thích”. Agent phải đọc AGENTS, pull main fast-forward khi an toàn, branch theo convention, ghi IN_PROGRESS/progress và review touchpoints hiện tại. Mỗi PR chức năng cập nhật progress liên quan; không đổi trạng thái cả giai đoạn vì một task pass. Không commit/push/đóng gate/activate model chỉ dựa vào tài liệu này. Khi contract/hard rule thay đổi, cập nhật tất cả file bị tác động và tests cùng revision, không để hai bản quy tắc khác nhau.
