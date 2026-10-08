# Chuyển đổi mô hình và dữ liệu monolith

## Hai điểm xuất phát

**A. Repository hiện tại, chưa có DB nghiệp vụ:** tạo service từ thiết kế, seed taxonomy và dữ liệu mẫu được phép, chạy migration vào sáu database mới; không thực hiện CDC/backfill giả định. Cổng kiểm nhận là 11 nhóm chức năng và integration tests.

**B. Có database monolith bên ngoài repository:** chỉ áp dụng lộ trình dưới sau khi nhận schema dump, số lượng dữ liệu và quyền truy cập được cấp riêng. Bộ kế hoạch chưa kết nối, backup hay thay đổi một database đang chạy nào.

## M01 Khảo sát và đóng băng hợp đồng

- Thu schema dump đã loại credential, inventory 42 bảng thực tế, PK type, enum/status, timezone, FK, index, volume, null/duplicate/orphan và owner_type media.
- Chốt route mapping từ API monolith sang sáu service, caller/frontend và batch jobs. Chốt read/write owner tại từng thời điểm; không có hai owner write cùng aggregate.
- Lập `migration_id_map(source_table,legacy_id,target_uuid)` trong workspace migration riêng nếu ID cũ không phải UUID. Đây là công cụ chuyển đổi, không phải bảng nghiệp vụ dùng chung. UUID đã ổn định giữ nguyên.
- Baseline reconciliation report, backup checkpoint, object count/checksum và diễn tập restore. Không chuyển password_hash sang plaintext; hash legacy chưa hỗ trợ phải có strategy verify-and-rehash hoặc reset có kiểm soát.

## M02 Chuẩn bị đích và backfill

1. Provision DB riêng, credential riêng, extension PostGIS ở Catalog, migrations và seed role/options.
2. Identity: canonical email, resolve duplicate thủ công; role_id→role_code; GUEST không gán; preference scalar→option relation; consent không được tự suy diễn đồng ý. Revoke session legacy nếu không chứng minh tương thích.
3. Catalog: geo hierarchy/version, aliases, destinations/geo, taxonomy/amenities, places và price/currency/location; source `services_events`→offerings/schedules; business/claims/change request, media, place versions. Chưa tin rating_avg nguồn là canonical.
4. Community: reviews/favorite/collection/contribution/media. Review trùng user/place vào quarantine; chỉ hợp nhất theo policy đã chốt. Rebuild APPROVED summary từ review gốc rồi phát snapshot sang Catalog.
5. Trip: owner/destination references, ngày, snapshot place, items và transfer. Map start_time theo timezone nguồn; ghi nhận trường hợp không đủ timezone để sửa trước cutover.
6. Ingestion: sources/license, jobs/raw, mapping nguồn→place. Bản ghi có allow_storage=false không được sao chép payload thô vào đích. Liên kết thiếu canonical place phải quarantine.
7. Intelligence: interaction dedup, source event_id cũ thiếu thì tạo deterministic UUID theo source table+legacy PK. Dataset/model artifact phải kiểm checksum/license/training lineage trước kích hoạt.
8. Audit theo owner entity, notification về Identity, API error log sang kho lưu trữ observability. Các snapshot/derived table được rebuild, không bê nguyên stale cache.

Đối với notification legacy chưa có source_event_id, tạo deterministic UUID từ namespace migration + notification_id; giữ notification_id/read_at/created_at gốc. Raw legacy chưa có schema version hoặc command ID phải có mapping rõ; không gửi lại email hay apply lại import chỉ vì backfill metadata mới.

Thứ tự backfill là thứ tự kiểm tra dữ liệu tham chiếu, không tạo FK xuyên DB. Batch có watermark, resume token, idempotency, count/checksum và báo cáo reject. Không ghi direct vào bảng đích đang được service mới xử lý write trừ migration channel đã kiểm soát.

## M03 Đồng bộ delta và chạy song song đọc

Ưu tiên transactional outbox ở monolith hoặc CDC từ committed log nếu có infrastructure. Không dual-write độc lập monolith DB và service DB trong cùng request. Mỗi aggregate vẫn một writer. Consumer cập nhật đích theo source_version/watermark, dedup có retention đủ thời gian migration.

Shadow-read chỉ trên dữ liệu không nhạy cảm hoặc có quyền; so sánh normalized response cùng snapshot/time watermark. Bỏ trường volatile như traceId, runtime timestamp. Rating/recommendation được đối chiếu semantic thay vì yêu cầu byte-identical nếu thuật toán thay đổi có chủ đích.

## M04 Cổng trước chuyển route

- Row counts và totals theo source partition/business key khớp; 100% bản ghi trong phạm vi được migrate hoặc có quarantine item với người phụ trách và cách xử lý, không im lặng bỏ dữ liệu.
- Không có orphan nội bộ, email collision chưa giải quyết, mất mapping UUID, thứ tự item trùng, date ngoài trip, invalid coordinates/currency hoặc review rating ngoài 1..5.
- API authorization USER/ADMIN/BUSINESS, cross-user access, provider failure, rollback, backup/restore và event replay đã được kiểm chứng.
- Delta lag về mức đã chốt, không còn message lỗi không được xử lý; contract các consumer đang chạy tương thích.
- Chốt write-freeze window nếu cần, danh sách người vận hành, metrics, rollback trigger và liên lạc sự cố. Release có go/no-go dựa trên bằng chứng.

## M05 Cutover từng domain

Chuyển route Identity → Catalog → Community → Trip → Ingestion → Intelligence theo dependency đã chốt, mỗi bước có read/write owner và watermark riêng. Thứ tự có thể đổi khi khảo sát API thực tế. Với cutover ghi: dừng writer cũ của domain, drain delta, xác nhận watermark, bật writer mới, rồi mở traffic. Không chỉ đổi DNS khi còn hai writer.

Canary read trước, canary write chỉ khi routing pin theo aggregate/user và ownership đã được bảo đảm. Giữ compatibility API trong thời gian frontend chuyển đổi. Theo dõi error rate, p95, queue lag, auth failure, count và business metrics tối thiểu 24 giờ là mục tiêu khởi điểm cần điều chỉnh P00.

## M06 Rollback thực tế

Trước khi service mới nhận write, có thể trả route về monolith tại checkpoint. Sau khi đã nhận write mới, **không được chỉ trả route về DB cũ**: dừng writer mới, drain outbox, export/replay write phát sinh về monolith bằng mapping đã diễn tập, reconcile rồi mới mở writer cũ. Nếu không có reverse pipeline an toàn, dùng forward-fix và maintenance window đã chuẩn bị thay cho rollback gây mất dữ liệu.

Migration database theo expand/contract để service binary cũ còn tương thích trong rollout. Xóa column/table cũ chỉ sau stability window, backup và hết reader/writer phụ thuộc; archive thay vì DROP trong ngày đầu. Không rollback migration bằng cách DROP dữ liệu mới.

## Đầu ra cần lưu ở lần triển khai

Inventory, source/target mapping, data-quality report, checkpoint, checksum/batch report, quarantine, consumer watermark, compatibility matrix, cutover log và restore evidence. Mỗi loại có owner, timestamp và migration run ID. Không lưu dump chứa PII hoặc secret vào Git.
