# Cấu trúc source của sáu microservice

Quy ước: **service → chức năng → tầng** (`package-by-feature`, phân tầng bên trong).
Mỗi service vẫn là Maven module/image/DB độc lập; không tạo shared domain library hoặc truy cập DB service khác.

## Java packages

```text
backend/services/<service>-service/src/main/java/vn/smarttravel/<service>/
├── ServiceApplication.java          # Bootstrap ở package gốc để scan toàn service
├── <feature>/
│   ├── controller/                  # HTTP binding/validation, gọi service
│   ├── dto/                         # Request/response của chức năng
│   ├── service/                     # Nghiệp vụ, quyền và transaction boundary
│   └── repository/                  # SQL/database access, row locking
├── security/
│   ├── config/                      # SecurityFilterChain/JWT decoder
│   ├── controller/                  # Public JWKS endpoint nếu service là issuer
│   ├── service/                     # Issuer/current principal validation
│   └── support/                     # Token hashing/random utilities
├── infrastructure/
│   ├── config/                      # Scheduling/provider wiring
│   └── <capability>/                # Mail/persistence/fixture; service/repository khi cần
└── shared/
    ├── exception/                   # Domain exception dùng chung trong service
    └── web/                         # Error response/advice/correlation/header helpers
```

Chỉ tạo package có code thật, không tạo controller/service/repository rỗng cho chức năng chưa triển khai.
Catalog/Community/Trip/Ingestion/Intelligence hiện mới có scaffold và storage configuration:
`security/config`, `shared/web`; Community thêm `infrastructure/persistence/config`.
Các feature nghiệp vụ của năm service này sẽ được thêm đúng quy ước khi triển khai.

## Identity hiện tại

- `auth/controller`: auth/password và sessions; `auth/dto`: DTO request riêng từng file.
- `auth/service`: register/login/token/password/session/rate-limit; `auth/repository`: SQL auth và rate-limit.
- `profile/controller|dto|service|repository`: GET/PATCH me, ETag/version, profile SQL.
- `security/controller/JwksController`, `security/service/IssuerKeys|CurrentUser`, `security/support/Tokens`.
- `infrastructure/mail/service|repository`: encrypted account mail/SMTP retry và mail-job SQL.
- `infrastructure/persistence/service|repository`: idempotency/audit/outbox envelopes và technical-table SQL.
- `infrastructure/fixture/service|repository`: opt-in local fixture runner và fixture SQL.
- `shared/exception/IdentityException`, `shared/web/IdentityErrorAdvice|RequestHeaders|ApiResponses`.

Mỗi top-level class/record có file riêng. Request DTO không đặt trong controller nữa.
Response map hiện có được giữ nguyên để không thay wire contract trong refactor này; khi bổ sung typed response DTO,
đặt ở feature `dto/` và kiểm lại frozen response schemas.

## Trách nhiệm và dependency

- Controller không gọi repository/JdbcTemplate, không chứa SQL hoặc quyết định nghiệp vụ.
- Service gọi repository để đọc/ghi; giữ transaction ở service. Repository lock phải chạy trên cùng transaction,
  không tự mở transaction độc lập làm mất atomicity của user/token/session/outbox/audit.
- Riêng rate-limit vẫn REQUIRES_NEW để invalid attempts được commit ngay cả khi auth thất bại.
- CurrentUser kiểm live user/session trong transaction của feature; refresh reuse vẫn commit family revocation trước 401.
- Shared chỉ chứa phần thật sự dùng chung; mail/JWT/fixture không gom vào `shared`.
- Không đổi routes, request/response names, roles/scopes, JWT claims, migration contents hoặc DB credentials theo việc đổi package.

## Tests, generator và build

Test source cũng theo package chức năng: unit tests mirror package chính; DB/API integration ở
`identity/auth/integration`, giữ suite cross-feature auth/profile/session để kiểm rollback/ownership/revocation.

```bash
# Clean bắt buộc sau khi đổi package để không đóng gói class cũ/duplicate Spring beans
./backend/mvnw -B -f backend/services/pom.xml clean verify
python backend/platform/test_service_layout.py
python backend/services/identity-service/test-local.py
```

Layout suite kiểm package/path, chỉ bootstrap ở service root, một top-level type/file,
controller/service không dùng JDBC/Mongo trực tiếp hoặc chứa SQL và controller không import repository.
Đây là structural guards, không thay functional/security/database tests.

`backend/platform/scaffold_services.py` tạo layout này và vẫn từ chối ghi đè checkout đã tồn tại.
`sync_security_templates.py` không blind-overwrite P01 source/security tùy biến nữa; chỉ xuất proposal vào thư mục review:

```bash
python backend/platform/sync_security_templates.py --write --output <review-directory>
```

Review/apply diff thủ công; không export vào `backend/services`, không overwrite proposal đã có.
Tài liệu/platform P00 template và backend demo lịch sử không được coi là service domain hiện hành và không refactor trong lượt này.

Evidence refactor tại [progress](../../progress_be.md).
Không suy ra Identity đã hoàn tất P01 hoặc reviewer/remote CI đã ký chỉ từ build/layout tests.
