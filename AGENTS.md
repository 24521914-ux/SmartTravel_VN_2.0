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
- Nếu thay đổi làm đổi trạng thái task/phase, đã cập nhật `PROGRESS.md` theo mục 10.

## 10. Quy tắc ghi progress

Mục tiêu: mọi dev và agent đọc **một file duy nhất** là thấy cùng một trạng thái, trạng thái đó khớp source trên `main` và có bằng chứng kiểm lại được.

### 10.1. Cấu trúc và nguồn sự thật

- `PROGRESS.md` ở thư mục gốc repo là **nguồn trạng thái duy nhất**: tổng quan, quy ước, bản đồ luồng, task P00–P04 xếp theo phase, vấn đề mở, lệnh kiểm thử và lịch sử cập nhật.
- Không tạo file tiến độ, evidence hay báo cáo trạng thái riêng ở chỗ khác (thư mục `progress/`, README service, `backend/infra/*.md`, `docs/`, mô tả PR). Những nơi đó chỉ link về `PROGRESS.md`.
- Bằng chứng ghi ngắn gọn ngay trên dòng task: tên test hoặc lệnh, số liệu chính, run ID CI. Không chép log dài.
- `plan/` chỉ chứa yêu cầu. **Không tích checkbox trong `plan/`**. Chỉ được sửa dòng "Trạng thái" cho khớp `PROGRESS.md`.

### 10.2. Thời điểm cập nhật

| Sự kiện | Việc phải làm |
|---|---|
| Bắt đầu task | Đặt `IN_PROGRESS`, ghi người làm và nhánh, trong commit đầu tiên của nhánh |
| Code xong, test local PASS | Đặt `LOCAL_VERIFIED` kèm bằng chứng, **cùng PR** với code |
| CI chạy xong | Ghi run ID; PASS trên đúng revision thì nâng `CI_VERIFIED` |
| PR được merge | Thêm dòng vào mục "Lịch sử cập nhật" (ngày giờ, PR, commit) |
| Bị chặn | Đặt `BLOCKED`, ghi chặn bởi gì, ai xử lý, việc vẫn làm tiếp được |
| Người dùng hoãn phạm vi | Đặt `DEFERRED`, ghi người quyết định và ngày |
| Reviewer xác nhận bằng văn bản | Đặt `ACCEPTED`, ghi tên reviewer và ngày |
| Phát hiện lệch giữa source, contract, plan và progress | Thêm vấn đề `F-xx` vào mục "Vấn đề đang mở" |

- Mỗi lần sửa phải cập nhật dòng **Cập nhật** đầu file: `DD/MM/YYYY HH:mm (GMT+7)`. Không ghi "hôm qua", "tuần trước".

### 10.3. Bộ trạng thái chuẩn

| Trạng thái | Ý nghĩa | Checkbox |
|---|---|---|
| `NOT_STARTED` | Chưa có code/artifact | `[ ]` |
| `IN_PROGRESS` | Đang làm, có nhánh | `[ ]` |
| `BLOCKED` | Bị chặn; phải ghi blocker và người xử lý | `[ ]` |
| `PARTIAL` | Một phần tiêu chí có bằng chứng; phải ghi phần thiếu | `[ ]` |
| `DEFERRED` | Tạm hoãn theo quyết định người dùng; ghi người quyết định và ngày | `[ ]` |
| `N/A` | Không áp dụng; phải có lý do và người quyết định scope | `[ ]` |
| `LOCAL_VERIFIED` | Đủ mọi tiêu chí của task trong `plan/`, test pass local | `[x]` |
| `CI_VERIFIED` | Như trên, có thêm CI remote PASS với run ID trên đúng revision | `[x]` |
| `ACCEPTED` | Owner và reviewer chéo đã xác nhận | `[x]` |

Trạng thái cấp service/phase: `READY_FOR_INTEGRATION`, `CONNECTED`, `SYSTEM_VERIFIED` (phạm vi không AI: `P03_NON_AI_VERIFIED`), `RELEASED`. Chỉ ghi khi gate tương ứng có đủ bằng chứng **và** chữ ký.

### 10.4. Tiêu chuẩn một lần test được tính là PASS

- **0 failure và 0 error.** Một test fail thì cả suite là FAIL; không ghi "PASS trừ 1 test".
- **Skip không phải pass.** Suite DB/broker chỉ được tính khi chạy thật với dependency thật (runner `test-local.py` hoặc biến `*_DB_TESTS=true`). Maven thường skip các suite này thì chỉ ghi "unit/security PASS".
- Bằng chứng phải nêu: lệnh hoặc tên test, số tests run/failed/errors/skipped, commit SHA, checkout sạch hay dirty, môi trường (Java 21, Docker…), dependency thật hay stub.
- Chạy trên version khác project (khác Java 21) thì ghi rõ và không dùng lần chạy đó để đóng gate.
- Kết quả trên checkout dirty chỉ đủ cho `PARTIAL` hoặc `LOCAL_VERIFIED` kèm ghi chú "dirty". Muốn đóng gate thì phải chạy lại trên commit đã có trên `main` hoặc nhánh PR.
- Test flaky: không retry tới khi pass rồi ghi PASS. Ghi số lần chạy, số lần fail và mở vấn đề `F-xx`.
- CI: "CI xanh" không có run ID thì không được nâng `CI_VERIFIED`.
- Kết quả trong file bị ignore (`.local/`, `*-report.json`) không tự là bằng chứng; phải chép số liệu đã lọc secret vào `PROGRESS.md`.
- Build pass, app khởi động được, hay số endpoint/số test đủ **không** chứng minh chức năng đạt.

### 10.5. Không đánh dấu hàng loạt

- Mỗi `[x]` ứng với **một task** và có bằng chứng chỉ đúng tiêu chí đó.
- **Không suy trạng thái từ:** PR đã merge, số dòng code, số endpoint, README service, commit message, hoặc lời agent/dev khác chưa kèm bằng chứng.
- Không tích task cha hoặc gate khi còn task con `[ ]`, `PARTIAL` hay vấn đề mức Cao đang mở trong phạm vi.
- Hạ trạng thái khi phát hiện thiếu là bắt buộc; ghi lý do và vấn đề `F-xx`.
- Agent **không** tự đặt `ACCEPTED`, không đóng gate, không ký thay N1/N2 hay người dùng.

### 10.6. Mẫu dòng task

```text
- [x] P01-CA-04: <mô tả ngắn> — **LOCAL_VERIFIED** · Bằng chứng: <test/lệnh, số liệu, SHA> · Next: <việc tiếp theo>
- [ ] P02-01: <mô tả ngắn> — **PARTIAL** · Đã có: … · Thiếu: … (F-06) · Người xử lý: N1
```

### 10.7. Gate và chữ ký

- Gate chỉ đóng khi đạt **toàn bộ** tiêu chí gate trong `plan/phases/` và có bằng chứng `CI_VERIFIED` trở lên trên revision cuối.
- Gate cần chữ ký của owner **và** reviewer chéo theo `plan/06-work-assignment.md`. Ghi tên, ngày, revision, nơi lưu xác nhận.
- Đổi contract sau khi đã `READY_FOR_INTEGRATION` thì hạ trạng thái các task bị ảnh hưởng và chạy lại kiểm thử.

### 10.8. Đồng bộ giữa các dev

- Owner chỉ sửa dòng task của mình. Bảng tổng quan, gate và vấn đề mở do điều phối cập nhật, hoặc owner sửa kèm review chéo.
- Mọi PR đổi chức năng phải cập nhật `PROGRESS.md` trong cùng PR. Reviewer từ chối PR thiếu phần này.
- Commit chỉ sửa progress dùng `docs(progress): <summary>`. Không gộp chung với commit code.
- Conflict trong `PROGRESS.md`: rebase lên `origin/main`, giữ bằng chứng của cả hai phía, giữ trạng thái **thấp hơn** nếu hai phía mâu thuẫn, ghi vấn đề cho phần mâu thuẫn. Không chọn "ours"/"theirs" cho cả file.
- Lịch sử chi tiết trước 22/10/2026 nằm trong Git (`git log -- progress/`), không chép lại vào `PROGRESS.md`.

### 10.9. Vấn đề đang mở

- Mỗi vấn đề có ID `F-xx` tăng dần (không dùng lại ID), mức Cao/Trung bình/Thấp, phase, người xử lý, trạng thái `OPEN`/`PARTIAL`.
- Vấn đề đã xử lý chuyển xuống dòng "Đã đóng" kèm PR hoặc commit sửa.

### 10.10. Nội dung, an toàn và định dạng

- Viết tiếng Việt có dấu. Giữ nguyên thuật ngữ, tên lệnh, tên test, đường dẫn.
- **Không ghi** password, token, API key, private key, connection string có credential, email/PII thật, nội dung `.env`/`secrets.json`.
- Chỉ ghi thông tin giúp dev làm việc: trạng thái, bằng chứng, phần thiếu, việc tiếp theo. Không ghi nhật ký thao tác máy, đường dẫn máy cá nhân hay thông tin không dùng được.
- Link CI/PR dùng URL đầy đủ hoặc run ID; link nội bộ dùng đường dẫn tương đối và phải mở được.

### 10.11. Checklist trước khi push thay đổi progress

- Dòng "Cập nhật" có ngày giờ GMT+7 mới.
- Mỗi `[x]` mới có bằng chứng riêng, đúng tiêu chí trong `plan/`.
- Skip, checkout dirty và version môi trường lệch đã được ghi rõ.
- Bảng tổng quan, gate và vấn đề mở khớp với các task bên dưới.
- Dòng "Trạng thái" trong `plan/` liên quan đã khớp.
- Không có secret/PII. `git grep "progress/"` không trỏ tới file đã xóa.
