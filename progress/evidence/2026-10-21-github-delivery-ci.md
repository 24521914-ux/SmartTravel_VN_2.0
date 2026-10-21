# Giao code và xử lý CI — 21/10/2026

Cập nhật lần cuối: **21/10/2026** · Revision: `c1e8e29` · Người cập nhật: coding agent theo yêu cầu push, tạo PR và merge của người dùng. Nhánh `feature/verification-phase03-delivery`, [PR #20](https://github.com/24521914-ux/SmartTravel_VN/pull/20). Không thay chữ ký N1/N2 hoặc đóng gate phase.

## Trạng thái và phạm vi

- Toàn bộ source local ban đầu được bảo toàn ở `15e9004`; đồng bộ main trong `1fb4a9e`. Các sửa main về signing-key volume, fail-closed principal exchange, Catalog port và broker assertions được giữ.
- Hai comment Python và hai ghi chú `text.txt` mới của người dùng được kiểm nội dung, không có secret, rồi đưa vào `11f4f32`. Không ghi đè thay đổi của người dùng.
- P03 giữ **PARTIAL**. Kiểm thành công một workflow không cấp SYSTEM_VERIFIED; P04 chưa phát hành. AI quality/model/dataset/privacy AI suites chưa được nghiệm thu; Intelligence runtime vẫn phục vụ deletion ACK. P00 vẫn build/unit cả sáu package.
- Checkout lúc ghi evidence này sạch ở `11f4f32` trước thay đổi tài liệu. CI trên revision cuối sau cập nhật tài liệu vẫn cần xác nhận trước merge.

## Kiểm tra và lịch sử lỗi

Các lượt dưới đây đều giữ trong lịch sử, không xóa lần fail khi lần sau đạt.

| Revision / môi trường | Lệnh hoặc job | Kết quả và giới hạn |
|---|---|---|
| Local Windows, Java21.0.11, Node24.21.0, Python3.14.2, Docker29.4.0; checkout dirty trước `1fb4a9e` | Maven verify năm service | 198 test khai báo, 0 failure/error, 138 skip vì chưa dùng runner DB/broker. Chỉ kết luận unit/security và build đạt. |
| Cùng môi trường | Gateway Maven verify | 18 test, 0 failure/error/skip; fixture HTTP/JWKS local. |
| Cùng môi trường | `python backend/infra/p03_nonai_tests.py` | 94 test, 0 failure/error, 1 skip symlink Windows. |
| Cùng môi trường | `python backend/platform/validate_contracts.py` | 183 HTTP operation và 23 event/command, manifest đạt. |
| Cùng môi trường | checksum / Catalog port tests | Mỗi suite 3 test, 0 failure/error/skip. |
| Cùng môi trường | frontend contracts / build / audit | 7 test, 0 failure/error/skip; TypeScript/Vite build đạt; audit 0 vulnerability. |
| Local Windows dirty trước `a94dd90` | `python backend/services/community-service/test-local.py --transport` | 30 test, 0 failure/error/skip; Mongo replica set và RabbitMQ disposable thật, BUILD SUCCESS. |
| Local Windows dirty trước `f122729` | `python backend/services/ingestion-service/test-local.py --transport` | 38 test, 0 failure/error/skip; PostgreSQL/RabbitMQ disposable thật, BUILD SUCCESS. |
| Local dirty trước `a94dd90` | `python backend/platform/test_catalog_readiness.py` | 3 test, 0 failure/error/skip. Chờ authenticated TCP query đúng `catalog_db`; không nhận temporary init server. Bản sửa tương ứng [PR #18](https://github.com/24521914-ux/SmartTravel_VN/pull/18). |
| Local Windows dirty trước `11f4f32` | `python backend/platform/validate_contracts.py`; `python backend/platform/test_contract_stubs.py` | 183/23 cùng manifest đạt; stub 3 test, 0 failure/error/skip. |

### Artifact storage

[Run 39396133608](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39396133608), job platform `118539217462`: build/test/frontend/image đạt, upload thất bại vì GitHub account hết artifact storage quota. Commit `45b781b` cho archive chẩn đoán best-effort; mọi build/test/image vẫn bắt buộc. Không xóa artifact cũ. Actions logs vẫn còn; không tuyên bố có archive tải xuống hoặc đủ release/rollback evidence khi upload hỏng.

### Catalog và Ingestion

[Run 39396414757](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39396414757): Catalog `118540152398` fail do database chưa được tạo khi `pg_isready` nhận temporary server; sửa ở `a94dd90`. Ingestion `118540152685` fail vì test kỳ vọng publish bất đồng bộ ném exception đồng bộ, trong khi broker đã trả ACCESS_REFUSED403; `f122729` chờ shutdown signal với deadline10s và kiểm đúng reply code403, không nới ACL.

### MongoDB và kernel runner

[Community job 118542030766](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39396985665/job/118542030766) trên `f122729`: Mongo exit1, OOMKilled=false; fatal id12257600 nêu kernel từ6.19 không tương thích SERVER-121912. [P00 job118542031319](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39396985728/job/118542031319) cùng revision dừng vì Community DB exit1. Runner diagnostics ở `4c9771b` giữ nguyên lỗi gốc và log, cleanup chỉ đúng container disposable.

[MongoDB thông báo chính thức](https://www.mongodb.com/community/forums/t/mongodb-8-x-and-linux-kernel-6-19/337547) xác nhận lỗi allocator/kernel. [GitHub runner Ubuntu22.04](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2204-Readme.md) ghi kernel6.8.0-1064-azure tại lúc đối chiếu. Commit `3b699bd` pin riêng job chạy DB trong P00/P01/P02 sang Ubuntu22.04 và in `uname -sr`; không đổi Mongo image, không bỏ test hoặc bypass kiểm kernel. YAML đã parse và kiểm đúng ba job. Đây là giới hạn tương thích cần xem lại khi runner/kernel thay đổi; không tự suy CI đạt trước kết quả trên revision mới.

## CI đã có bằng chứng trên revision cũ

Trên `f122729`, [P02 connected run39396985534](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39396985534) đạt sau8m25s: source build, real service images, domain/deletion/resilience, browser, manifest/monitor. P01 Catalog/Identity/Ingestion/Trip, contracts/platform, P03 tooling và frontend đạt; Community/P00 fail vì kernel như trên. Vì còn hai job fail, toàn bộ CI revision này là **FAIL**, không ghi CI_VERIFIED cho phase.

Kết quả CI revision cuối và merge SHA sẽ được bổ sung sau khi kiểm đủ. Tài liệu này thay thế phần tổng hợp bị lỗi mã hóa ở evidence20/10; file cũ và checklist local nguyên văn vẫn giữ làm lịch sử, không dùng để nâng gate.

## CI source `0bcdca4` — 21/10/2026

Checkout GitHub sạch trên đúng `0bcdca489216b5fd5d399926117848768884d1b8`: **11/11 checks PASS**, 0 job fail. Đây là xác nhận các job bên dưới, không đóng gate P03 hoặc thay chữ ký owner/reviewer. Commit tài liệu tiếp theo giữ nguyên source đã kiểm và vẫn phải chờ checks trước merge.

| Run | Job và kết quả |
|---|---|
| [39538276131](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39538276131) | P00 `verify` PASS 2m50s, frontend PASS 13s. P00 build mặc định vẫn skip suite DB/broker theo cấu hình; không suy thành đủ nghiệm thu sáu service. |
| [39538276163](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39538276163) | P01 Catalog/Community/Identity/Ingestion/Trip, contracts và platform đều PASS. Job Community ghi kernel6.8.0-1070-azure, disposable suite30 test, 0 failure/error/skip; xác nhận hết lỗi kernel trước đây. |
| [39538276124](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39538276124) | P02 connected PASS 8m31s trên kernel6.8.0-1064-azure: 11 nhóm E2E không AI, 8 nhóm resilience, import commit/missing ACK/retry, frontend real Gateway, 8 browser cases không gọi AI, manifest và monitor `alarms=[]`. |
| [39538276132](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39538276132) | P03 tooling PASS 29s: 94 test trên Linux; không có skip symlink Windows. Contract validation và frontend trong job đều PASS. |

CI Linux dùng Java21/Python3.12 theo workflow; fixture là dữ liệu tổng hợp, Mailpit sandbox, PostgreSQL/MongoDB/RabbitMQ disposable và các service thật trong Docker. Các kết quả không đo production hoặc AI. Giới hạn archive best-effort vẫn giữ: Actions logs là bằng chứng trực tiếp, không tuyên bố đủ artifact release/rollback khi upload bị quota.

F-12 được xác nhận sửa kỹ thuật bởi review của agent điều phối và các run P00/P01/P02 nói trên; trạng thái phase vẫn PARTIAL. Nội dung plan P03 local trước đối chiếu được giữ nguyên trong [lịch sử](2026-10-21-plan-p03-history.md); plan hiện hành chỉ còn yêu cầu và dòng trạng thái khớp progress.

## Recovery probe sau lỗi trên revision tài liệu `107fed9`

[Run39539185667](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39539185667), job `connected` `119022756750` trên `107fed9` **FAIL**: E2E đạt, resilience đạt broker outage/dedup/crash/backpressure/snapshot/outage nhưng review POST ngay sau Catalog restart nhận503 `DEPENDENCY_UNAVAILABLE`. Browser/monitor không chạy do fail trước đó. Cùng source runtime đã đạt ở `0bcdca4`; do vậy giữ cả lượt pass và fail, không coi revision cuối đã xanh hoặc merge khi còn lỗi.

Lỗi nằm ở giả định health/startup đủ chứng minh đường HTTP phụ thuộc đã phục hồi. Bằng chứng chưa xác định sâu hơn là connection pool hay warm-up; không tự kết luận lỗi ứng dụng đã được sửa. `d8cf51c` sửa phép đo recovery: tạo collection private có một địa điểm trước outage, sau restart chỉ poll GET collection items qua Gateway→Community→Catalog tối đa30s. Chỉ503/504 được chờ; auth/error khác hoặc mất saved place fail ngay. Review POST không bị retry. Outage assertions và các phép đo khác giữ nguyên.

Local Windows/Java21/Node24/Python3.14/Docker29 như trên, checkout dirty trước `d8cf51c`: `python backend/infra/p03_nonai_tests.py` chạy 97 test, 0 failure/error, 1 skip symlink Windows. Ba test mới kiểm chỉ GET khi phục hồi, fail auth/sai dữ liệu và giữ deadline khi outage vĩnh viễn. CI runner thật trên revision sau sửa vẫn cần đạt; F-13 **PARTIAL**, người xử lý điều phối/CI. P03 giữ PARTIAL, không đóng gate.

### Lỗi fixture collection trên `2120ddd`

[Run39539986471](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39539986471) **FAIL** trước khi chạy Catalog outage/probe: fixture mới gửi `note` rỗng khi thêm collection item, nhưng schema frozen yêu cầu minLength1, nên trả400 VALIDATION_ERROR. Đây là lỗi fixture do agent thêm, không chứng minh recovery probe hỏng hoặc đạt. Giữ nguyên lượt fail; 10 job khác đạt không làm cả revision thành PASS.

Đã đổi fixture sang note có nội dung và thêm test validate body do runner sinh bằng chính schema request Community và UUID FormatChecker. Local checkout dirty sau `2120ddd`, cùng môi trường Windows nêu trên: `python backend/infra/p03_nonai_tests.py` chạy 98 test, 0 failure/error, 1 skip symlink Windows. Không retry mutation hoặc bỏ kiểm schema; CI revision mới vẫn phải đạt trước merge. F-13 giữ PARTIAL.

## Kết quả cuối và merge PR #20 — 21/10/2026

Revision PR cuối `1768b941b41a5804635f381a3c1aa936e625d056`, checkout CI sạch: **11/11 checks PASS**, 0 job fail. Source và toàn bộ cây file của squash commit `c1e8e2982dd6212ca6e1ff9d2c3ba16ad5c8965e` khớp revision PR cuối (`git diff --exit-code` đạt).

| Run cuối | Kết quả |
|---|---|
| [39540804336](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39540804336) | P00 verify PASS 2m50s; frontend PASS 16s. Các suite DB/broker mặc định skip trong build P00 vẫn không tính là pass nghiệp vụ. |
| [39540804296](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39540804296) | Năm service DB/provider/broker/image, contracts và platform đều PASS. |
| [39540804332](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39540804332) | P03 tooling PASS 1m29s, gồm 98 test; Linux không bị skip symlink Windows. |
| [39540804333](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/39540804333) | P02 connected PASS 8m35s: 11 nhóm E2E không AI, 8 nhóm resilience, import ACK/retry, real Gateway client, 8 browser cases không gọi AI, manifest/monitor. Bước archive lần cuối cũng thành công; giới hạn best-effort khi quota hết vẫn được giữ trong workflow. |

Log job `119027847448` xác nhận `PASS Community Catalog read path recovers after restart` lúc03:58:02UTC, rating reconciliation03:58:04UTC, DLQ replay03:58:39UTC, browser03:59:07UTC. Fixture note hợp schema, GET recovery và review POST đơn đã được chạy thật. F-13 được xác nhận sửa kỹ thuật bởi CI này và review của agent điều phối; các lượt fail trước giữ nguyên trong lịch sử.

[PR #20](https://github.com/24521914-ux/SmartTravel_VN/pull/20) được **squash merge** bởi `Truong102006` lúc **21/10/2026 11:00:25 Asia/Ho_Chi_Minh** (`2026-10-21T04:00:25Z`), merge commit `c1e8e2982dd6212ca6e1ff9d2c3ba16ad5c8965e`. Các nhánh remote được giữ. Main local được pull fast-forward; worktree main phụ sạch được chuyển detached, giữ nguyên đường dẫn và dữ liệu để main có thể checkout trong workspace IDE chính.

Đây là hoàn tất giao code/GitHub, không phải nghiệm thu phase: P03 vẫn **PARTIAL**, P04 **NOT_STARTED**; không cấp SYSTEM_VERIFIED, RELEASED hoặc chữ ký N1/N2. AI và production chưa được nghiệm thu. Lượt kiểm tài liệu sau merge chỉ sửa progress, kiểm link/nội dung/diff, không cần chạy lại suite code đã xanh.
