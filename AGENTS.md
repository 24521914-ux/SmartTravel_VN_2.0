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
