# Triển khai SmartTravel lên Azure Container Apps (Phương án B1 — Scale-to-Zero)

Cấu hình chuẩn cho **Azure for Students** (`malaysiawest`, gần Việt Nam & Neon `ap-southeast-1`):
- **Azure Container Apps Environment (`cae-smarttravel-b1`)** — chế độ **Consumption Only** (tận dụng Free Grant vĩnh viễn hàng tháng: 180,000 vCPU-s, 360,000 GiB-s, 2 triệu requests).
- **7 Container Apps** (`gateway` external HTTPS + 6 service internal-only), đều `0.25 vCPU / 0.5 GiB`, `minReplicas: 0`, tối ưu JVM (`SerialGC`, `-Xmx224m`, `-Xss256k`), Hikari `minimum-idle=0` & `keepalive-time=0` để Neon tự ngủ sau 5 phút.
- **Azure Storage (`stsmarttravelb12452`)** — 3 Azure File Shares gắn bền vững:
  - `identity-keys` → `/run/identity` (chứa `keys.json` RS256 cố định, ReadOnly)
  - `community-media` → `/app/.local` (ảnh review)
  - `intelligence-artifacts` → `/app/artifacts`
- **Container Registry:** `ghcr.io` (GitHub Container Registry, \$0) qua workflow [publish-ghcr.yml](../../../.github/workflows/publish-ghcr.yml).
- **Message Broker:** CloudAMQP Little Lemur (\$0, AMQPS 5671) + KEDA RabbitMQ scaler tự động đánh thức service khi có message trong `*.inbox`.
- **Budget Guardrail:** `budget-smarttravel-b1` cảnh báo ngưỡng \$15/tháng trên Resource Group `rg-smarttravel-b1`.

## Các bước sử dụng

1. *(Tùy chọn, khuyến nghị)* Tạo instance miễn phí **CloudAMQP Little Lemur** (chọn data center Singapore), rồi thêm vào `.env` ở thư mục gốc:
   ```dotenv
   CLOUDAMQP_URL=amqps://USER:PASSWORD@HOST/VHOST
   ```
2. Build & đẩy 7 image lên `ghcr.io` bằng workflow GitHub Actions **Publish SmartTravel Images to GHCR (Azure B1)** (nhánh hiện tại, tag `azure-b1`), hoặc build từ máy cục bộ khi mở Docker Desktop.
3. Kiểm tra cấu hình mà chưa thay đổi Azure:
   ```powershell
   python backend/platform/azure/deploy_b1.py --check
   ```
4. Triển khai cả 7 Container Apps (tự khởi tạo topology trên CloudAMQP nếu đã đặt `CLOUDAMQP_URL`):
   ```powershell
   python backend/platform/azure/deploy_b1.py --apply --cors-origins "https://<ten-du-an>.pages.dev"
   ```
5. Nhớ mở IP outbound của `cae-smarttravel-b1` (hoặc tạm `0.0.0.0/0` khi test) trong **MongoDB Atlas Network Access** để `community` kết nối được tới `community_db`.

---

## Giám sát tài nguyên, chi phí & hoạt động deploy (PA 1 + PA 2 + Thông báo Deploy)

Bộ công cụ giám sát hoàn toàn **\$0** và **không gắn agent nặng vào 7 container `0.5 GiB`**:

### 1. PA 1 — Azure Monitor Workbook & Guardrails trên Azure Portal
- Kiểm tra trạng thái Log Analytics cap, Budget alerts và Workbook hiện tại:
  ```powershell
  python backend/platform/azure/setup_monitoring.py --check
  ```
- Cài đặt/cập nhật **Azure Monitor Workbook** (`workbook_b1.json` — 4 tab: Trạng thái 7 Services, CPU/RAM/Requests/Latency, Logs lỗi & KEDA Scale, Credit & Free Grant) vào `rg-smarttravel-b1`:
  ```powershell
  python backend/platform/azure/setup_monitoring.py --apply-workbook
  ```
- Cài cả Workbook + đảm bảo Daily Cap `0.15 GB/ngày` trên `law-smarttravel-b1` + bật cảnh báo email đa ngưỡng (`25% / 50% / 80% / 100%`) cho `budget-smarttravel-b1`:
  ```powershell
  python backend/platform/azure/setup_monitoring.py --apply-all --alert-email <email-cua-ban>
  ```

### 2. PA 2 — All-in-One Ops & Cost Control Center (`ops_monitor.py`)
Xem trực tiếp thông số của **toàn bộ nền tảng ngay trong 1 màn hình** (không cần mở từng web nền tảng):
- **Tự động chạy ngay (0 cần thêm key mới — tận dụng `.env`, `az login`, `wrangler`, `gh` & Java 21 có sẵn):**
  - **Azure Container Apps** (7 services: live replicas, CPU, RAM, Requests, Latency, Restarts) + **Log Analytics** (`law-smarttravel-b1`)
  - **Azure for Students Credit \$100** (số dư còn lại, đã dùng, chờ trừ, ngày hết hạn qua MCA Billing API) + **Azure Cost Management & ACA Free Grant**
  - **GitHub Actions** (`deploy-b1.yml` — lịch sử deploy)
  - **CloudAMQP** (`CLOUDAMQP_URL` — connections `/20`, bảng chi tiết toàn bộ `*.inbox` & `*.dlq`, tốc độ message)
  - **Cloudinary** (`CLOUDINARY_*` — credits `/25`, storage, bandwidth, transforms, số lượng ảnh)
  - **MongoDB Atlas M0** (`COMMUNITY_MONGODB_URI` qua `DbStatsProbe.java` — dung lượng thực tế `/512 MiB`, số collection, tổng document, top collections, replica set)
  - **Cloudflare Pages** (tự động dùng `wrangler` đã đăng nhập — lịch sử deploy `smarttravel-vn`, domain, commit SHA + HTTP live probe)
  - **Neon PostgreSQL (5 DBs)** (qua `DbStatsProbe.java` dùng `.env` — bấm nút **Đo 5 DB Neon (SQL)** trên dashboard hoặc truyền `--probe-neon` để đo dung lượng MB `/1 GB`, số bảng, số dòng, kết nối, extensions `postgis`/`vector`, PG version; không tự chạy khi auto-refresh để giữ Neon ngủ tiết kiệm CU-hours)
- **Tùy chọn mở rộng thêm chỉ số billing/analytics (thêm key chỉ-đọc vào `.env` local rồi bấm *Làm mới*):**
  - **Neon Compute CU-hours (`/100 CU-h`) & trạng thái `idle/active` không đánh thức DB:** `NEON_API_KEY`
  - **Cloudflare Pages Functions GraphQL analytics (`/api/*` invocations/errors):** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
  - **MongoDB Atlas Open Alerts & Cluster Tier API:** `ATLAS_PUBLIC_KEY`, `ATLAS_PRIVATE_KEY`, `ATLAS_GROUP_ID`

Lệnh chạy:
- Xem nhanh trên Terminal:
  ```powershell
  python backend/platform/azure/ops_monitor.py
  python backend/platform/azure/ops_monitor.py --watch --interval 60
  ```
- Mở **Local Web Control Center** (`http://127.0.0.1:8787`):
  ```powershell
  python backend/platform/azure/ops_monitor.py --web
  ```
- Xuất JSON cho script/tự động hóa:
  ```powershell
  python backend/platform/azure/ops_monitor.py --json --hours 24
  ```

### 3. Thông báo Deploy tự động (Discord / Telegram)
Workflow [`.github/workflows/deploy-b1.yml`](../../../.github/workflows/deploy-b1.yml) đã tích hợp job `notify-deploy` (chạy cả khi deploy thành công lẫn thất bại). Chỉ cần thêm một trong hai bộ GitHub Actions Secrets trong **Settings → Secrets and variables → Actions**:
- **Discord:** `DEPLOY_DISCORD_WEBHOOK_URL`
- **Telegram:** `DEPLOY_TELEGRAM_BOT_TOKEN` và `DEPLOY_TELEGRAM_CHAT_ID`

*(Nếu chưa cấu hình các secret trên, job tự bỏ qua an toàn và không làm lỗi pipeline.)*

### 4. Kiểm tra số dư Credit \$100 Azure for Students
- **Azure Education Hub:** `https://portal.azure.com/#view/Microsoft_Azure_Education/EducationMenuBlade/~/overview`
- **Azure Sponsorships Balance:** `https://www.microsoftazuresponsorships.com/Balance`

