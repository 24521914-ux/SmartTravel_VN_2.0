# Vận hành và nghiệm thu P03 không AI

Runbook dành cho môi trường phát triển local có dữ liệu tổng hợp. Các lệnh chạy
từ thư mục gốc repository bằng PowerShell. Chỉ ghi nhận PASS sau khi có kết quả
thực tế, thời gian chạy và bằng chứng gắn với đúng source/image. Tài liệu này
không tự chứng nhận bất kỳ bài kiểm tra nào đã chạy thành công.

## Phạm vi và giới hạn

- Người dùng đã hoãn AI: F05, F08, ML, AI quality testing và quản trị dữ liệu/model.
  Không gọi recommendations, training, model promotion hoặc quality để nghiệm thu
  phạm vi này. Container Intelligence có thể tồn tại để duy trì ranh giới dữ liệu,
  ACK xóa tài khoản và kiểm tra phục hồi lưu trữ; đó không phải nghiệm thu AI.
- Các luồng tài khoản, danh mục, dịch vụ du lịch, cộng đồng, chuyến đi, doanh nghiệp,
  nhập dữ liệu và quản trị không AI vẫn phải được kiểm tra.
- Mailpit là SMTP sandbox; source-sandbox cung cấp dữ liệu tổng hợp có nhãn license.
  Chúng không chứng minh độ trễ hay khả năng giao thư của provider production.
- Bản đồ sử dụng liên kết OpenStreetMap và iframe trực tuyến khi người dùng chủ
  động bật. Không coi dữ liệu tổng hợp là dữ liệu địa điểm thực đã được cấp phép.
- Kết quả `P03_NON_AI_VERIFIED` chỉ áp dụng cho phạm vi đã hoãn AI. Phát hành,
  provider thực, credential production, vận hành bên ngoài và migration production
  thuộc P04 với quyết định riêng.

## Nhận diện môi trường

P02 dùng project `smarttravel-p02`, Gateway `58080`, Mailpit `59025`. Môi trường
P03 riêng dùng tên `smarttravel-p03-load-<8..16 ký tự hex>`, Gateway `59080`,
Mailpit `59925`, RabbitMQ management `59673`. Các project P03 dùng chung bộ cổng
host này nên chỉ chạy một project P03 tại một thời điểm. P02 có thể tiếp tục chạy.

```powershell
docker compose ps
python backend/infra/p03_environment.py status --project smarttravel-p03-load-a03e2026
```

Thay tên ví dụ bằng project đã được cấp cho bài chạy. Cấu hình P03 nằm ở
`backend/infra/.local/p03/environments/<project>/compose.yaml`. Không in hoặc đưa
`secrets.json`, `keys.json`, dump, token hay mail xác minh vào Git hoặc báo cáo.

Để tạo một môi trường P03 mới, dùng tên duy nhất và dữ liệu tổng hợp của công cụ:

```powershell
$p03Source = 'smarttravel-p03-load-' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
python backend/infra/p03_environment.py up --project $p03Source
$p03Compose = "backend/infra/.local/p03/environments/$p03Source/compose.yaml"
python backend/infra/p03_nonai_load.py seed --project $p03Source --compose-file $p03Compose
```

`seed` ghi dữ liệu vào môi trường tổng hợp đã được kiểm tra quyền sở hữu. Không
thay đường dẫn bằng cấu hình P02 hay cấu hình production. Kiểm tra mã thoát của
từng lệnh trước khi tiếp tục.

## Readiness, trace, dashboard và cảnh báo local

```powershell
python backend/infra/p02.py monitor
python backend/infra/p02.py manifest
```

`monitor` kiểm tra readiness, queue backlog, consumer, DLQ và thời hạn workload
token. Nó ghi `backend/infra/.local/p02/monitor.json` và `dashboard.html`; mã thoát
khác 0 báo có cảnh báo hoặc không thực hiện được việc kiểm tra. Dashboard là ảnh
chụp tại thời điểm chạy, cần chạy lại để cập nhật.

Người nhận cảnh báo trong phạm vi local là **người vận hành workspace**, qua hai
tệp trên và kết quả terminal. Đây là kênh tại máy; chưa cấu hình hoặc gửi email,
Slack hay tin nhắn ra ngoài. Bằng chứng alert-delivery phải thể hiện trạng thái
lỗi thực tế xuất hiện trong tệp/dashboard rồi được xóa sau khi khôi phục. Việc
có mã `monitor` không tự chứng minh cảnh báo đã được diễn tập.

Gửi `X-Correlation-Id` là UUID khi kiểm tra API và lưu mã đó cùng operation,
HTTP status, thời gian; dùng mã để đối chiếu JSON log Gateway và service đích.
Không lưu bearer token, refresh token, request body chứa PII hay nội dung mail.
Khi cần đọc log P03, dùng project/cấu hình đúng bên trên:

```powershell
docker compose -p $p03Source -f $p03Compose logs --no-color --tail 100 gateway catalog trip
```

Chỉ chia sẻ phần log đã được rà soát và che thông tin nhạy cảm. Kiểm tra redaction
trong bộ security đối chiếu các token/password/email tổng hợp đã gửi với runtime
log; kết quả chỉ chứng minh phạm vi và khoảng log đã thu thập.

## DLQ và replay

1. Đọc cảnh báo và xác định queue/event bị lỗi; giữ lại event ID, correlation ID,
   schema version, lỗi và số lần retry, không sao chép payload nhạy cảm.
2. Sửa nguyên nhân: schema, quyền broker, dependency hoặc dữ liệu không hợp lệ.
   Không đổi schema/event ID chỉ để qua kiểm tra và không purge DLQ.
3. Với **Catalog của P02**, chạy operator bằng credential operator riêng:

```powershell
python backend/infra/p02.py replay-catalog-dlq
python backend/infra/p02.py monitor
```

Operator dùng bản image hiện có và cấu hình P02; không dùng lệnh này để replay
project P03 khác. Chỉ replay queue thực sự được operator hỗ trợ. Sau replay,
kiểm tra DLQ/backlog, inbox deduplication và trạng thái nghiệp vụ; event bị phát
lại không được tạo bản ghi nghiệp vụ trùng. Nếu chưa sửa được nguyên nhân, giữ
event cách ly và ghi nhận chưa xử lý, không đánh dấu PASS.

## Backup và phục hồi ứng dụng ở project P03 riêng

Đảm bảo môi trường nguồn đã seed và có dữ liệu kiểm tra. Chọn tên đích mới hoàn
toàn; công cụ từ chối đích trùng nguồn, đích đã tồn tại hoặc mount không thuộc
project. Không chạy đồng thời load/fault/restore trên cùng nguồn.

```powershell
$p03Target = 'smarttravel-p03-load-' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
$p03Release = 'p03-nonai-20261020'
python backend/infra/p03_nonai_restore.py --source $p03Source --target $p03Target --release-id $p03Release
```

Công cụ dừng ứng dụng nguồn tổng hợp để chốt checkpoint, backup sáu database và
object volume, tạm dừng nguồn để giải phóng cổng, restore sang đích và khởi động
ứng dụng đích. Nó so sánh dữ liệu/schema/index, checksum object không rỗng,
rating watermark, login/API và thời gian khôi phục. Cuối cùng nó dọn tài nguyên
đích có xác minh quyền sở hữu và khởi động lại nguồn. P02 không bị dừng hoặc
mount vào bài diễn tập.

Dump/checkpoint nằm trong thư mục riêng của nguồn, còn báo cáo ở
`backend/infra/.local/p03/restore-report.json`. Đây là backup local tổng hợp;
không chứng nhận offsite backup, PITR production hay phục hồi mọi provider.
Các mục `pending_cases` vẫn cần bằng chứng riêng. Không đánh dấu hoàn tất
retention/license chỉ vì snapshot trước và sau restore giống nhau.

## Xóa tài khoản, retention và thu hồi quyền dữ liệu

Yêu cầu xóa đi qua `POST /api/identity/api/v1/me/deletion-requests`, với phiên của
chủ tài khoản, `Idempotency-Key` và `policy_version`. Theo dõi request ID bằng
API nội bộ có đúng scope `identity:deletion:read`; API này không được lộ qua
Gateway. Đợi ACK của các service, trạng thái hoàn tất và kiểm tra JWT cũ bị từ
chối. Không coi HTTP 202 ban đầu là dữ liệu đã xóa xong.

```powershell
python backend/infra/p03_nonai_e2e.py --release-id $p03Release
```

E2E dùng tài khoản tổng hợp riêng, SMTP sandbox và luồng xóa thật trong P02.
Không dùng tài khoản người thật để diễn tập. Nếu thiếu ACK: kiểm tra inbox/outbox,
retry và DLQ trước khi can thiệp; không sửa trực tiếp trạng thái thành COMPLETED.

Identity có retention worker mặc định chạy mỗi giờ, với initial delay một giờ
(`identity.retention.poll-ms`, `identity.retention.initial-delay-ms`). Khi kiểm
tra retention, dùng bản ghi tổng hợp quá hạn trong môi trường riêng và đối
chiếu chính sách/SQL thực tế; không thay thời gian hệ thống hay xóa toàn bảng.
Sau restore phải kiểm tra dữ liệu đã xóa không bị phục hồi thành dữ liệu hoạt
động và tombstone/version vẫn chặn event cũ. Thu hồi license/storage của nguồn
nhập phải có bài kiểm tra riêng; không chạy dataset/training để chứng minh
phạm vi không AI.

## Rollback image local, giữ nguyên các lượt ghi mới

Trước khi đổi image, lưu immutable image ID đang chạy. Ví dụ chỉ đổi Catalog
của project P03 đã kiểm tra, không đổi database/object volume:

```powershell
$p03Container = docker compose -p $p03Source -f $p03Compose ps -q catalog
$catalogImageId = docker inspect --format '{{.Image}}' $p03Container
if ($catalogImageId -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Missing immutable Catalog image ID' }
$p03Rollback = "backend/infra/.local/p03/environments/$p03Source/rollback-catalog.json"
@{ services = @{ catalog = @{ image = $catalogImageId } } } | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 $p03Rollback
```

Sau khi thử image mới, rollback về ID đã lưu bằng overlay chỉ thay image:

```powershell
docker compose -p $p03Source -f $p03Compose -f $p03Rollback up -d --no-deps catalog
python backend/infra/p03_environment.py status --project $p03Source
```

Chỉ dùng khi schema hiện tại còn tương thích với image cũ. Không tự rollback
database, chạy migration ngược, `down --volumes`, xóa volume hay restore checkpoint
lên nguồn đang nhận lượt ghi. Ghi một marker tổng hợp trước/sau đổi image và xác
minh marker cùng lượt ghi mới còn tồn tại sau rollback. Readiness, API và queue
cần được kiểm tra lại; câu lệnh rollback không tự chứng minh bảo toàn dữ liệu.

## Security và kết luận bằng chứng

```powershell
python -m unittest discover -s backend/infra -p test_p03_nonai_security.py
python backend/infra/p03_nonai_security.py --release-id $p03Release
```

Security chạy trên P02 với USER/BUSINESS/ADMIN, kiểm tra protected endpoint,
BOLA, refresh reuse, logout và thu hồi role/status bằng tài khoản tổng hợp riêng,
upload quarantine, rate limit và redaction. Nó không gọi endpoint Intelligence.
Không chạy cùng lúc fault exercise làm dừng P02. Giữ nguyên source trong lúc đo;
nếu candidate hash thay đổi, báo cáo phải bị từ chối và chạy lại trên bản đã chốt.

Các bài load/restore/e2e/security/frontend có phạm vi, môi trường và báo cáo
riêng. Rà soát source-image linkage và gate `--scope non-ai` trước khi kết luận.
Mọi FAIL, bằng chứng thiếu, kiểm tra chưa chạy hoặc giới hạn provider phải được
ghi rõ; không chuyển chúng thành PASS bằng cách sửa báo cáo.
