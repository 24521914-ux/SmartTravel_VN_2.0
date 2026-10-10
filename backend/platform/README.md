# Nền tảng P00 — hướng dẫn chạy độc lập

> **P01 đã bắt đầu M1:** source service hiện có domain migrations và runtime roles riêng, không còn boot trên bootstrap credentials P00 theo mục 3 dưới đây. Chạy service hiện hành theo [`backend/infra/README.md`](../infra/README.md), `python backend/infra/p01.py up/smoke/verify`; P00 hướng dẫn dưới đây giữ làm lịch sử template/contract và dependencies cũ. Không áp domain migration vào volume P00 để chữa boot.

Triển khai kỹ thuật đã kiểm chứng; gate/bàn giao N1/N2 còn READY_FOR_REVIEW. Xem [manifest](P00_HANDOFF.md), `plan/P00-DECISIONS.md`, `plan/P00-POLICIES.md` và `backend/contracts/README.md` từ root repo. Chưa có chức năng nghiệp vụ hoàn thành hoặc kết nối runtime sáu service.

## 1. Build và contract tests

Từ root repo, Java21, Maven Wrapper, Python>=3.12, Docker Desktop Linux engine, Node24:

```bash
./backend/mvnw -B -f backend/services/pom.xml verify
./backend/mvnw -B -f backend/platform/p00-template/pom.xml verify
python -m pip install -r backend/platform/requirements-validation.txt
python backend/platform/validate_contracts.py
python backend/platform/test_contract_policy.py
python backend/platform/test_contract_stubs.py
python backend/platform/test_event_harness.py
```

Windows dùng `backend\mvnw.cmd` hoặc Git Bash. Build một gói không cần code/runtime năm service khác:

```bash
./backend/mvnw -f backend/services/pom.xml -pl identity-service -am verify
```

Boot3.5.13/Java21 là baseline availability/compatibility đã kiểm chứng, không tuyên bố support/EOL production đã được duyệt. Backend demo gốc không bị đổi phiên bản. Community dùng MongoDB starter, không JPA/JDBC/Flyway; relational services dùng JDBC/Flyway. Không bắt service dùng AI/Redis nếu chưa có use case.

## 2. Dependencies local

Đặt sáu password environment **chỉ local**: `CATALOG_DB_PASSWORD`, `TEMPLATE_DB_PASSWORD`, `IDENTITY_DB_PASSWORD`, `TRIP_DB_PASSWORD`, `INGESTION_DB_PASSWORD`, `INTELLIGENCE_DB_PASSWORD`. Không có credential production trong repo. Compose cần các biến này khi parse, kể cả khi chỉ khởi động một DB.

```bash
docker compose -f backend/platform/compose.p00.yaml config --quiet
docker compose -f backend/platform/compose.p00.yaml up -d --wait catalog-db template-db identity-db trip-db ingestion-db intelligence-db community-db
docker compose -f backend/platform/compose.p00.yaml run --rm community-init
docker compose -f backend/platform/compose.p00.yaml exec -T community-db mongosh --quiet --eval 'db.hello().isWritablePrimary'
docker compose -f backend/platform/compose.p00.yaml --profile cache up -d
python backend/platform/check_runtime.py
```

Đợi MongoDB primary trả true trước transaction probe. PostgreSQL bootstrap password chỉ áp khi volume mới; thay environment không tự đổi password của volume đã tồn tại. Không tự xóa volume để chữa lỗi kết nối.

| Host port | Database / bootstrap user | App port mặc định |
|---|---|---|
| 55432 | catalog_db / catalog_local (PostGIS) | 8102 |
| 55433 | platform_template / template_local | 8090 |
| 55434 | identity_db / identity_local | 8101 |
| 55435 | trip_db / trip_local | 8104 |
| 55436 | ingestion_db / ingestion_local | 8105 |
| 55437 | intelligence_db / intelligence_local (pgvector) | 8106 |
| 57017 | community_db / MongoDB replica set dev không auth | 8103 |

DB host ports bind loopback. Bootstrap PostgreSQL user là superuser chỉ dev; P01 phải tách migration/runtime role và chặn quyền DDL/DB chéo. MongoDB dev chưa auth, không dùng trên server chung/production. URI host `mongodb://localhost:57017/community_db?replicaSet=rs0&directConnection=true`; Docker network `mongodb://community-db:27017/community_db?replicaSet=rs0`. Redis riêng không expose host port; app Docker gọi `<service>-cache:6379` của mình.

## 3. Chạy một skeleton

```bash
python backend/platform/test_issuer.py --port 18083
# Terminal khác, sau khi cấu hình DB/Mongo environment
./backend/mvnw -f backend/services/pom.xml -pl catalog-service spring-boot:run
```

Environment:

- Relational: `DB_URL=jdbc:postgresql://localhost:<db_port>/<service>_db`, `DB_USER=<service>_local`, `DB_PASSWORD` tương ứng DB của mình.
- Community: `MONGODB_URI` theo URI host ở trên.
- `JWT_JWKS_URI=http://127.0.0.1:18083/jwks`, `JWT_ISSUER=local-test`, `JWT_AUDIENCE=<service>`.
- `PORT` tùy chọn, health `/actuator/health`; route khác yêu cầu JWT.

Issuer test chỉ loopback, key ephemeral; `/token?aud=catalog&role=USER` cấp **token thử**, `/jwks` public key, `POST /rotate` thử rotation. Không có user thật, không dùng ở production. Windows có thể reserve cổng 18083/18082; chọn cổng khác nếu bind lỗi.

Tự động smoke lần lượt từng app (ports/JWKS động), không cần runtime service khác:

```bash
python backend/platform/check_service_skeletons.py
# Hoặc chỉ một service
python backend/platform/check_service_skeletons.py --service community
```

Probe kiểm DB health, JWT thật đúng/sai audience, no-JWT 401 và error/correlation JSON; valid JWT tới route chưa có ->404 chứng minh authentication pass, không phải API nghiệp vụ đã implement. Mỗi app/issuer test được dừng sau smoke. Skeleton hiện mới có authentication filter; endpoint-specific scope/workload/role/ownership authorization phải được implement ở P01 khi thêm domain routes.

Platform test DB thật: đặt `DB_URL` port55433, user template_local, password tương ứng và JWT env, rồi:

```bash
P00_DB_TEST=true ./backend/mvnw -f backend/platform/p00-template/pom.xml verify
```

Không bật P00_DB_TEST thì DB runtime test skip rõ ràng; JWT/JWKS tests vẫn chạy. Five relational skeletons có migration platform_probe; đó không phải domain migration P01. MongoDB collections/index/schema migrations nghiệp vụ thuộc P01, thiết kế tại `plan/database/community-mongodb.md`.

## 4. Dependency stub, frontend và fixture

```bash
python backend/platform/contract_stub.py --service catalog --port 18082
# Có thể chạy service stub khác ở cổng riêng
npm --prefix frontend ci
npm --prefix frontend run dev
npm --prefix frontend run build
python backend/platform/check_frontend_proxy.py
```

Frontend dev default `127.0.0.1:5173`, proxy Catalog stub; override `P00_STUB_TARGET=http://127.0.0.1:<port>` nếu chọn cổng khác. Smoke tự chọn cổng động. Không ghi nhận browser/E2E đã pass chỉ từ HTTP/build.

HTTP stub giả lập auth và phản hồi fixture, không có domain persistence. JWT test issuer riêng ký token thật cho security smoke. Event SQLite harness chứng minh mechanics demo, không phải nghiệp vụ/outbox/broker implementation. Các giới hạn này được giữ rõ trong manifest.

Synthetic load data mới (directory phải chưa tồn tại):

```bash
python backend/platform/generate_load_fixture.py --output /tmp/smarttravel-load-fixture
```

83.000 synthetic record samples, checksum deterministic; không phải domain seed hoặc production ML quality evidence. Không tự import vào DB.

## 5. Image, CI và evidence

```bash
docker build -t smarttravel-catalog:p00 backend/services/catalog-service
docker build -t smarttravel-p00-template:local backend/platform/p00-template
```

Dockerfiles UID/GID10001, không root. Mỗi gói có image độc lập, DBpassword chỉ truyền environment, không bake vào image. Rebuild sau source changes.

Evidence thực tế ngày08/10/2026: 18 service Java tests +4 platform tests PASS; 6 standalone apps own DB/JWKS PASS; DB/PostGIS/pgvector/MongoDB/sáu Redis PASS; 183 HTTP/23 messages validate; 7 policy +3 HTTP suite +2 event suite PASS; frontend build/proxy và npm audit0 PASS; 6 service images +platform image build PASS. Chi tiết/giới hạn tại [manifest](P00_HANDOFF.md). CI workflow mới có source, chưa có remote run.

DB/cache Docker và volumes local được giữ để tiếp tục phát triển; test app/stub/issuer/Vite tạm được dừng. Khi muốn dừng dependencies (không xóa dữ liệu):

```bash
docker compose -f backend/platform/compose.p00.yaml --profile cache down
```

Không dùng `down -v` nếu chưa được cho phép vì mất dữ liệu.
