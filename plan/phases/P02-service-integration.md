# P02 Kết nối sáu service đã hoàn thiện

Trạng thái: **Chưa triển khai**. Chỉ bắt đầu khi **6/6 service đạt READY_FOR_INTEGRATION** và có manifest bàn giao. Phase này dùng implementation đã hoàn thành ở P01, thay stub bằng runtime thật rồi kiểm chứng từng luồng.

Người điều phối quản lý Gateway/infra/config. Owner hai đầu cùng chịu trách nhiệm kết nối, không giao mọi lỗi tích hợp cho một cá nhân duy nhất.

## Gate đầu vào

- [ ] P02-00: Đối chiếu image/source revision, contract checksum, migrations và báo cáo test của cả sáu gói; không có endpoint/consumer placeholder trong scope.
- [ ] P02-01: Dựng môi trường integration có sáu DB/credential riêng, broker/exchange/queue/ACL/DLQ, object storage, secrets, DNS, tracing/log/metrics và health/readiness. Local fixtures không trộn vào dữ liệu production.

## Các gói kết nối

Sau khi hạ tầng integration và Gateway/auth nền tảng sẵn sàng, các owner bắt đầu những liên kết độc lập cùng lúc khi dependency contract cho phép. Bảng dưới đây đánh số để theo dõi task, không yêu cầu nối lần lượt; luồng có phụ thuộc dữ liệu thực tế cần ghi dependency và chạy sau upstream tương ứng.

| Gói | Owner | Kết nối thật | Bằng chứng hoàn thành |
|---|---|---|---|
| P02-02 Auth và Gateway | A + điều phối + 5 owner | JWT issuer/JWKS, audiences/scopes/status, gateway route/CORS/error/trace | Token của Identity đi qua mỗi service; role sai/revoked bị chặn; route không collision |
| P02-03 Catalog reads | B cùng A/C/D/F | Category validation Identity; place/destination validation/batch/snapshot cho Community/Trip/Intelligence | Đọc ID thật; hidden/404/timeout đúng contract; không DB chéo |
| P02-04 Community ↔ Catalog | B/C | Review rating projection, visibility, contribution command/result | Review approve cập nhật rating thật; apply có ack, conflict/retry không double write |
| P02-05 Ingestion ↔ Catalog | B/E | Candidate lookup, upsert command/result, protected fields, source policy | Import thật 2 lần không tăng place; Catalog commit rồi mất ack vẫn retry an toàn |
| P02-06 Intelligence inputs | A/B/C/D/E/F | Preferences/consent, Catalog/rating/interaction snapshots+delta, Ingestion license policy | Bootstrap feature không mất event; source/consent revoked không dùng cho train |
| P02-07 Recommendation ↔ Trip | D/F cùng B | Recommendation API và add-to-trip attribution | Chọn gợi ý tạo item thật, item-added trở lại history đúng một lần; locked không đổi |
| P02-08 Notification và deletion | A cùng 5 owner | Domain notifications, delivery, status/deletion request/ack | Notification nhận đúng user; đủ ack mới complete; thiếu ack được theo dõi |
| P02-09 Frontend/provider | Người frontend + các owner liên quan | UI gọi Gateway thật; email/map/nguồn ngoài dùng sandbox hoặc môi trường được phép | Màn chính chạy API thật, lỗi/pending có UI rõ; ghi provider nào còn sandbox |

Các liên kết trong bảng chỉ bắt đầu **sau khi toàn bộ service đã hoàn thành và qua kiểm thử độc lập tại P01**. Các gói kết nối có thể chạy song song; nếu một gói thật sự cần dữ liệu/endpoint của gói khác, owner ghi dependency cụ thể và vẫn tiếp tục các kiểm tra không bị chặn. Không quay lại trì hoãn việc phát triển nghiệp vụ đến giai đoạn kết nối.

## Công việc kỹ thuật bắt buộc

- [ ] P02-10: Gateway route specificity (ví dụ place detail ở Catalog, place reviews ở Community), private cache/auth forwarding, correlation/trace context và service-to-service credential scope; không truyền token tùy tiện qua mọi service.
- [ ] P02-11: Bootstrap projection bằng snapshot + watermark nguồn, buffer/replay delta và dedup để không mất thay đổi giữa lúc snapshot và subscribe. Catalog/rating/preferences giữ version riêng.
- [ ] P02-12: Nối outbox/inbox transport thật, retry/dead-letter/replay; test duplicate/out-of-order/timeout và crash sau DB commit, kiểm bằng row count/version/trace.
- [ ] P02-13: Env integration không trỏ stub host, test issuer/key hoặc local fixture event source. Các dependency ngoài hệ thống chưa có credential thật phải ghi sandbox/blocked rõ, không tuyên bố production connected.
- [ ] P02-14: Kiểm schema evolution old/new contract; mismatch đưa về đúng owner sửa và review consumer, không vá bằng đọc DB khác hay hardcode response.

## Gate kết thúc

- [ ] Sáu service **CONNECTED**, có trace/evidence từng liên kết trong bảng; không chỉ cùng khởi động là coi đã kết nối.
- [ ] Không còn stub giữa sáu service; API và events liên service hoạt động, principal/ownership không thay đổi khi qua Gateway.
- [ ] Projection/catalog/rating/history và command/result được kiểm row/state với retry; chưa cần đạt performance production nhưng không còn blocker mất dữ liệu/phân quyền.
- [ ] Frontend smoke dùng Gateway thật; platform có alerts/dashboard và runbook replay. Ghi rõ provider ngoài nào cần kiểm sâu P03.

Đầu ra: compose/deployment integration, config không có secret trong Git, route/topic/subscription matrix, traces/smoke reports và manifest CONNECTED. Lỗi thì rollback config/image của kết nối liên quan, giữ audit và checkpoint; không mở P03 khi thiếu flow bắt buộc. [P03 kiểm thử hệ thống](P03-system-verification.md).
