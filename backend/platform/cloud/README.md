# Docker dev + Neon + MongoDB Atlas

Sáu skeleton service chạy Docker; năm PostgreSQL DB nằm trên Neon, Community nằm trên Atlas. Không thay thế Compose local P00. Chỉ cấu hình **development**, không phải production deployment. Redis chưa được skeleton dùng nên không thêm cache cloud.

## 1. Chuẩn bị cloud một lần

### Neon

Tạo năm database và role riêng: `identity_db`, `catalog_db`, `trip_db`, `ingestion_db`, `intelligence_db`. Có thể cùng Neon project/branch hoặc tách project. Dùng **direct endpoint**, tắt lựa chọn pooling khi lấy connection info. Không dùng endpoint chứa `-pooler` cho thiết lập này.

Mỗi role chỉ được truy cập database/schema của service đó. Flyway hiện tự chạy khi app khởi động nên role dev cần quyền CONNECT, USAGE/CREATE trên schema và quyền tạo/sửa bảng của mình. Không dùng chung owner/admin xuyên service. Production cần tách role migration và runtime.

Trong Neon SQL Editor, chọn **đúng database** rồi chạy bằng owner:

```sql
-- catalog_db
CREATE EXTENSION IF NOT EXISTS postgis;
-- intelligence_db (chuyển database trước khi chạy)
CREATE EXTENSION IF NOT EXISTS vector;
```

Thiết lập này chỉ kiểm tra extension, không tự chạy SQL thiết kế/domain seed và không tạo vector với số chiều chưa chốt. Neon compute ngủ có thể cần thời gian thức dậy; nếu lần kiểm tra đầu timeout, chạy lại.

### MongoDB Atlas

- Tạo cluster hỗ trợ transaction (replica set/sharded topology), Database User có `readWrite` chỉ trên `community_db`.
- Network Access: cho phép IP public của máy/VPN chạy Docker, không mở `0.0.0.0/0` lâu dài.
- Connect → Drivers → lấy URI `mongodb+srv://...`, thêm `community_db` trước `?`.
- URL-encode password trong URI nếu có ký tự đặc biệt. Không dùng tài khoản đăng nhập Atlas làm Database User.
- Preflight chỉ ping/đọc tên collection và kiểm tra topology/session; chưa kiểm chứng transaction nghiệp vụ hay quyền ghi. Community chưa tự tạo index/schema nghiệp vụ.

## 2. Điền một file .env

Yêu cầu: Docker Desktop **Linux containers** đang chạy, Java 21, Python 3.12+; Maven Wrapper có sẵn trong repo. Các lệnh dưới chạy tại root repo trong PowerShell, CMD hoặc Git Bash.

```bash
python backend/platform/cloud/manage.py init
```

Điền `backend/platform/cloud/.env` theo mẫu. File thật được Git ignore. **Không gửi file chứa credential qua chat, không commit hoặc screenshot.** Agent chỉ cần biết đường dẫn file local để chạy.

Neon cung cấp `postgresql://USER:PASSWORD@HOST/DB?...`; tách thành ba biến theo từng service:

```dotenv
CATALOG_DB_URL=jdbc:postgresql://HOST.neon.tech:5432/catalog_db?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt
CATALOG_DB_USER=CATALOG_ROLE
CATALOG_DB_PASSWORD='PASSWORD'
```

Giữ `sslmode=verify-full` và `sslrootcert` như mẫu: đường dẫn này là CA bundle **trong Linux container**, không phải đường dẫn Windows. Password PostgreSQL là password gốc, không URL-encode. Password chứa `$`, `#`, khoảng trắng nên dùng dấu nháy đơn; xem quy tắc escape dotenv nếu password chứa chính dấu nháy đơn. Không thêm credential vào DB_URL.

Mẫu Atlas:

```dotenv
MONGODB_URI='mongodb+srv://USER:ENCODED_PASSWORD@CLUSTER.mongodb.net/community_db?retryWrites=true&w=majority'
```

Compose ưu tiên biến môi trường shell hơn `.env`; tránh để các biến cùng tên cũ trong terminal.

## 3. Một lệnh kiểm tra/build/chạy

```bash
python backend/platform/cloud/manage.py up
```

Script sẽ:

1. Validate config mà không in credential.
2. Build image tools, kiểm tra TLS/kết nối cả sáu DB và PostGIS/pgvector bằng truy vấn đọc.
3. Dừng nếu preflight thất bại; chưa khởi động app hoặc chạy migration.
4. Build/test Maven, build sáu Docker image từ JAR mới.
5. Chạy issuer dev và sáu app, đợi health `UP` tối đa 180 giây.

**Khi app khởi động, Flyway sẽ ghi migration probe vào PostgreSQL dev.** Preflight không bảo đảm quyền DDL: lỗi quyền migration sẽ xuất hiện lúc startup. Chưa triển khai API nghiệp vụ/domain migration. Health UP không có nghĩa hệ thống nghiệp vụ đã hoàn thành. Thất bại startup không tự xóa/dừng container, giữ lại để bạn kiểm tra.

Lệnh bổ sung:

```bash
python backend/platform/cloud/manage.py check   # chỉ đọc kiểm tra DB, không chạy app
python backend/platform/cloud/manage.py status
python backend/platform/cloud/manage.py down    # không xóa dữ liệu cloud
```

Dùng `.env` ngoài repo nếu muốn:

```bash
python backend/platform/cloud/manage.py up --env-file C:/Users/ASUS/.smarttravel/.env
```

| Service | Health |
|---|---|
| Identity | http://localhost:8101/actuator/health |
| Catalog | http://localhost:8102/actuator/health |
| Community | http://localhost:8103/actuator/health |
| Trip | http://localhost:8104/actuator/health |
| Ingestion | http://localhost:8105/actuator/health |
| Intelligence | http://localhost:8106/actuator/health |

App/issuer host ports chỉ bind loopback. Không có proxy Windows hay DB local cần khởi động. Nếu P00 app/issuer khác chiếm các cổng này, dừng tiến trình đó trước.

## JWT và bảo mật

Issuer dev tạo key ephemeral khi restart, cấp token thử ở `http://localhost:18083/token?aud=catalog&role=USER`. Đây không phải Identity login thật. JWKS dùng hostname Docker `dev-issuer`, không dùng `localhost` từ container.

Có thể override `JWT_JWKS_URI` và `JWT_ISSUER` trong `.env` bằng provider thật (audience hiện là tên từng service). Issuer thử nghiệm vẫn nằm trong stack dev này; không triển khai Compose này trên máy chủ public/production.

Credential được truyền vào environment runtime, không bake vào image. Người có quyền Docker có thể đọc environment; production cần secret manager. Không chạy/chia sẻ `docker compose config` hoặc `docker inspect` không che secret. App log có thể chứa endpoint/credential trong lỗi driver, chỉ đọc local và redact trước khi chia sẻ.

Xem log local nếu startup lỗi:

```bash
docker compose --env-file backend/platform/cloud/.env -f backend/platform/cloud/compose.yaml logs --tail=100 catalog
```

Lỗi thường gặp: sai role/password/database, Neon endpoint pooler, Atlas IP allowlist, thiếu extension, thiếu quyền Flyway, Docker chưa chạy, cổng đang dùng. Preflight chỉ in service + loại lỗi, không in URI/exception chứa secret.

## Kiểm thử offline

```bash
python -m unittest discover -s backend/platform/cloud -p "test_*.py" -v
```

Tests cần Compose CLI nhưng không cần Docker daemon/cloud credentials. Kết nối cloud thật chỉ có thể xác nhận sau khi điền `.env`.
