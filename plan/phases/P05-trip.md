# P05 Trip Service và bản đồ

Trạng thái: **Chưa triển khai**. Luồng chức năng thuộc P01-TR; dependency để bắt đầu là P00 và contract/fixture đã chốt. Phát triển, kiểm thử độc lập bằng Catalog/Intelligence stub song song với các nhóm service khác; chỉ kết nối runtime thật tại P02 sau gate 6/6. Chức năng: F09/F10. Mã task bên dưới được giữ để theo dõi chi tiết, không phải một phase nối tiếp Community.

## Công việc

- [ ] P05-01: [Trip migration](../database/trip.md), composite FK cùng trip, unique deferrable và parent concurrency.
- [ ] P05-02: Trip/segment/day CRUD, owner từ JWT, date/day policy và version trên mọi mutation.
- [ ] P05-03: Add place qua Catalog batch, lưu snapshot/version; refresh chủ động, completed trip giữ snapshot.
- [ ] P05-04: Item add/remove/reorder/note/duration/locked; reorder atomic kiểm đầy đủ item IDs; cost cùng currency.
- [ ] P05-05: Transfer cùng trip, map provider adapter/timeouts/cache/attribution; phân biệt route và khoảng cách địa lý.
- [ ] P05-06: Visibility event đánh unavailable, không tự xóa lịch trình; item-added event phục vụ history.
- [ ] P05-07: Add-from-recommendation hoàn thiện với recommendation fixture trong P01-TR song song cùng P01-IN; nối thật tại P02, giữ request attribution và không tự sửa locked item.

## Contract và dữ liệu

7 bảng domain + 4 kỹ thuật. API me/trips, trip destinations/days/items/order/transfers, route-estimates, snapshot refresh. Snapshot là denormalization có owner/freshness rõ; no distributed transaction với Catalog. Publish trip.changed/item.added; consume Catalog visibility và Identity deletion/status.

Frontend: trip list/editor/day tabs, drag/drop, note/locked/budget, map nhiều điểm và route; thông báo stale snapshot/provider failure.

## Kiểm nhận

- [ ] Không thể gắn day/item/transfer của trip khác; đổi date reject nếu còn item ngoài khoảng chưa xử lý.
- [ ] Hai reorder cùng version: một 409; transaction không mất item hoặc trùng sort_order.
- [ ] Catalog lỗi vẫn đọc snapshot theo quyền; thêm place mới khi không validate được trả lỗi rõ.
- [ ] Route timeout không tự bịa duration; fallback chim bay có nhãn; locked item không bị gợi ý ghi đè.
- [ ] F09/F10 pass độc lập tại P01-TR với Catalog/map stub; E2E thật kiểm tại P03. Currency/đơn vị chi phí rõ; private trip không vào cache dùng chung. Không có tối ưu tuyến sâu.

Đầu ra: migrations/API/events, provider adapter, UI và ownership/concurrency/fallback tests. Rollback binary tương thích schema, refresh snapshot lỗi bằng thao tác có audit; không xóa itinerary để chữa source mismatch.
