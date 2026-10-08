# Giao việc cá nhân và bàn giao service

Điều chỉnh ngày 08/10/2026. A–F là vị trí để điền tên thật; trạng thái hiện tại đều **NOT_STARTED**. Mỗi người chịu trách nhiệm trọn một service, từ database tới API/rule/adapter/test/local run.

| Vị trí | Service | Reviewer đề xuất | Gói | Trạng thái |
|---|---|---|---|---|
| A | Identity | B | [P01-ID](phases/P01-services/identity.md) | NOT_STARTED |
| B | Catalog | C | [P01-CA](phases/P01-services/catalog.md) | NOT_STARTED |
| C | Community | D | [P01-CO](phases/P01-services/community.md) | NOT_STARTED |
| D | Trip | E | [P01-TR](phases/P01-services/trip.md) | NOT_STARTED |
| E | Ingestion | F | [P01-IG](phases/P01-services/ingestion.md) | NOT_STARTED |
| F | Intelligence | A | [P01-IN](phases/P01-services/intelligence.md) | NOT_STARTED |

Reviewer kiểm bàn giao theo contract, không tạo dependency runtime. Catalog/Intelligence rộng hơn nên không giả định cùng ngày xong. Có thể thêm người hỗ trợ trong một service với một owner quyết định. Nếu ít người hơn, một người nhận nhiều gói theo capacity; bản thiết kế vẫn độc lập.

## Phạm vi chỉnh sửa

| Phạm vi dự kiến | Owner |
|---|---|
| `backend/services/<service>/**`, migration/test/local compose | Owner service |
| `backend/contracts/openapi/<service>.yaml` | Producer; consumer bị ảnh hưởng review |
| `backend/contracts/events/**`, fixture chung | Producer đề xuất, consumer review, điều phối chốt revision |
| Root Maven/BOM/CI template, `backend/infra/**`, Gateway | Một người điều phối/platform được chỉ định tại P00 |
| `frontend/**` | Người frontend riêng nếu có; nếu không, P02 chia theo màn/route và file ownership |
| `progress/P01-<mã>.md` | Owner service, chỉ tạo khi bắt đầu triển khai |

Điều phối/platform có thể kiêm một trong A–F; không yêu cầu service hay nhân sự thứ bảy. Root framework thay đổi qua PR riêng; không mỗi người tự nâng stack. Gói frontend có thể làm với stub từ P00 nhưng không là điều kiện bàn giao backend.

## Trạng thái

NOT_STARTED → IN_PROGRESS → READY_FOR_REVIEW → READY_FOR_INTEGRATION → CONNECTED → SYSTEM_VERIFIED → RELEASED.

READY_FOR_INTEGRATION cần code nội bộ hoàn chỉnh và M1–M4 pass với đối tác stub. CONNECTED chỉ ghi tại P02 khi HTTP/event đối tác thật chạy. SYSTEM_VERIFIED chỉ ghi tại P03 sau E2E/security/fault/load/restore. Model quality trên dữ liệu thực có evidence riêng. Không mark xong vì có kế hoạch, placeholder hoặc response hardcode.

## Manifest bàn giao

| Mục | Bằng chứng |
|---|---|
| Revision | Service commit/image + contract revision/checksum |
| Local run | Lệnh build/run/test; dependencies riêng, port/config stub |
| Database | Flyway/seed fixture/schema version, FK/transaction/concurrency report |
| API | OpenAPI/examples/error/auth/scope/pagination/version/idempotency |
| Event | Producer/consumer/schema samples, outbox/inbox/retry/DLQ evidence |
| Security | JWT test JWKS và role matrix; không disable auth để demo |
| Tests | Unit/domain + DB integration + contract + dependency failure |
| Kết nối | Adapter/config, stub đang dùng, runtime/provider thật đích, case cần chạy lại P02 |
| Giới hạn | Dữ liệu synthetic, provider chưa xác minh, chưa benchmark production |

## Quy trình phối hợp

Chốt payload và semantics P00. Thiếu field thì producer/consumer cùng review schema + fixture revision, tiếp tục domain work trên contract đã chốt. Không tự sửa stub cho test pass. Rerun contract checks của gói bị ảnh hưởng mà không cần nối runtime.

P02 đổi endpoint/credential/transport config và xử lý lệch contract được phát hiện, không đợi P02 mới viết nghiệp vụ chính. Theo dõi task/evidence/blocker theo nhịp nhóm; chưa ấn định lịch khi chưa biết capacity.
