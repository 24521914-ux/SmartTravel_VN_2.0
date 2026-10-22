> Ghi chú đồng bộ 21/10/2026: tài liệu giữ checkpoint local trước `15e9004`. Tuyên bố nghiệm thu bên dưới không thay trạng thái **PARTIAL** tại [checklist](../progress_be.md) hoặc chữ ký owner/reviewer.

# Bàn giao P03 không AI — 20/10/2026

Trạng thái: **P03_NON_AI_VERIFIED**. Toàn bộ phần P03 không AI đã hoàn thành và qua gate local. AI được hoãn theo yêu cầu người dùng.

Release: `p03-non-ai-20261020`.
Candidate SHA-256: `e0c26b8e98887c4919be43f6fb9f9c506676622c2a53b4d323648e1ded667a5f`.
Gate UTC: `2026-10-20T08:17:03.571495+00:00`.

## Chức năng và thay đổi

- Giữ hoạt động tài khoản, phân quyền, địa điểm/tìm kiếm, đánh giá/yêu thích/bộ sưu tập, chuyến đi thủ công, bản đồ, doanh nghiệp, quản trị nghiệp vụ và import/replay chỉ cho phép lưu trữ.
- Gateway tắt AI mặc định bằng `AI_ENABLED=false`; tuyến Intelligence trả `503 FEATURE_DEFERRED`. Frontend tắt mặc định bằng `VITE_AI_ENABLED`, ẩn gợi ý, model admin và đăng ký consent AI. Chức năng thu hồi consent đã có vẫn được giữ.
- Catalog bổ sung trường PATCH `status` tùy chọn cho offering, tương thích client cũ; kiểm tra visibility địa điểm và offering trước khi công khai.
- Bổ sung công cụ nghiệm thu không AI, bộ dữ liệu tổng hợp/môi trường riêng, kiểm tra hợp đồng, bảo mật, E2E, resilience, load, restore và vận hành. Gate yêu cầu cùng release, source hash, bằng chứng còn hạn và review; không chấp nhận thiếu số đo.
- CI mặc định chạy phạm vi không AI. Intelligence chỉ được giữ cho xác nhận xóa dữ liệu; không nghiệm thu AI hoặc chạy quality evaluator.

## Kết quả thực đo

| Hạng mục | Kết quả |
|---|---|
| Unit/integration service với dependency thật | 216 test đạt: Identity 61, Catalog 28, Community 30, Trip 41, Ingestion 38, Gateway 18 |
| Công cụ P03 không AI | 94 test: 93 đạt, 1 test symlink bỏ qua do giới hạn Windows |
| Hợp đồng | 183 HTTP operation, 23 event/command schema; 10 response không AI trực tiếp; frontend contract 7 test đạt |
| E2E | 11 nhóm F01/02/03/04/06/07/09/10/11, business, import đạt; correlation ID được kiểm tra trên response |
| Bảo mật | 532 request đạt; authorization, BOLA/IDOR, token reuse/revocation, upload, rate limit, log redaction |
| Resilience | 8 nhóm đạt: broker/downstream outage, crash/retry, duplicate/out-of-order, slow consumer/backpressure, snapshot, rating reconciliation, DLQ replay |
| Trình duyệt | 8 nhóm đạt, 36 responsive case tại 320/390/768/1280px; keyboard/loading/error/empty/map/pending ack; 0 AI request, 0 page error |
| Build | Clean package và Docker image 5 service + Gateway đạt; frontend TypeScript/Vite build đạt |
| Review/vận hành | Review độc lập APPROVE, 0 critical/high mở; image/JAR/source khớp, cảnh báo Gateway đến dashboard local và phục hồi hết cảnh báo |
| Provider | Mailpit và source sandbox HTTP 200; OpenStreetMap HTTPS 200; route fallback hiển thị khoảng cách đường thẳng, thời gian di chuyển chưa xác định |

Load riêng: 10.000 địa điểm, 2.009 tài khoản, 20.001 review, 1.000 chuyến đi; 50 tài khoản đăng nhập riêng biệt. Trong 60 giây có 1.200/1.200 request HTTP 200, 0 lỗi, 0 slot bỏ qua; tốc độ thực tế 19.96 request/giây, p95 tổng 232.16 ms. Tỷ lệ Catalog/Trip/ghi là 62,5%/18,75%/18,75% sau khi loại tải AI.

| Nhóm | Số request | p95 đo được | Ngưỡng |
|---|---:|---:|---:|
| Catalog đọc | 750 | 242.06 ms | ≤500 ms |
| Trip đọc | 225 | 99.13 ms | ≤500 ms |
| Ghi có xác thực | 225 | 71.97 ms | ≤800 ms |

Đã lưu EXPLAIN ANALYZE cho truy vấn nóng Catalog/Trip/Identity cùng số đo pool/backpressure. Độ trễ gồm thời gian chờ từ slot đã lên lịch đến response, không chỉ thời gian HTTP.

Restore: sáu DB có xác thực, so khớp nội dung/schema/index, sáu vùng object có canary không rỗng và checksum; ứng dụng đăng nhập/đọc dữ liệu được sau khôi phục. Thời gian storage + ứng dụng 183.92 giây; tuổi checkpoint 265.50 giây. Đã kiểm tra watermark, retention, xóa dữ liệu, thu hồi license và phát lại hai sự kiện cũ với event ID mới. Trip bảo vệ bằng tombstone bền vững; không yêu cầu giữ bản ghi trạng thái đã xóa.

## AI để làm sau

F05 recommendation/Basic; F08 lịch sử tương tác Intelligence; ML dataset/training/model validation/deployment; quản trị dữ liệu/model AI; AI quality testing và holdout thật đều **DEFERRED_BY_USER**, không đánh dấu PASS. Không có kiểm thử AI quality được thực thi. Chỉ bật lại sau khi tiếp tục task AI và nghiệm thu riêng; hai cờ Gateway/frontend phải được cấu hình nhất quán.

## Bằng chứng và chạy lại

Mọi JSON, log, ảnh browser, backup và credential local nằm dưới `backend/infra/.local/p03/` và được Git ignore. Các file chính: `gate-report.json`, `contracts.json`, `security.json`, `e2e-report.json`, `resilience-report.json`, `mix-load.json`, `restore-report.json`, `frontend-browser/report.json`, `operations-report.json`, `providers-report.json`, `quality-report.json`, `build-ledger.json`, `code-review.json`, `service-evidence/summary.json`, `nonai-diagnostics.json`.

```powershell
python backend/infra/p03_nonai_tests.py
npm --prefix frontend run test:contracts
npm --prefix frontend run build
python backend/infra/p03_gate.py --scope non-ai --release-id p03-non-ai-20261020
```

Gate kiểm tra bằng chứng trong vòng 24 giờ và source hiện hành. Khi source thay đổi hoặc report hết hạn, cần chạy lại các bài nghiệm thu tương ứng; kết quả bàn giao này là checkpoint theo timestamp trên.

Quy trình đầy đủ, cấu hình AI, replay/rollback/restore/xóa dữ liệu và lệnh tạo môi trường: [runbook vận hành](operations/p03-non-ai-runbook.md). Fixture riêng `smarttravel-p03-load-a03e2026` đã dừng, volume được giữ để tái chạy; project restore đích đã được dọn. P02 local đã khởi động lại, bảy ứng dụng ready và không có alarm sau kiểm tra vận hành.

DNS/TLS tới OSM trên máy này không ổn định. Provider probe dùng câu trả lời DNS-over-HTTPS trực tiếp, vẫn xác thực hostname/chứng chỉ TLS bình thường; có ghi resolver/IP/lần thử trong `providers-report.json`. Ba địa chỉ timeout trước khi địa chỉ thứ tư trả HTTP 200; tổng độ trễ probe là 26.194 ms, đã gồm retry. Kết nối browser phụ thuộc DNS/mạng của môi trường triển khai. Script tái chạy tại `backend/infra/.local/p03/operations-with-dns-fallback.py`; không sửa DNS hệ điều hành.

## Giới hạn bàn giao

Đây là nghiệm thu local với dữ liệu tổng hợp. Không xác nhận capacity production, offsite/PITR, quyền dùng dữ liệu thực hoặc credential/provider production. Cảnh báo chỉ gửi dashboard local `local-operator-dashboard`. Không có chứng nhận WCAG toàn diện hay remote CI đã chạy.

`system_verified=false`, `p04_authorized_by_gate=false`, `production_authorized=false`: không tự triển khai P04 hoặc kích hoạt model. Nhánh giữ nguyên `feature/backend-phase02-integration`; repo có thay đổi sẵn và merge đang dang dở nên giữ nguyên index/lịch sử, không checkout/reset/stash, không commit/push/merge trong task này.
