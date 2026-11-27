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
