# Truy vết yêu cầu và ánh xạ database nguồn

Nguồn: tài liệu Word `Chức năng + Database.docx` do người dùng cung cấp. Các tên bảng dưới đây được giữ nguyên để đối chiếu. Đây là chuyển đổi mô hình tài liệu; chưa xác nhận các bảng này tồn tại trong một database đang chạy.

## 42 bảng nguồn

| # | Bảng nguồn | Service / bảng đích | Quyết định chuyển đổi |
|---|---|---|---|
| 01 | auth.users | Identity.users | Email canonical unique, hash mật khẩu, version, trạng thái và tombstone |
| 02 | auth.roles | Identity.roles | Dùng role_code làm PK; GUEST là principal chưa đăng nhập, không seed thành role được gán |
| 03 | auth.user_roles | Identity.user_roles | PK(user_id,role_code); map role_id cũ sang code bằng mapping khi migrate |
| 04 | auth.user_preferences | Identity.user_preferences + preference_options + user_preference_options + user_category_preferences | 1–1 user; tách travel_style/food_pref nhiều giá trị; thêm consent |
| 05 | geo.geographic_units | Catalog.geographic_units | Giữ hierarchy/version và geometry; parent self-FK; chống cycle tại app |
| 06 | geo.geographic_aliases | Catalog.geographic_aliases | Alias chuẩn hóa tìm kiếm, ngôn ngữ và khoảng hiệu lực |
| 07 | tourism.destinations | Catalog.destinations | Destination độc lập đơn vị hành chính, stable UUID và trạng thái |
| 08 | tourism.destination_geo | Catalog.destination_geo | Giữ n–n nội bộ Catalog |
| 09 | tourism.places | Catalog.places + place_rating_summary | Canonical place; rating tách thành projection từ Community |
| 10 | tourism.place_aliases | Catalog.place_aliases | source_id external reference Ingestion; không cross-DB FK |
| 11 | tourism.categories | Catalog.categories | Taxonomy hierarchical; code unique; không hard-delete category đang được dùng |
| 12 | tourism.place_categories | Catalog.place_categories | PK kép nội bộ Catalog |
| 13 | tourism.tags | Catalog.tags | Bổ sung code UNIQUE |
| 14 | tourism.place_tags | Catalog.place_tags | PK kép nội bộ Catalog |
| 15 | tourism.opening_hours | Catalog.opening_hours + opening_exceptions | Nhiều ca/ngày, ngày lễ/đóng cửa, qua đêm và timezone |
| 16 | tourism.services_events | Catalog.offerings + offering_schedules | Giữ item_id thành offering_id; loại SERVICE/TOUR/EVENT/ACTIVITY/EXPERIENCE; nhiều lịch |
| 17 | ugc.media | Catalog.media_assets/place_media hoặc Community.media_assets/review_media/contribution_media; avatar → Identity.users.avatar_object_key | Phân loại owner trước migrate; binary ở object storage; owner không rõ vào quarantine |
| 18 | ugc.reviews | Community.reviews + place_rating_summaries | Một review/user/place; rating 1..5; chỉ APPROVED tính aggregate |
| 19 | ugc.favorites | Community.favorites | PK(user_id,place_id); idempotent add/remove |
| 20 | ugc.collections | Community.collections | Owner user external; visibility PRIVATE/PUBLIC |
| 21 | ugc.collection_items | Community.collection_items | Place external, PK kép và thứ tự unique deferrable |
| 22 | ugc.contributions | Community.contributions + moderation_actions | Phê duyệt tách khỏi áp dụng vào Catalog; command correlation và retry |
| 23 | business.businesses | Catalog.businesses + business_members | Owner external Identity; membership bổ sung để kiểm soát quyền business |
| 24 | business.business_place_claims | Catalog.business_place_claims | Claim nội bộ Catalog; một owner claim được duyệt/place; chứng cứ là object key private |
| 25 | business.change_requests | Catalog.change_requests | Composite FK claim/place; expected version chống ghi đè thay đổi mới |
| 26 | ingestion.data_sources | Ingestion.data_sources | Registry quyền storage/training, license version và secret reference |
| 27 | ingestion.import_jobs | Ingestion.import_jobs + import_items | Counters tính từ item result; không tăng hai lần khi retry |
| 28 | ingestion.raw_records | Ingestion.raw_records + import_items | Raw immutable theo hash; trạng thái xử lý thuộc item theo job |
| 29 | ingestion.source_place_links | Ingestion.source_place_links | UNIQUE(source_id,external_id), place_id external, chỉ cập nhật khi Catalog ack |
| 30 | ml.interactions | Intelligence.interactions | destination nullable; event_id unique; guest session pseudonymous |
| 31 | ml.dataset_versions | Intelligence.dataset_versions + dataset_sources | Snapshot checksum, schema version, lineage/license |
| 32 | ml.training_jobs | Intelligence.training_jobs | Thêm code revision, seed, reproducibility |
| 33 | ml.model_versions | Intelligence.model_versions + model_deployments | Validation tách activation; giữ lịch sử rollback |
| 34 | trip.trips | Trip.trips | Owner external, money currency, date bounds, version và soft delete |
| 35 | trip.trip_destinations | Trip.trip_destinations | Giữ segment riêng để một destination có thể ghé lại nhiều lần |
| 36 | trip.trip_days | Trip.trip_days | Composite FK đảm bảo day/segment thuộc cùng trip; date/day_no unique |
| 37 | trip.itinerary_items | Trip.itinerary_items + place_snapshots | Composite FK day/trip; snapshot place; order deferrable; bảo toàn locked |
| 38 | trip.transfer_items | Trip.transfer_items + route_estimates | Hai segment cùng trip; thời gian/khoảng cách và metadata provider |
| 39 | ops.audit_logs | audit_logs trong từng service sở hữu entity | Chia theo entity_type; unknown owner vào quarantine, không bỏ log âm thầm |
| 40 | ops.place_versions | Catalog.place_versions | Unique(place_id,version_no); snapshot/audit cùng transaction cập nhật place |
| 41 | ops.notifications | Identity.notifications + notification_deliveries | Inbox có FK local user; nguồn event unique; delivery retry |
| 42 | ops.api_error_logs | Hệ thống structured log tập trung | Giữ correlation/trace/service/error; redact PII; archive log cũ trước decommission |

## 11 nhóm chức năng

| Mã | Chức năng nguồn | Owner / phối hợp | Phase và kết quả kiểm nhận |
|---|---|---|---|
| F01 | Quản lý tài khoản | Identity | P01-ID: đăng ký/login/logout/profile/password/preferences/RBAC; cross-user access bị từ chối |
| F02 | Quản lý địa điểm | Catalog + Community projection | P01-CA/CO: list/detail/geo/media/hour/price/rating; admin create/edit/hide/archive/category |
| F03 | Dịch vụ địa phương | Catalog | P01-CA: restaurant/hotel/homestay theo category Place; tour/activity/experience/event theo Offering; có tiện ích |
| F04 | Tìm kiếm và lọc | Catalog | P01-CA: name/alias/category/region/price/rating/type; pagination ổn định |
| F05 | Basic Recommendation | Intelligence + Identity + Catalog | P01-IN: preferences, criteria, budget, category, location → điểm và Top N có giải thích |
| F06 | Review và Rating | Community → Catalog | P01-CO/CA: CRUD, moderation/report; avg/count chính xác sau sửa/xóa/ẩn/replay |
| F07 | Favorite | Community | P01-CO: add/remove/list của user; duplicate request không tạo duplicate |
| F08 | Lịch sử tương tác | Intelligence nhận client/server events | P01-IN: search/view/favorite/review/add-to-trip, consent/retention/dedup |
| F09 | Trip Management | Trip | P01-TR: CRUD/day/item/reorder/note; ownership và optimistic locking |
| F10 | Bản đồ và khoảng cách | Catalog location + Trip routing | P01-TR/CA: marker/nhiều điểm/khoảng cách/route; phân biệt đường chim bay và tuyến giao thông; chưa tối ưu sâu |
| F11 | Quản trị hệ thống | Mỗi owner, frontend admin tổng hợp | Sáu gói P01: user/business/review/place/category/event/source/data/model đúng quyền |

Các gói P01 trong bảng được triển khai và kiểm thử độc lập song song với contract fixtures; P02 kiểm liên kết thật và P03 kiểm E2E F01–F11. Khi ghi evidence, nêu rõ phạm vi service hoặc toàn hệ thống.

Collections, contributions, business claim, ingestion và ML xuất hiện trong bảng nguồn dù bảng nhóm chức năng mô tả ngắn. Bộ kế hoạch vẫn giữ chúng; checklist ML P08 thuộc luồng song song trong P01-IN, không trì hoãn Basic Recommendation. Chất lượng model thực được kiểm nhận tại P03.

## Thiết kế được bổ sung ngoài bảng nguồn

Session/token rotation, consent, notification delivery, explicit media relation, amenities, opening exception, rating projection, trip snapshot, route cache, dedup candidate, import item, feature/read model, model deployment và bốn bảng kỹ thuật/service là các phần bổ sung để thực thi yêu cầu an toàn và độc lập. Không có dịch vụ thanh toán/booking được suy diễn từ từ “tour” hay “khách sạn”.
