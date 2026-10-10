# Community — P00 skeleton

Owner: N2; reviewer: người còn lại. Chưa có API/domain implementation.

Build từ root repo: `./backend/mvnw -f backend/services/pom.xml -pl community-service -am clean verify`.
Cách chạy DB riêng/JWKS/stub xem `backend/platform/README.md` và `backend/contracts/README.md`.
Audience `community`, cổng mặc định 8103. Health không cần JWT; route khác cần JWT.
Không phụ thuộc runtime năm service khác. Không thêm JPA/AI/Redis nếu chưa có use case.
P00 migration probe không thay thế domain migration/collections/index của P01.

## Immutable migration và xuống dòng

P01 V1 tại `src/main/resources/db/migration/V1__community_baseline.js` dùng LF.
Git rule tại `backend/.gitattributes` giữ nguyên LF kể cả khi Windows bật `core.autocrlf=true`.
Checksum canonical V1: `1830d58c5c42a83ac2de46824c9964aa161f94117e32eb02d7b95ab35fd30e1f`.
Migrator và startup guard vẫn kiểm SHA-256 raw bytes; không repair metadata để che thay đổi migration.
Clean build sau khi sửa EOL để JAR không giữ resource CRLF cũ.

Kiểm thử từ root repo:

```bash
./backend/mvnw -B -f backend/services/community-service/pom.xml clean verify
python backend/platform/test_service_layout.py
python backend/infra/p01.py verify --service community
python backend/infra/p01.py smoke --service community
```

V1 EOL regression đã được kiểm RED trên CRLF rồi GREEN trên LF. Verify storage probes rollback
transaction thật; không reset DB, sửa checksum/applied_at hoặc xóa volume. Chi tiết tại
`progress/PHASE_TASK_CHECKLIST.md`.
