# P01 Gateway độc lập

Java21/Boot3.5.13 + Spring Cloud2025.0.0, WebFlux. Không có DB hoặc credential DB.
Các HTTP tests dùng partner server loopback và JWKS RS256 thật; không boot sáu service.

```text
backend/mvnw.cmd -B -f backend/platform/api-gateway/pom.xml clean verify
java -jar backend/platform/api-gateway/target/api-gateway-0.0.1-SNAPSHOT.jar
docker build -t smarttravel-api-gateway:<revision> backend/platform/api-gateway
docker build --build-context backend=backend --target source -t smarttravel-api-gateway:<revision> backend/platform/api-gateway
```

Dòng thứ hai build từ source trong Docker (không cần JAR có sẵn).

Inject `JWT_ISSUER`, `JWT_JWKS_URI`, `JWT_AUDIENCE` và `{SERVICE}_URL` cho Identity/Catalog/
Community/Trip/Ingestion/Intelligence. `CORS_ALLOWED_ORIGINS` là danh sách origin cụ thể,
không wildcard. Default localhost chỉ là cấu hình local; chạy với partner stubs ở P01.
Local run đặt `SPRING_PROFILES_ACTIVE=local`; test harness dùng `test`. Ngoài profile local/test,
startup yêu cầu endpoints HTTPS được inject, không chấp nhận localhost/test issuer hoặc mix
profile local với prod/production/staging. Mỗi request `/api/<service>/api/v1/...` forward thành `/api/v1/...`.
JWKS qua `/api/identity/.well-known/jwks.json`; internal APIs và actuator upstream không
được expose qua gateway. Public routes theo frozen OpenAPI; route còn lại kiểm JWT,
issuer/expiry/iat/jti và audience đúng service đích. Admin route cần admin scope của service.
Service vẫn kiểm JWT/scope/ownership/status và business rules của chính mình.

Gateway bỏ Cookie/X-Forwarded-User và thay X-SmartTravel-Gateway, giữ bearer/If-Match/
Idempotency-Key và trace đã giới hạn ký tự/độ dài. Không có auth session hoặc request cache.
Chỉ retry GET/HEAD/OPTIONS tối đa2 lần; không retry mutation. Timeout response mặc định2s,
connect1s; `GATEWAY_RESPONSE_TIMEOUT` tùy biến có giới hạn cấu hình. Body mặc định1MiB,
gồm chunked body không Content-Length; quá giới hạn trả413 trước khi forward.
Health public chỉ liveness/readiness của gateway, không aggregate status sáu service.
Metrics/JWKS provider/status/trace kiểm độc lập trong tests; không gọi đây là P02 integration.

P02 phải nối issuer/config thật và giải quyết cấp scope user cho service đích trong giới hạn
access_token1024 ký tự của candidate. Identity P01 đang cấp identity:read/write/admin;
P01 Gateway/consumer dùng signed fixture theo audience/scope để nghiệm thu độc lập.
Không thêm tất cả scope vào một token rồi nới schema hoặc bỏ scope guard.
Production phải inject endpoint/key/provider thực và network policy trước khi mở traffic.
Rollback bằng image/config tương thích contract, không có database migration ở Gateway.
