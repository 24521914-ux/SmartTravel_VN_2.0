# P01 — database và runtime độc lập

Sáu service đã có domain API, HTTP adapters và transport độc lập. Evidence hiện hành và
trạng thái review/handoff tập trung tại `PROGRESS.md`.
Các mục baseline M1 bên dưới là lịch sử triển khai ngày10/10; mục hoàn thiện cuối tài liệu
và README từng service ghi commands/config hiện hành. Smoke unknown-route chỉ kiểm DB/security;
domain, frozen provider và broker fault gates dùng các runners riêng.

## Chạy từ checkout sạch

Yêu cầu Java 21, Docker Linux engine, Python >=3.12. Từ root repo:

```bash
python -m pip install -r backend/platform/requirements-validation.txt
./backend/mvnw -B -f backend/services/pom.xml clean verify
python backend/infra/p01.py up
python backend/infra/p01.py smoke
python backend/infra/p01.py verify
```

`clean` loại bỏ migration/class cũ trong `target` trước khi đóng jar; không sửa source/data. Windows dùng Git Bash hoặc Maven Wrapper `.cmd`.

Chỉ một service, không cần năm DB/app khác:

```bash
./backend/mvnw -B -f backend/services/pom.xml -pl trip-service -am clean verify
python backend/infra/p01.py up --service trip
python backend/infra/p01.py smoke --service trip
python backend/infra/p01.py verify --service trip
```

Smoke khởi động từng app với DB runtime role và test JWKS ephemeral, kiểm health/auth/error rồi dừng app/issuer. PostgreSQL Flyway chạy qua connection migrator riêng. Chạy smoke lần hai kiểm validate/checksum/restart; Community migration job kiểm checksum, validators/indexes mọi lần gọi. `verify` dùng DB thật, fixture nằm trong transaction và rollback; không thêm tài khoản đăng nhập mẫu hoặc dữ liệu production.

Identity: `up --service identity` khởi động cả DB + Mailpit (SMTP51025/UI58025, chỉ loopback).
Auth issuer/login thật dùng `python backend/services/identity-service/run-local.py --fixtures`, không dùng test JWKS của legacy smoke.
Migrations Identity hiện V1–V5/20 tables, seed user là opt-in local guard, không nằm trong production Flyway.
DB tests disposable, live jar/image mail/provider tests và secret/key runbook: [Identity README](../services/identity-service/README.md).

Full `verify` cần cả năm PostgreSQL để kiểm credential không dùng được ở DB khác (cả username sai và username runtime thật của DB đích với password nguồn). Single-service mode không ghi nhận cross-container test đã pass. Chưa kiểm outbox worker/broker/DLQ/HTTP domain handlers.

## Secrets và quyền

Lần đầu runner tạo `backend/infra/.env.local` đã ignore, password ngẫu nhiên riêng từng service/role. Không in password, không commit hoặc dùng cho production. Trên Windows dùng ACL phù hợp cho máy local; file không có khả năng bảo vệ khỏi tài khoản quản trị/Docker daemon. Production cần secret manager, TLS, key rotation và network policies, không dùng Compose này.

| Service | Host port | DB | Runtime / migration user |
|---|---|---|---|
| Catalog | 56432 | catalog_db | catalog_runtime / catalog_migrator |
| Identity | 56434 | identity_db | identity_runtime / identity_migrator |
| Trip | 56435 | trip_db | trip_runtime / trip_migrator |
| Ingestion | 56436 | ingestion_db | ingestion_runtime / ingestion_migrator |
| Intelligence | 56437 | intelligence_db | intelligence_runtime / intelligence_migrator |
| Community | 57117 | community_db | community_runtime / community_migrator |

Ports bind loopback. P01 dùng project/volumes riêng; không reuse/drop dữ liệu P00. PostGIS chỉ Catalog, pgvector được platform provision nhưng chưa có model/index/pipeline ML.

Relational app env:

- `DB_URL=jdbc:postgresql://localhost:<port>/<service>_db`
- `DB_USER=<service>_runtime`, `DB_PASSWORD` lấy từ secret local của service.
- `DB_MIGRATION_USER=<service>_migrator`, `DB_MIGRATION_PASSWORD` riêng.
- `JWT_JWKS_URI`, `JWT_ISSUER`, `JWT_AUDIENCE` như P00; app port 8101–8106.

Runtime không có DDL, không đọc Flyway history, không UPDATE/DELETE/TRUNCATE audit; migration V3 grant từng bảng hiện hành. **Migration tương lai phải grant rõ các bảng/sequence mới**, không tự cấp DDL/default blanket grants. V1 probe giữ checksum bất biến; V2 domain baseline từ SQL đã chốt; V3 privilege; Identity V4 seed role USER/BUSINESS/ADMIN, không seed user/password; V5 thêm options, profile default và hai bảng operational rate-limit/encrypted mail queue với explicit grants.

Triển khai ngoài dev nên chạy migration job với credential migrator trước, rồi app/worker `DB_MIGRATION_ENABLED=false`, không truyền migration password vào process runtime. Migration job vẫn phải validate Flyway trước deploy vì runtime không đọc history. Không cho runtime sửa schema để chữa lỗi boot.

Community URI (URL-encode password):

```text
mongodb://community_runtime:<password>@localhost:57117/community_db?authSource=community_db&replicaSet=rs0&directConnection=true
```

Community authenticated replica set dùng keyfile ngẫu nhiên trong volume; runtime custom role chỉ DML collection cho phép, audit/moderation append-only, schema_migrations read-only. Migration chạy bằng `mongosh /p01/migrate.js` dưới migrator, không có Flyway/JDBC/JPA. Runner/bootstrap chỉ dùng credential của Community từ env container. Java startup guard kiểm revision SHA-256, không quản lý index/validator; migration job phải chạy drift check trước deploy. Transaction manager dùng snapshot/majority. Inbox dedup theo `(consumer_name,event_id)`; `_id` do handler đặt theo consumer+event, không global event dedup làm mất delivery cho consumer khác.

MongoDB không có FK: media ownership/parent-version/reorder/reference và contribution payload allowlist vẫn cần domain handlers/tests M2/M3, không coi schema validation là đủ. Collection rank không unique nhằm hỗ trợ reorder transaction + parent version sau này. TTL idempotency không thay clock check ở handler.

## Migration/rollback runbook

- Không sửa nội dung V1/V2 đã áp dụng. Flyway validate mismatch hoặc Community checksum/drift phải fail deploy, không auto-refresh/repair.
- Community migration `.js` phải giữ LF: `backend/.gitattributes` áp dụng `text eol=lf` cho `services/community-service/src/main/resources/db/migration/*.js`. Mongo migrator và app guard đều hash **raw bytes**, không normalize hoặc bỏ qua drift khi validate. Nếu Git/Windows từng đổi CRLF, chỉ khôi phục LF sau khi xác nhận bản LF trùng committed V1/checksum DB; không sửa metadata hoặc xóa volumes. Clean build lại JAR/image vì resource trong artifact cũ vẫn có thể là CRLF. Regression tests kiểm canonical V1 hash và Git checkout với `core.autocrlf=true`.
- Mongo migration có exclusive lock; nếu crash, điều tra collection/index/history, xử lý migration lỗi rồi mới dùng migration identity xóa `migration_lock` document `_id=schema`. Không tự steal lock hoặc xóa dữ liệu domain.
- Bootstrap password áp dụng khi volume mới; thay `.env.local` không rotate role đã có. Rotation phải là tác vụ quản trị riêng, không xóa volume.
- Rollback image/config tương thích schema; migration mới expand-only. Không DROP database hoặc `down -v` để chữa lỗi.
- Dừng container mà giữ dữ liệu: `python backend/infra/p01.py down`.
- Image local: `docker build -t smarttravel-trip:p01-m1-local backend/services/trip-service`. CI tag commit SHA và lưu image artifact; chưa kiểm deploy/rollback/image runtime bằng container ở lượt M1 này.

## CI và phần tiếp theo

`.github/workflows/p01-services.yml`: matrix 6 service, build/unit/security, DB riêng, migrate/restart/smoke/constraint tests, image artifact; shared contract change chạy checks cả sáu. CI source đã parse, **chưa chạy GitHub Actions**. Domain/provider/fault tests, dependency scans và production deployment gate còn phải bổ sung theo P01.

Tiếp tục M1 của năm service còn lại: taxonomy/geo/registry/itinerary/visibility fixtures theo common IDs, runtime broker/storage và các adapter stub. Identity issuer/JWKS/options/user fixture đã có. Sau đó M2 domain APIs/rules/security, M3 transport/contract/fault tests; Intelligence chỉ triển khai training sau nghiệm thu Basic. Candidate P00 chưa có chữ ký N1/N2/freeze; tiếp tục code dựa revision `1.0.0-candidate`, không tự ghi gate đã được con người duyệt.

## Lượt hoàn thiện P01 — 10–11/10/2026

Phần M1 ở trên là evidence lịch sử. Code domain/adapter/provider/transport đang được ghép
và kiểm độc lập; trạng thái chính xác tại `PROGRESS.md`.
`p01.py up --service <service>` khởi động DB của đúng service và local broker dùng chung,
chỉ Identity cần mail sink. Không yêu cầu runtime hoặc DB của năm partner services.
Tên Compose `identity-broker` được giữ để bảo toàn volume/credentials đã có; broker là
hạ tầng local, không phải dependency nghiệp vụ Identity.

Bootstrap broker tạo `<service>_runtime` theo secret `<SERVICE>_BROKER_PASSWORD`. Runtime
configure/read chỉ topology của mình, publish chỉ events của mình và deletion ack;
không publish vào inbound để giả partner. Test fixture publisher chỉ write inbound với
allowlist registry và read capture/DLQ. Capture queue phải được app tạo chỉ trong local/test.
Mỗi Java process chỉ nhận password DB/broker của chính nó; không pass toàn bộ `.env.local`.
`BROKER_OPERATOR_PASSWORD` của Identity chỉ cấp CLI maintenance, không cấp normal app.
Bootstrap không rotate password user đã tồn tại; đổi password là tác vụ quản trị riêng.

```text
python backend/services/<service>-service/test-local.py --transport
python backend/services/identity-service/test-local.py --transport --isolated-source
python backend/platform/build_service_image.py identity --tag smarttravel-identity:<revision> --jar backend/services/identity-service/.local/verified-build/identity-service-0.0.1-SNAPSHOT.jar
python backend/services/identity-service/check-local.py --transport --image smarttravel-identity:<revision>
```

Runner disposable không sử dụng persistent P01 volume. Identity source-copy runner giữ JAR
checkout đang được process khác dùng; jar/reports mới nằm trong `.local/verified-build` ignored.
Image helper tạo context chỉ có Dockerfile/JAR, không copy `.env.local`, keys hoặc runtime logs.
Service runbooks ghi profile local, test JWKS/workload token, adapter config và limits riêng.
Gateway/client độc lập tại `backend/platform/api-gateway/README.md` và `frontend/src/api/`.

CI source bổ sung real domain/provider/broker faults cho từng service, Gateway/clients và
image tag revision. Frontend npm audit enforces the high severity threshold. GitHub dependency review
is unsupported for this private repository without Advanced Security; backend
vulnerability scanning is not claimed by this workflow. Remote CI must pass.
Local test/image pass không thay owner/reviewer handoff, contract freeze hoặc P02 integration.

## Kiểm tra revision cuối từ source

Trên Windows dùng `backend/mvnw.cmd`; trên Linux dùng `bash backend/mvnw` (không phụ thuộc executable bit).
Cài `requirements-validation.txt` trước image/provider probes. Chạy mỗi service với DB/broker
disposable và partner HTTP stub riêng bằng `test-local.py --transport`; Identity có
`--isolated-source` để giữ JAR checkout đang chạy. Sau mỗi build, tạo image từ đúng verified JAR
bằng `build_service_image.py`, rồi gọi `check-local.py --image <tag>`; thêm `--transport` cho Identity.
Năm image probes còn lại tự tạo và dọn DB/network/JWKS của mình. Identity live probe dùng DB/mail/broker P01,
thêm synthetic records và tự dừng container app; giữ dependencies và dữ liệu hiện có.

Community V3 bổ sung `user_mutation_fences` (tổng17 collections). Bootstrap cập nhật đúng
runtime role để chỉ cấp DML cho collection mới; audit/moderation vẫn append-only.
Migrator kiểm raw checksum V1/V2/V3, strict validators/indexes; restart không sửa checksum
hoặc tự repair drift. Storage probe kiểm fence write/rollback cùng các quyền cũ.
PostgreSQL migrations vẫn expand-only; Intelligence V9 chỉ cấp EXECUTE một function cố định
để xóa/anonymize actor identifiers, không cấp UPDATE/DELETE audit cho runtime.

Không đổi secret file để chữa authentication lỗi và không xóa persistent volumes.
Sau khi build JAR cuối, `p01.py smoke` áp dụng/validate migrations với migrator;
`p01.py verify` chạy storage/permission/cross-DB rollback checks trên runtime accounts.
Migration count/image digest/test count của từng gói được ghi tại checklist chung.

## Catalog CI port isolation

Normal local P01 keeps Catalog PostgreSQL on loopback port 56432. CI sets
`P01_CATALOG_DB_PORT=0`, so Docker allocates an available published port atomically.
`p01.py smoke` queries `docker compose port catalog-db 5432` and passes the actual
port to the Java probe. `verify` runs SQL inside the container and needs no host
port. Catalog disposable tests/image probes already allocate ephemeral ports or
use an internal Docker network. This does not change P02 default port 57432.

A zero port is only a Docker allocation request; calling the low-level probe
directly with zero is rejected. Use `p01.py smoke` to resolve the actual binding.
