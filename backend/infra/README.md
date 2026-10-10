# P01 M1 — database và runtime độc lập

Đã triển khai baseline storage, **chưa hoàn tất M1/M2/M3/M4 hoặc gate P01**. Tiến độ/evidence tập trung tại `progress/PHASE_TASK_CHECKLIST.md`, không coi smoke unknown-route là API nghiệp vụ.

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

Runtime không có DDL, không đọc Flyway history, không UPDATE/DELETE/TRUNCATE audit; migration V3 grant từng bảng hiện hành. **Migration tương lai phải grant rõ các bảng/sequence mới**, không tự cấp DDL/default blanket grants. V1 probe giữ checksum bất biến; V2 domain baseline từ SQL đã chốt; V3 privilege; Identity V4 seed role USER/BUSINESS/ADMIN, không seed user/password.

Triển khai ngoài dev nên chạy migration job với credential migrator trước, rồi app/worker `DB_MIGRATION_ENABLED=false`, không truyền migration password vào process runtime. Migration job vẫn phải validate Flyway trước deploy vì runtime không đọc history. Không cho runtime sửa schema để chữa lỗi boot.

Community URI (URL-encode password):

```text
mongodb://community_runtime:<password>@localhost:57117/community_db?authSource=community_db&replicaSet=rs0&directConnection=true
```

Community authenticated replica set dùng keyfile ngẫu nhiên trong volume; runtime custom role chỉ DML collection cho phép, audit/moderation append-only, schema_migrations read-only. Migration chạy bằng `mongosh /p01/migrate.js` dưới migrator, không có Flyway/JDBC/JPA. Runner/bootstrap chỉ dùng credential của Community từ env container. Java startup guard kiểm revision SHA-256, không quản lý index/validator; migration job phải chạy drift check trước deploy. Transaction manager dùng snapshot/majority. Inbox dedup theo `(consumer_name,event_id)`; `_id` do handler đặt theo consumer+event, không global event dedup làm mất delivery cho consumer khác.

MongoDB không có FK: media ownership/parent-version/reorder/reference và contribution payload allowlist vẫn cần domain handlers/tests M2/M3, không coi schema validation là đủ. Collection rank không unique nhằm hỗ trợ reorder transaction + parent version sau này. TTL idempotency không thay clock check ở handler.

## Migration/rollback runbook

- Không sửa V1/V2 đã áp dụng. Flyway validate mismatch hoặc Community checksum/drift phải fail deploy, không auto-refresh/repair.
- Mongo migration có exclusive lock; nếu crash, điều tra collection/index/history, xử lý migration lỗi rồi mới dùng migration identity xóa `migration_lock` document `_id=schema`. Không tự steal lock hoặc xóa dữ liệu domain.
- Bootstrap password áp dụng khi volume mới; thay `.env.local` không rotate role đã có. Rotation phải là tác vụ quản trị riêng, không xóa volume.
- Rollback image/config tương thích schema; migration mới expand-only. Không DROP database hoặc `down -v` để chữa lỗi.
- Dừng container mà giữ dữ liệu: `python backend/infra/p01.py down`.
- Image local: `docker build -t smarttravel-trip:p01-m1-local backend/services/trip-service`. CI tag commit SHA và lưu image artifact; chưa kiểm deploy/rollback/image runtime bằng container ở lượt M1 này.

## CI và phần tiếp theo

`.github/workflows/p01-services.yml`: matrix 6 service, build/unit/security, DB riêng, migrate/restart/smoke/constraint tests, image artifact; shared contract change chạy checks cả sáu. CI source đã parse, **chưa chạy GitHub Actions**. Domain/provider/fault tests, dependency scans và production deployment gate còn phải bổ sung theo P01.

Tiếp tục M1: option/taxonomy/geo/registry/itinerary/visibility fixtures theo common IDs, auth issuer/JWKS thật của Identity, runtime broker/storage và các adapter stub. Sau đó M2 domain APIs/rules/security, M3 transport/contract/fault tests; Intelligence chỉ triển khai training sau nghiệm thu Basic. Candidate P00 chưa có chữ ký N1/N2/freeze; tiếp tục code dựa revision `1.0.0-candidate`, không tự ghi gate đã được con người duyệt.
