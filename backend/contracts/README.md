# Contract P00 — 1.0.0-candidate

Bộ wire contract đã hoàn thiện về mặt scaffold và được kiểm tra kỹ thuật; **chưa có xác nhận N1/N2 phê duyệt/bàn giao**. JSON được lưu đuôi `.yaml` là YAML hợp lệ. Schema không import entity/storage credentials.

## Gói bàn giao

- `openapi/{service}.yaml`: sáu OpenAPI 3.1, **183 operation** cho auth/profile/admin, catalog/geo/search/business, UGC, Trip, Ingestion và Intelligence Basic/ML.
- `events/*.schema.json`: **23 event/command** JSON Schema 2020-12, envelope cùng producer/aggregate/version/correlation/causation/traceparent, payload whitelisted và applied/rejected riêng.
- `registry.json`: producer/consumer, loại message, operation inventory, revision chung.
- `fixtures/{service}.http.json`: request/response/required headers cho mỗi operation; `fixtures/events/`: ví dụ mỗi message.
- `fixtures/shared.json`: U1/U2/admin/business, consent on/off, public/hidden/archive place, active/inactive category, permitted/revoked source, trip/model synthetic.
- `fixtures/load-profile.json`: target tải và quy mô synthetic dataset; generator reproducible tại `backend/platform/`.
- `checksums.json`: SHA-256 artifact inventory; validator mặc định **kiểm** checksum, không tự cập nhật để che thay đổi.

## Chạy độc lập

```bash
python -m pip install -r backend/platform/requirements-validation.txt
python backend/platform/validate_contracts.py
python backend/platform/test_contract_policy.py
python backend/platform/test_contract_stubs.py
python backend/platform/test_event_harness.py
python backend/platform/contract_stub.py --service catalog --port 18082
python backend/platform/test_issuer.py --port 18083
```

Chạy stub khác bằng `--service identity|community|trip|ingestion|intelligence` và cổng riêng. Windows có thể reserve cổng: chọn cổng khác nếu bind bị từ chối. Stub bind loopback, authorization **giả lập** bằng `Bearer p00:<service>:all` hoặc `:read`, không phải JWT thật. Header `X-Stub-Scenario` chọn 403/404/409/503/timeout; invalid input 400, thiếu If-Match 428, thiếu fake auth 401. Stub phản hồi fixture, không thực thi domain/CRUD persistence.

Test issuer riêng có JWT RS256 thật với key ephemeral, issuer `local-test`, `/jwks`, `/token?aud=catalog&role=USER` và `POST /rotate`. **Chỉ local tests**, không triển khai hoặc dùng token/key này ở production. Six-skeleton smoke tự chạy issuer cổng động, không cần Identity service thật.

## Kiểm chứng và giới hạn

- Tất cả operation schema/examples/error formats và event serialization/negative UUID/schema_version validate pass.
- HTTP stub tests thực hiện toàn bộ 183 operation; thêm 401/403/409/428/invalid body/timeout.
- Independent policy tests kiểm privileged scopes, owner/role/snapshot spoof fields, precondition, public visibility, review change_kind, source revocation version và đầy đủ message families.
- SQLite harness kiểm atomic demo inbox/projection, duplicate, crash-before-commit/rollback/retry và out-of-order. **Không phải consumer nghiệp vụ trên DB thật**, không chứng minh transport RabbitMQ; đó là P01/P02.
- Fixture tự sinh là synthetic protocol examples, không phải dữ liệu seed thỏa mọi invariant domain hoặc ML quality evidence. Cross-field rules và authorization nghiệp vụ phải implement/test ở P01 theo `plan/P00-POLICIES.md`.
- Không có chức năng ML/business API đã chạy thật chỉ vì contract được định nghĩa.

## Thay đổi có kiểm soát

Nguồn deterministic: `backend/platform/build_contracts.py`. Khi chủ động sửa:

```bash
python backend/platform/build_contracts.py --write
# Review diff producer và consumer trước khi freeze/bàn giao
python backend/platform/validate_contracts.py --refresh-checksums
python backend/platform/validate_contracts.py
```

Không regenerate blind sau khi người khác đã chỉnh artifact; sửa generator và review output cùng nhau. Breaking change cần version mới; không chia sẻ JPA entity, không dùng DB chéo hoặc hardcode để vá mismatch.

Owner Identity/Catalog/Ingestion: N1; Community/Trip/Intelligence: N2. Reviewer là người còn lại; tài khoản GitHub không bắt buộc để ghi xác nhận.
