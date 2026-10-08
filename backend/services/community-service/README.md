# Community — P00 skeleton

Owner: N2; reviewer: người còn lại. Chưa có API/domain implementation.

Build từ root repo: `./backend/mvnw -f backend/services/pom.xml -pl community-service -am verify`.
Cách chạy DB riêng/JWKS/stub xem `backend/platform/README.md` và `backend/contracts/README.md`.
Audience `community`, cổng mặc định 8103. Health không cần JWT; route khác cần JWT.
Không phụ thuộc runtime năm service khác. Không thêm JPA/AI/Redis nếu chưa có use case.
P00 migration probe không thay thế domain migration/collections/index của P01.
