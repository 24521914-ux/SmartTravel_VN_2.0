# Phân công nhiều người và bàn giao service

Điều chỉnh ngày 08/10/2026. Đã chốt **hai người**: N1 phụ trách Identity/Catalog/Ingestion, N2 phụ trách Community/Trip/Intelligence; review chéo. A–F là mã gói service, không phải sáu nhân sự. P00 hoàn tất triển khai kỹ thuật và READY_FOR_REVIEW, sáu gói P01 vẫn NOT_STARTED. Theo xác nhận người dùng, N1/N2 đủ để phân công, không cần GitHub username để tiếp tục P00. Mỗi owner chịu trách nhiệm database/API/rule/adapter/test/local run. Các gói độc lập nhưng thực hiện theo capacity hai người; xem [quyết định P00](P00-DECISIONS.md).

| Gói | Service | Owner | Reviewer | Checklist | Trạng thái |
|---|---|---|---|---|---|
| A | Identity | N1 | N2 | [P01-ID](phases/P01-services/identity.md) | NOT_STARTED |
| B | Catalog | N1 | N2 | [P01-CA](phases/P01-services/catalog.md) | NOT_STARTED |
| C | Community | N2 | N1 | [P01-CO](phases/P01-services/community.md) | NOT_STARTED |
| D | Trip | N2 | N1 | [P01-TR](phases/P01-services/trip.md) | NOT_STARTED |
| E | Ingestion | N1 | N2 | [P01-IG](phases/P01-services/ingestion.md) | NOT_STARTED |
| F | Intelligence | N2 | N1 | [P01-IN](phases/P01-services/intelligence.md) | NOT_STARTED |

N1 quản lý Maven/BOM/CI/Gateway/platform và review cấu hình frontend; N2 quản lý frontend shell và review platform. UI được chia theo service tại [quyết định P00](P00-DECISIONS.md). N2 hoàn thiện và nghiệm thu recommendation Basic trước khi triển khai ML; release cuối vẫn bao gồm ML.

Reviewer kiểm bàn giao theo contract, không tạo dependency runtime. Catalog/Intelligence rộng hơn nên không giả định cùng ngày xong. Có thể thêm người hỗ trợ trong một service với một owner quyết định. Nếu ít người hơn, một người nhận nhiều gói theo capacity; bản thiết kế vẫn độc lập.

## Chia chức năng cho nhiều người trong một nhóm

Một owner chịu trách nhiệm scope và bàn giao toàn service; người thực hiện được chia theo chức năng để nhiều người làm đồng thời. Bảng dưới là các luồng có thể giao riêng sau khi chốt schema/interface liên quan, không bắt buộc mỗi ô cần thêm một nhân sự.

| Nhóm | Luồng chức năng 1 | Luồng chức năng 2 | Luồng giao tiếp/kiểm thử |
|---|---|---|---|
| A — Identity | Auth/session/refresh/key rotation (`P01-ID-03`) | Profile/preferences/admin; notification/deletion (`04–05`) | Category client, events/JWKS contracts; security/concurrency (`06–09`) |
| B — Catalog | Geo/place/search (`P01-CA-03–04`) | Hours/media/offering/business (`05–07`) | Import/contribution/rating handlers, events; search/version/claim tests (`08–11`) |
| C — Community | Review/rating/moderation | Favorite/collection/contribution | Catalog adapters, rating/result/visibility events; ownership/concurrency/replay |
| D — Trip | Trip/day/item/reorder/lock | Snapshot/transfer/map provider | Visibility/item-added, recommendation attribution; stale version/timeout/private trip |
| E — Ingestion | Source/connector/raw/normalize | Match/candidate/job/checkpoint | Import command/result/policy; duplicate/crash/replay/protected fields |
| F — Intelligence | Interaction/history/features/Basic | Dataset/training/model/serving | Source/consent/Catalog clients và events; golden cases/fallback/reproducibility |

Schema/migration, cấu hình runtime và file chung của service được owner phân quyền chỉnh sửa cụ thể. Người phụ trách giao tiếp chốt interface với người viết domain từ đầu để adapter và nghiệp vụ có thể làm cùng lúc. QA xây ca kiểm thử cùng người viết chức năng, dùng code/DB thật khi chức năng sẵn sàng; reviewer vẫn kiểm gói bàn giao độc lập.

Frontend chia theo nhóm màn: auth/profile/admin user; catalog/search/business; community/moderation; trip/map; admin ingestion; recommendation/history/admin model. Dùng contract stub từ P00 để làm song song; P02 chuyển sang Gateway thật và P03 kiểm UI toàn luồng. Khi thiếu nhân sự, ghi rõ ai kiêm phần UI và thời điểm thực hiện, không mặc định backend owner làm toàn frontend.

## Phạm vi chỉnh sửa

| Phạm vi dự kiến | Owner |
|---|---|
| `backend/services/<service>/**`, migration/test/local compose | Owner service |
| `backend/contracts/openapi/<service>.yaml` | Producer; consumer bị ảnh hưởng review |
| `backend/contracts/events/**`, fixture chung | Producer đề xuất, consumer review, điều phối chốt revision |
| Root Maven/BOM/CI template, `backend/infra/**`, Gateway | Một người điều phối/platform được chỉ định tại P00 |
| `frontend/**` | Chia người theo màn/route từ P00; phát triển với stub trong P01, kết nối P02 |
| `progress/PHASE_TASK_CHECKLIST.md`, `progress/COMPLETED_WORK_CHECKLIST.md` | Owner cập nhật task/phạm vi của mình; điều phối review thay đổi tổng quan |

Điều phối/platform có thể kiêm một trong A–F; không yêu cầu service hay nhân sự thứ bảy. Root framework thay đổi qua PR riêng; không mỗi người tự nâng stack. Gói frontend có thể làm với stub từ P00 nhưng không là điều kiện bàn giao backend.

## Trạng thái

NOT_STARTED → IN_PROGRESS → READY_FOR_REVIEW → READY_FOR_INTEGRATION → CONNECTED → SYSTEM_VERIFIED → RELEASED.

READY_FOR_INTEGRATION cần code nội bộ hoàn chỉnh, kiểm thử chức năng và M1–M4 pass với đối tác stub. CONNECTED chỉ ghi tại P02 khi HTTP/event đối tác thật chạy. SYSTEM_VERIFIED chỉ ghi tại P03 sau E2E/security/fault/load/restore. Model quality trên dữ liệu thực có evidence riêng. Không mark xong vì có kế hoạch, placeholder hoặc response hardcode.

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

Mỗi gói chức năng có task và branch riêng, ví dụ `codex/catalog-search`; nhiều người cùng service thống nhất ownership của file/migration trước khi sửa. Root Maven/BOM/CI/contracts/infra thay đổi qua người điều phối và PR riêng. Ghép các chức năng trong một service liên tục theo review; kết nối runtime giữa các service chỉ sau gate P01.

Chốt payload và semantics P00. Thiếu field thì producer/consumer cùng review schema + fixture revision, tiếp tục domain work trên contract đã chốt. Không tự sửa stub cho test pass. Rerun contract checks của gói bị ảnh hưởng mà không cần nối runtime.

P02 đổi endpoint/credential/transport config và xử lý lệch contract được phát hiện, không đợi P02 mới viết nghiệp vụ chính. Theo dõi task/evidence/blocker theo nhịp nhóm; chưa ấn định lịch khi chưa biết capacity.

Nếu task bị chặn, ghi rõ input thiếu, người xử lý và các task không phụ thuộc vẫn có thể tiếp tục. Nhóm hoàn thành sớm hỗ trợ review/kiểm thử hoặc nhận task được owner nhóm khác bàn giao. Nếu đổi contract sau khi nhóm đã đạt READY_FOR_INTEGRATION, chạy lại các kiểm tra bị ảnh hưởng và cập nhật manifest trước khi xác nhận gate 6/6.

## Mẫu ghi tiến độ và xác nhận hoàn tất

Dùng duy nhất hai file trong `progress/`: [PHASE_TASK_CHECKLIST.md](../progress/PHASE_TASK_CHECKLIST.md) theo dõi task nhỏ của P00–P04 (bao gồm sáu nhóm P01), và [COMPLETED_WORK_CHECKLIST.md](../progress/COMPLETED_WORK_CHECKLIST.md) ghi nhận artifact/chức năng đã làm được. Không tạo báo cáo riêng theo phase/service. Khi cập nhật task, ghi các trường dưới đây ngay dưới task hoặc liên kết tới artifact/manifest kiểm chứng; chưa đánh dấu pass nếu thiếu evidence.

| Trường | Nội dung phải ghi |
|---|---|
| Task/phạm vi | Mã hiện hành, chức năng/Fxx, đường dẫn checklist gốc nếu dùng mã cũ |
| Phụ trách | Người làm, owner service, reviewer |
| Điều kiện bắt đầu | Contract/schema/fixture revision, input cần có; ghi dependency theo task |
| Tiến độ | Trạng thái, blocker, người xử lý và việc có thể làm tiếp |
| Kiểm thử | Tên case, input/expected/actual, command/report, DB/môi trường và stub/provider đã dùng |
| Phiên bản | Commit/image, schema và contract revision tương ứng với báo cáo |
| Bàn giao | Artifact, cấu hình nối thật, known limits, xác nhận owner/reviewer |

Checkbox của một task chỉ được đánh dấu khi phần thực hiện và ca kiểm nhận thuộc task đã có evidence. `N/A` cần lý do theo release scope; lỗi chưa xử lý giữ blocker. Khi đóng phase, điều phối đối chiếu các manifest theo [hướng dẫn README](phases/README.md), không cộng số task đã xong để thay cho gate.
