# P05 Trip Service và bản đồ

Trạng thái: **Chưa triển khai**. Dependency: P02/P03; có thể phát triển cùng P04 sau ổn định contract. Chức năng: F09/F10.

## Công việc

- [ ] P05-01: [Trip migration](../database/trip.md), composite FK cùng trip, unique deferrable và parent concurrency.
- [ ] P05-02: Trip/segment/day CRUD, owner từ JWT, date/day policy và version trên mọi mutation.
- [ ] P05-03: Add place qua Catalog batch, lưu snapshot/version; refresh chủ động, completed trip giữ snapshot.
- [ ] P05-04: Item add/remove/reorder/note/duration/locked; reorder atomic kiểm đầy đủ item IDs; cost cùng currency.
- [ ] P05-05: Transfer cùng trip, map provider adapter/timeouts/cache/attribution; phân biệt route và khoảng cách địa lý.
- [ ] P05-06: Visibility event đánh unavailable, không tự xóa lịch trình; item-added event phục vụ history.
- [ ] P05-07: Add-from-recommendation ở P07, giữ request attribution và không tự sửa locked item.

## Contract và dữ liệu

7 bảng domain + 4 kỹ thuật. API me/trips, trip destinations/days/items/order/transfers, route-estimates, snapshot refresh. Snapshot là denormalization có owner/freshness rõ; no distributed transaction với Catalog. Publish trip.changed/item.added; consume Catalog visibility và Identity deletion/status.

Frontend: trip list/editor/day tabs, drag/drop, note/locked/budget, map nhiều điểm và route; thông báo stale snapshot/provider failure.

## Kiểm nhận

- [ ] Không thể gắn day/item/transfer của trip khác; đổi date reject nếu còn item ngoài khoảng chưa xử lý.
- [ ] Hai reorder cùng version: một 409; transaction không mất item hoặc trùng sort_order.
- [ ] Catalog lỗi vẫn đọc snapshot theo quyền; thêm place mới khi không validate được trả lỗi rõ.
- [ ] Route timeout không tự bịa duration; fallback chim bay có nhãn; locked item không bị gợi ý ghi đè.
- [ ] F09/F10 E2E pass; currency/đơn vị chi phí rõ; private trip không vào cache dùng chung. Không có tối ưu tuyến sâu.

Đầu ra: migrations/API/events, provider adapter, UI và ownership/concurrency/fallback tests. Rollback binary tương thích schema, refresh snapshot lỗi bằng thao tác có audit; không xóa itinerary để chữa source mismatch.
