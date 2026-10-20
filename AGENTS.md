# Quy tắc làm việc Git/GitHub cho coding agent

Tài liệu này là quy tắc bắt buộc cho mọi agent khi code trong repository `SmartTravel_VN`. Mục tiêu: tránh mất code, lịch sử Git rõ ràng, dễ review và dễ rollback.

## 1. Nguyên tắc chung

- Luôn kiểm tra trạng thái repo trước khi sửa code:
  - `git status --short --branch`
  - `git remote -v` khi cần xác nhận remote.
- Không ghi đè, xóa, reset hoặc stash thay đổi của người khác nếu chưa được người dùng cho phép rõ ràng.
- Không commit file chứa secret: password, token, API key, private key, `.env` thật, credential cloud/database.
- Không push trực tiếp lên `main` trừ khi người dùng yêu cầu rõ ràng và repo cho phép.
- Trước khi tạo commit/push, phải chạy kiểm tra phù hợp với phần đã sửa, ví dụ build/test/lint. Nếu không chạy được, phải ghi rõ lý do.
- Mỗi commit nên nhỏ, tập trung vào một mục tiêu, không gom nhiều thay đổi không liên quan.

## 2. Quy trình nhận việc chuẩn

1. Cập nhật nhánh chính cục bộ:
   ```bash
   git checkout main
   git pull --ff-only origin main
   ```
2. Tạo nhánh làm việc mới từ `main` mới nhất.
3. Code và test trên nhánh đó.
4. Kiểm tra diff trước khi commit:
   ```bash
   git status --short
   git diff
   ```
5. Commit theo quy ước ở mục 4.
6. Push nhánh làm việc và tạo Pull Request/Merge Request nếu được yêu cầu.

## 3. Quy tắc đặt tên nhánh

Dùng chữ thường, không dấu, phân tách bằng dấu gạch ngang. Format:

```text
<type>/<scope>-<short-description>
```

`type` hợp lệ:

- `feature`: chức năng mới.
- `fix`: sửa lỗi.
- `docs`: tài liệu.
- `refactor`: tái cấu trúc không đổi hành vi.
- `test`: thêm/sửa test.
- `chore`: việc phụ trợ, cấu hình, cleanup.
- `ci`: pipeline CI/CD.
- `release`: chuẩn bị phát hành.
- `hotfix`: sửa lỗi khẩn cấp từ production/release.

Ví dụ:

- `feature/identity-login-api`
- `fix/catalog-search-filter`
- `docs/github-workflow-rules`
- `refactor/trip-service-package`
- `hotfix/auth-token-expiry`

## 4. Quy tắc đặt tên commit

Dùng Conventional Commits. Format:

```text
<type>(<scope>): <summary>
```

Trong đó:

- `type`: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`, `style`, `revert`.
- `scope`: module/service/tài liệu bị ảnh hưởng, ví dụ `identity`, `catalog`, `trip`, `backend`, `plan`, `docs`, `github`.
- `summary`: ngắn gọn, dùng tiếng Việt hoặc tiếng Anh nhất quán trong PR; không viết hoa toàn bộ; không kết thúc bằng dấu chấm.

Ví dụ:

- `feat(identity): add login endpoint`
- `fix(catalog): correct search filter by province`
- `docs(github): add agent workflow rules`
- `refactor(trip): split itinerary validation`
- `test(community): add review service tests`

Nếu commit có breaking change, ghi rõ trong body:

```text
BREAKING CHANGE: mô tả thay đổi phá vỡ tương thích
```

## 5. Pull và đồng bộ code

- Trước khi bắt đầu việc mới, luôn pull `main` bằng fast-forward:
  ```bash
  git checkout main
  git pull --ff-only origin main
  ```
- Không dùng `git pull` sinh merge commit tự động trên nhánh làm việc nếu không cần.
- Khi nhánh làm việc bị sau `main`, ưu tiên rebase để lịch sử gọn:
  ```bash
  git fetch origin
  git rebase origin/main
  ```
- Nếu có conflict, phải đọc kỹ file conflict, giữ đúng logic, chạy test lại, rồi tiếp tục rebase:
  ```bash
  git add <file>
  git rebase --continue
  ```
- Không tự dùng `git rebase --abort`, `git reset --hard`, hoặc force push nếu chưa báo người dùng khi có rủi ro mất thay đổi.

## 6. Push và Pull Request

- Chỉ push khi người dùng yêu cầu hoặc khi nhiệm vụ yêu cầu tạo PR.
- Push nhánh làm việc:
  ```bash
  git push -u origin <branch-name>
  ```
- Không push trực tiếp vào `main`.
- PR phải có mô tả ngắn gồm:
  - Mục tiêu thay đổi.
  - Danh sách thay đổi chính.
  - Cách đã kiểm thử.
  - Ghi chú rủi ro/migration nếu có.
- Nếu PR liên quan task/issue, liên kết issue trong mô tả.

## 7. Merge

- Merge vào `main` chỉ thực hiện sau khi review đạt và test/CI đạt.
- Ưu tiên một trong các cách theo cấu hình repo:
  - Squash merge: dùng khi nhiều commit nhỏ/noisy.
  - Rebase and merge: dùng khi muốn giữ commit sạch tuyến tính.
  - Merge commit: chỉ dùng khi cần giữ lịch sử nhánh rõ ràng.
- Sau khi merge, cập nhật local:
  ```bash
  git checkout main
  git pull --ff-only origin main
  ```
- Có thể xóa nhánh đã merge nếu không còn dùng:
  ```bash
  git branch -d <branch-name>
  git push origin --delete <branch-name>
  ```

## 8. Quy tắc an toàn khi dùng lệnh Git nguy hiểm

Các lệnh sau chỉ được chạy khi người dùng cho phép rõ ràng và đã kiểm tra không làm mất dữ liệu:

- `git reset --hard`
- `git clean -fd` hoặc `git clean -fdx`
- `git push --force` hoặc `git push --force-with-lease`
- `git rebase` trên nhánh dùng chung đã có người khác làm việc
- xóa branch remote
- sửa lịch sử commit đã push

Nếu bắt buộc force push sau rebase, chỉ dùng:

```bash
git push --force-with-lease
```

Không dùng `--force` thuần nếu không có lý do đặc biệt.

## 9. Checklist trước khi báo hoàn thành

- Đã kiểm tra `git status --short --branch`.
- Không còn file thừa/debug tạm ngoài ý muốn.
- Đã chạy test/build/lint phù hợp hoặc ghi rõ chưa chạy được.
- Commit message đúng quy ước nếu có commit.
- Nếu đã push/PR, cung cấp tên nhánh và link PR nếu có.
- Nếu thay đổi làm đổi trạng thái task/phase, đã cập nhật progress theo mục 10.

## 10. Quy tắc ghi progress

Mục tiêu: mọi dev và agent đọc `progress/` thấy cùng một trạng thái, trạng thái đó khớp source trên `main` và có bằng chứng kiểm lại được. Mục này áp dụng cho `progress/**` và cho các dòng "Trạng thái" trong `plan/**`.

### 10.1. Cấu trúc và nguồn sự thật

- `progress/PHASE_TASK_CHECKLIST.md` là **nguồn trạng thái chính**: bảng tổng quan, từng task P00–P04, gate, findings.
- `progress/COMPLETED_WORK_CHECKLIST.md` tóm tắt artifact đã làm theo mốc thời gian, mục mới nhất ở trên.
- `progress/evidence/YYYY-MM-DD-<scope>-<topic>.md` chứa evidence chi tiết (chữ thường, không dấu, gạch ngang). Ví dụ: `2026-10-20-source-scan.md`.
- `progress/README.md` là mục lục; thêm file evidence mới thì phải thêm một dòng vào đây.
- Không tạo file báo cáo trạng thái riêng ở chỗ khác (README service, `backend/infra/*.md`, mô tả PR). Những nơi đó chỉ link về `progress/`. Nếu README service có ghi kết quả test thì progress vẫn là bản chính thức.
- `plan/` chỉ chứa yêu cầu. **Không tích checkbox trong `plan/`**. Chỉ được sửa dòng "Trạng thái" cho khớp progress.

### 10.2. Thời điểm cập nhật

| Sự kiện | Việc phải làm | Hạn |
|---|---|---|
| Bắt đầu task | Đặt `IN_PROGRESS`, ghi người làm, nhánh | Trong commit đầu tiên của nhánh |
| Code xong và test pass local | Đặt `LOCAL_VERIFIED`, ghi evidence | **Cùng PR** với code, không để PR sau |
| CI remote chạy xong | Ghi run ID/link và kết quả; PASS thì nâng lên `CI_VERIFIED` | Trước khi merge |
| PR được merge | Ghi merge commit SHA, ngày merge, người merge | Trong vòng 1 ngày làm việc, PR `docs(progress)` riêng nếu cần |
| Bị chặn | Đặt `BLOCKED`, ghi blocker, người xử lý, việc vẫn làm tiếp được | Ngay khi phát hiện |
| Reviewer ký | Đặt `ACCEPTED`, ghi tên reviewer và ngày | Khi reviewer xác nhận bằng văn bản (comment PR, tin nhắn có lưu) |
| Phát hiện progress lệch source | Thêm finding `F-xx` | Ngay khi phát hiện |
| Đối chiếu định kỳ | Quét source so với progress, ghi file `evidence/<ngày>-source-scan.md` | Mỗi thứ Hai và **bắt buộc trước khi đóng bất kỳ gate nào** |

- Ngày ghi tuyệt đối `DD/MM/YYYY` (tên file dùng `YYYY-MM-DD`), múi giờ Asia/Ho_Chi_Minh. Không viết "hôm qua", "tuần trước".
- Đầu mỗi file trạng thái có dòng `Cập nhật lần cuối: <ngày> · Revision: <SHA> · Người cập nhật`.

### 10.3. Bộ trạng thái chuẩn

Chỉ dùng các giá trị sau, viết in đậm ngay sau mô tả task:

| Trạng thái | Ý nghĩa | Checkbox |
|---|---|---|
| `NOT_STARTED` | Chưa có code/artifact | `[ ]` |
| `IN_PROGRESS` | Đang làm, có nhánh | `[ ]` |
| `BLOCKED` | Bị chặn; phải ghi blocker và người xử lý | `[ ]` |
| `PARTIAL` | Một phần tiêu chí có evidence; phải ghi rõ phần thiếu | `[ ]` |
| `LOCAL_VERIFIED` | Đủ mọi tiêu chí của task trong `plan/`, test pass local trên revision ghi rõ | `[x]` |
| `CI_VERIFIED` | Như trên, có thêm CI remote PASS với run ID trên đúng revision | `[x]` |
| `ACCEPTED` | Owner và reviewer chéo đã xác nhận | `[x]` |
| `N/A` | Không áp dụng; phải có lý do và quyết định scope (ai, ngày) | `[ ]` kèm `N/A` |

Trạng thái cấp service/phase giữ theo `plan/`: `READY_FOR_INTEGRATION`, `CONNECTED`, `SYSTEM_VERIFIED`, `RELEASED`. Chỉ ghi các trạng thái này khi gate tương ứng có đủ evidence **và** chữ ký.

### 10.4. Tiêu chuẩn một lần test được tính là PASS

- **0 failure và 0 error.** Một test fail thì cả suite là FAIL; không ghi "PASS trừ 1 test".
- **Skip không phải pass.** Phải ghi số test skip và lý do. Suite DB/broker chỉ được tính khi chạy thật với dependency thật (ví dụ `DOMAIN_DB_TESTS=true`, `IDENTITY_DB_TESTS=true` hoặc runner `test-local.py`). Maven thường skip các suite này thì chỉ được ghi là "unit/security PASS".
- Phải ghi đủ:
  - lệnh chính xác;
  - số tests run/failed/errors/skipped;
  - commit SHA và trạng thái checkout (sạch hay dirty);
  - môi trường: OS, phiên bản Java/Node/Python, có Docker hay không;
  - dependency là thật, disposable hay stub.
- Version môi trường phải đúng với project (Java 21, Spring Boot theo `pom.xml`). Chạy trên version khác thì ghi rõ, và không dùng lần chạy đó để đóng gate.
- **Evidence trên checkout dirty** chỉ đủ cho `PARTIAL` hoặc `LOCAL_VERIFIED` kèm ghi chú "dirty". Muốn đóng gate thì phải chạy lại trên commit đã có trên `main` hoặc nhánh PR.
- **Test flaky:** không retry cho tới khi pass rồi ghi PASS. Ghi số lần chạy, số lần fail, và tạo finding hoặc task sửa. Lần fail cũ vẫn giữ trong lịch sử.
- **CI remote:** ghi run ID hoặc link và tên job. "CI xanh" không có run ID thì không được nâng lên `CI_VERIFIED`.
- Kết quả runtime trong file bị ignore (`.local/`, `*-report.json`) không tự là evidence. Phải chép kết quả đã lọc secret vào `progress/evidence/`.
- Build pass, app khởi động được, hay số endpoint/số test đủ **không** chứng minh chức năng đạt. Evidence phải chỉ ra test hoặc lệnh kiểm đúng tiêu chí của task.

### 10.5. Không đánh dấu hàng loạt

- Mỗi `[x]` ứng với **một task** và có evidence riêng: tên test, lệnh, hoặc link evidence chỉ đúng tiêu chí đó. Không dùng một câu chung kiểu "tất cả đã pass" cho nhiều task.
- **Không suy trạng thái từ:** PR đã merge, số dòng code, số controller/endpoint, README service, commit message, hoặc lời agent/dev khác chưa kèm evidence.
- Không tích task cha hoặc gate khi còn task con `[ ]`, `PARTIAL` hay finding mức Cao đang mở trong phạm vi.
- Một commit progress không được đổi trạng thái quá **một phase** hoặc quá **một service**. Ngoại lệ duy nhất là lượt đối chiếu định kỳ có file `evidence/<ngày>-source-scan.md`. Khi đó vẫn phải ghi lý do cho từng task.
- Hạ trạng thái (ví dụ từ `LOCAL_VERIFIED` xuống `PARTIAL` khi phát hiện thiếu) được phép và bắt buộc khi có căn cứ. Ghi lý do và finding.
- Agent **không** tự đặt `ACCEPTED`, không đóng gate, không ký thay N1/N2 hay người dùng.

### 10.6. Mẫu dòng task

```text
- [x] P01-CA-04: <mô tả ngắn> — **LOCAL_VERIFIED** · <test/lệnh + ngày> · PR #10 (`d799fa2`) · reviewer: chưa ký
- [ ] P02-01: <mô tả ngắn> — **PARTIAL** · đã có: … · thiếu: … (F-06) · người xử lý: N1
```

Evidence dài hơn ba dòng thì chuyển vào `progress/evidence/` và link tới.

### 10.7. Gate và chữ ký

- Gate chỉ đóng khi đạt **toàn bộ** tiêu chí gate trong `plan/phases/` và có evidence ở mức `CI_VERIFIED` trở lên trên revision cuối.
- Gate cần chữ ký của owner **và** reviewer chéo theo `plan/06-work-assignment.md`. Ghi: tên, ngày, revision, nơi lưu xác nhận.
- Người dùng chấp nhận phase thì ghi riêng: ai, ngày, revision, nguồn. Việc này không thay chữ ký reviewer nếu `plan/` yêu cầu reviewer.
- Đổi contract sau khi đã `READY_FOR_INTEGRATION` thì hạ trạng thái các task bị ảnh hưởng, chạy lại kiểm thử, rồi cập nhật manifest.

### 10.8. Đồng bộ giữa các dev

- Owner chỉ sửa phần service/task của mình. Bảng tổng quan, gate và findings do điều phối cập nhật, hoặc owner sửa kèm review chéo.
- Mọi PR đổi chức năng phải cập nhật progress trong cùng PR. Reviewer từ chối PR thiếu phần này.
- Commit chỉ sửa progress dùng `docs(progress): <summary>`. Không gộp chung với commit code.
- Conflict trong progress: rebase lên `origin/main`, giữ evidence của cả hai phía, giữ trạng thái **thấp hơn** nếu hai phía mâu thuẫn, ghi finding cho phần mâu thuẫn. Không chọn "ours"/"theirs" cho cả file.
- **Không xóa lịch sử.** Evidence cũ sai hoặc bị thay thế thì giữ lại và ghi "Thay thế bởi <mục/ngày>". Chuyển nội dung sang file khác thì chuyển nguyên văn và ghi nguồn.
- Đổi tên/chuyển file progress thì dùng `git mv` và sửa mọi link (`git grep` tên file cũ phải ra 0 kết quả).

### 10.9. Findings

- Lệch giữa source, contract, plan và progress được ghi vào bảng "Findings đang mở" của `PHASE_TASK_CHECKLIST.md`. Mỗi finding có: ID `F-xx` tăng dần (không dùng lại ID), mức Cao/Trung bình/Thấp/Thông tin, owner, trạng thái `OPEN`/`PARTIAL`/`CLOSED`.
- Đóng finding thì ghi ngày, commit/PR, người xác nhận. Giữ dòng, không xóa.

### 10.10. Nội dung, an toàn và định dạng

- Viết tiếng Việt có dấu. Giữ nguyên thuật ngữ, tên lệnh, tên test, đường dẫn. Không trộn ngôn ngữ trong cùng một file.
- **Không ghi** password, token, API key, private key, connection string có credential, email/PII thật, nội dung `.env`/`secrets.json`. Chỉ ghi tên biến hoặc đường dẫn file bị ignore.
- Link nội bộ dùng đường dẫn tương đối và phải mở được. Link CI/PR dùng URL đầy đủ.
- Ghi rõ giới hạn: sandbox, synthetic, fixture, chưa đo production. Không viết "hoàn tất" khi tiêu chí chưa đủ.

### 10.11. Checklist trước khi push thay đổi progress

- Có dòng "Cập nhật lần cuối" với ngày, revision, người cập nhật.
- Mỗi `[x]` mới có evidence riêng, đúng tiêu chí trong `plan/`, có revision.
- Skip, dirty checkout và version môi trường lệch đã được ghi rõ.
- Bảng tổng quan, gate và findings khớp với các task bên dưới.
- Dòng "Trạng thái" trong `plan/` liên quan đã khớp.
- Không có secret/PII. Link nội bộ hoạt động. `progress/README.md` đã liệt kê file evidence mới.
