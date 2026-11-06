# Cloud stack: Docker + Neon + MongoDB Atlas

Stack mặc định dùng [`docker-compose.yml`](../../../docker-compose.yml) và **`.env` ở gốc repo**, kết nối **Neon** (5 PostgreSQL) và **MongoDB Atlas** (Community). Không có override tự nạp: container DB, Mongo bootstrap, Mailpit và sandbox chỉ có trong cấu hình local chọn riêng cho CI/kiểm thử.

| Chế độ | Lệnh | File môi trường | Compose project |
|---|---|---|---|
| Cloud (mặc định) | `docker compose up -d --build --wait` hoặc `python backend/platform/cloud/manage.py up` | `.env` | `smarttravel-cloud` |
| Local (CI/kiểm thử) | `docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml up -d --build --wait` | `.env.local` | `smarttravel-p02` |

Hai project tách biệt: volume và container local không bị đụng khi chạy cloud.

| Container | Vai trò | Port host |
|---|---|---|
| `gateway` | Điểm vào duy nhất, route `/api/{service}/...` về mạng nội bộ | `GATEWAY_PUBLISH` (mặc định `127.0.0.1:58080`) |
| `identity`, `catalog`, `community`, `trip`, `ingestion`, `intelligence` | Service nghiệp vụ, healthcheck readiness | không publish |
| `rabbitmq` + `rabbit-init` | Broker; job tạo vhost, user/quyền theo service, exchange, binding từ `contracts/registry.json` | không publish |
| `key-init` | Sinh khóa ký RS256 của Identity vào volume riêng, không bao giờ thay khóa đã có | — |
| `community-migrate` | Áp migration schema Community (collection, validator, index, checksum) lên Atlas | — |
| `db-check` ([`compose.tools.yaml`](compose.tools.yaml), profile `tools`) | Preflight chỉ đọc: TLS, kết nối, PostGIS/pgvector, topology Atlas | — |

Service chỉ khởi động sau khi `rabbit-init` chạy xong; Identity chờ thêm `key-init`, Community chờ thêm `community-migrate` (service tự từ chối chạy nếu thiếu migration). Các service còn lại chờ Identity healthy; Gateway chờ cả sáu service healthy. Không có `depends_on` nào trỏ tới DB: Neon/Atlas nằm ngoài Compose.

**Giới hạn:** service chạy profile `p02-local` vì giao tiếp nội bộ là HTTP thuần trong mạng Docker; profile production bắt buộc HTTPS giữa các service. Đây là topology dev/staging trên DB managed, chưa phải triển khai production. Đặt reverse proxy/TLS trước Gateway nếu mở ra ngoài loopback.

## 1. Chuẩn bị cloud một lần

### Neon

Tạo năm database: `identity_db`, `catalog_db`, `trip_db`, `ingestion_db`, `intelligence_db`. Dùng **direct endpoint** (không `-pooler`, Flyway cần session thật).

Mỗi database cần **hai role với tên cố định**, vì migration Flyway `GRANT` thẳng cho các tên này:

| Role | Dùng cho | Quyền |
|---|---|---|
| `<service>_migrator` | Flyway lúc khởi động | owner schema của service: CONNECT, CREATE trên database và schema |
| `<service>_runtime` | Ứng dụng | chỉ CONNECT; quyền bảng do migration cấp |

Ví dụ `catalog_migrator`/`catalog_runtime`. Không dùng chung role giữa các service. Trong Neon SQL Editor, chọn **đúng database** rồi chạy bằng owner:

```sql
-- catalog_db
CREATE EXTENSION IF NOT EXISTS postgis;
-- intelligence_db
CREATE EXTENSION IF NOT EXISTS vector;
```

Neon compute ngủ có thể cần vài giây để thức; healthcheck có `start_period` 60 giây.

### MongoDB Atlas

- Cluster hỗ trợ transaction (replica set). Network Access chỉ cho IP của máy chạy Docker, không mở `0.0.0.0/0` lâu dài.
- Hai Database User (auth database `admin`):
  - `community_migrator`: `dbAdmin` + `readWrite` trên `community_db`, chỉ dùng cho `community-migrate`.
  - `community_runtime`: custom role chỉ `find/insert/update/remove` trên các collection của `community_db` (cùng phạm vi role `communityRuntime` ở [`infra/mongo/bootstrap.js`](../../infra/mongo/bootstrap.js)).
- URI dạng `mongodb+srv://USER:ENCODED_PASSWORD@CLUSTER.mongodb.net/community_db?retryWrites=true&w=majority&authSource=admin`. URL-encode password.

### Dữ liệu

Flyway và `community-migrate` áp dụng migration khi khởi động; tài khoản fixture chỉ được tạo khi `IDENTITY_FIXTURES_ENABLED=true`. Dữ liệu trong cùng database cloud được dùng chung giữa các máy. Ảnh/tệp vẫn nằm trong volume của máy chạy backend; dùng chung database không đồng bộ các volume này. Trạng thái dữ liệu và kiểm chứng xem tại [`progress_be.md`](../../../progress_be.md).

## 2. Tạo và điền `.env`

```bash
python backend/platform/cloud/manage.py init
```

`init` (gọi `init_env.py --mode cloud`, cũng là chế độ mặc định) tạo `.env` ở gốc repo từ [`.env.example`](../../../.env.example) nếu chưa có, rồi sinh giá trị ngẫu nhiên cho **nhóm 1 – secret nội bộ** (password RabbitMQ theo service, `GATEWAY_EXCHANGE_SECRET`, `*_WORKLOAD_SECRET`, cursor key, mail key, fixture password) ở những dòng còn `GENERATED_BY_INIT_ENV` hoặc rỗng. Chạy lại không ghi đè giá trị đã có và **không bao giờ** ghi vào **nhóm 2 – DB** (`*_DB_URL`, `*_RUNTIME_PASSWORD`, `*_MIGRATION_PASSWORD`, `COMMUNITY_MONGODB_*`). File thật được Git ignore; chỉ chia sẻ riêng cho thành viên được cấp quyền, không commit hoặc đưa vào log/ảnh chụp công khai. Máy mới cần được thêm IP vào Atlas Network Access. Không cần `.env.cloud` để chạy stack mặc định.

Điền nhóm 2 theo mẫu. Neon cho `postgresql://USER:PASSWORD@HOST/DB`; tách thành URL JDBC không credential + password từng role:

```dotenv
CATALOG_DB_URL=jdbc:postgresql://HOST.neon.tech:5432/catalog_db?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt
CATALOG_RUNTIME_PASSWORD='RUNTIME_PASSWORD'
CATALOG_MIGRATION_PASSWORD='MIGRATOR_PASSWORD'
```

Giữ `sslmode=verify-full` (TLS kèm kiểm chứng chỉ và hostname, chặt hơn `require`) và `sslrootcert` là CA bundle **trong Linux container**. Password chứa `$`, `#`, khoảng trắng dùng nháy đơn. Nhóm 3 (tùy chọn): `GATEWAY_PUBLISH`, `CORS_ALLOWED_ORIGINS`, `AI_ENABLED`, `IDENTITY_FIXTURES_ENABLED`, SMTP ngoài (`MAIL_HOST`…, e-mail tắt tới khi cấu hình).

## 3. Kiểm tra, build và chạy

```bash
python backend/platform/cloud/manage.py check   # validate .env + preflight DB chỉ đọc
python backend/platform/cloud/manage.py up      # check + build từ source + up --wait
python backend/platform/cloud/manage.py status
python backend/platform/cloud/manage.py down    # không xóa dữ liệu cloud
```

`up` validate cấu hình mà không in credential (URL JDBC, `verify-full`, không pooler, đúng tên role, SRV Atlas có database và không tắt TLS, không còn placeholder, chỉ Gateway publish port, không có container DB local), chạy preflight, rồi `docker compose --env-file .env -f docker-compose.yml up -d --build --wait`. Có thể chạy trực tiếp `docker compose up -d --build --wait` sau bước `check`. Image build từ source trong Docker (target `source`), không cần Java trên máy. **Khi khởi động, Flyway ghi migration vào Neon và `community-migrate` ghi schema vào Atlas.**

Kiểm tra cú pháp không cần credential thật:

```bash
docker compose --env-file .env.example -f docker-compose.yml config --quiet
```

Xem log local khi lỗi (không chia sẻ log chưa che secret):

```bash
docker compose logs --tail=100 catalog
```

Lỗi thường gặp: sai role/password/database, sai tên role (phải `<service>_runtime`/`<service>_migrator`), Neon endpoint pooler, Atlas IP allowlist, thiếu extension, thiếu quyền CREATE cho migrator.

## Bảo mật

Credential chỉ truyền qua environment runtime, không bake vào image; người có quyền Docker đọc được environment, production cần secret manager. Không chạy/chia sẻ `docker compose config` hoặc `docker inspect` khi chưa che secret. RabbitMQ (5672/15672) không mở ra host; khi cần debug, thêm tạm port bind `127.0.0.1`.

## Kiểm thử offline

```bash
python -m unittest discover -s backend/platform/cloud -p "test_*.py" -v
```

Cần Compose CLI, không cần Docker daemon hay credential cloud. Kết nối Neon/Atlas thật chỉ xác nhận được sau khi điền `.env`.

## Local dành cho CI/kiểm thử

Không chạy fault/load/restore trên database cloud dùng chung. Chọn local rõ ràng:

```powershell
python backend/platform/init_env.py --mode local
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml up -d --build --wait
$env:P02_ENV_FILE = '.env.local'
$env:COMPOSE_FILE = 'docker-compose.yml;docker-compose.local.yml'
```

`.env.local` lấy mẫu từ [`.env.local.example`](../../../.env.local.example). Trên shell Unix, `COMPOSE_FILE` dùng dấu `:` thay cho `;`. Khi trở lại cloud, bỏ hai biến shell trên. Khi dừng local, dùng cùng `--env-file` và hai `-f`, không thêm `-v`.
