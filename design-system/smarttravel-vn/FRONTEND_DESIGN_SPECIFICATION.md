# TÀI LIỆU THIẾT KẾ UI/UX TOÀN DIỆN — SMARTTRAVEL VN
**Kiến trúc Giao diện, Hệ thống Điều hướng & Design System theo tiêu chuẩn UI/UX Pro Max**
*Dự án: SmartTravel VN · Nền tảng: Web (React 19, TypeScript, Vite) · Múi giờ: Asia/Ho_Chi_Minh*

---

## 1. TỔNG QUAN KIẾN TRÚC GIAO DIỆN & PHÂN QUYỀN (4 KHU VỰC)

Hệ thống giao diện của **SmartTravel VN** được chuẩn hóa thành **4 phân vùng chức năng (Zones)** với không gian làm việc và vai trò chuyên biệt, nhưng dùng chung một ngôn ngữ thiết kế (Design Tokens) đồng nhất:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SMARTTRAVEL VN PLATFORM                               │
├─────────────────────┬─────────────────────┬───────────────────┬─────────────────┤
│  1. KHU VỰC KHÁCH   │  2. NGƯỜI DÙNG CÁ   │  3. DOANH NGHIỆP  │ 4. QUẢN TRỊ &   │
│   (GUEST / PUBLIC)  │  NHÂN (TRAVELER)    │ (BUSINESS PORTAL) │   KIỂM DUYỆT    │
├─────────────────────┼─────────────────────┼───────────────────┼─────────────────┤
│ • Truy cập tự do    │ • Đăng nhập thường  │ • Đối tác / chủ   │ • Quản trị viên │
│ • Trang chủ & khám  │ • Lên kế hoạch      │   địa điểm du lịch│   & kiểm duyệt  │
│   phá du lịch       │   chuyến đi         │ • Quản lý dịch vụ │ • Quản lý data  │
│ • Xem chi tiết & map│ • Đánh giá, lưu trữ │   & claim địa điểm│   & AI model    │
│ • Xác thực tài khoản│ • Trọng tâm cốt lõi │ • Gửi minh chứng  │ • Xử lý vi phạm │
└─────────────────────┴─────────────────────┴───────────────────┴─────────────────┘
```

### 1.1. Ma trận điều hướng & Bố cục khung (Layout Shells)

| Khu vực | Bố cục chính (Layout Shell) | Menu Header / Điều hướng | Mobile Navigation |
|---|---|---|---|
| **1. Khách** | **Marketing & Discovery Shell** (Header nổi kính mờ, Full-width Hero, Content Bento) | `Trang chủ` · `Khám phá` · `Bộ sưu tập` · `Đăng nhập / Đăng ký` | Bottom bar tinh gọn (Khám phá, Tìm kiếm, Đăng nhập) |
| **2. Người dùng** | **Traveler App Shell** (Header ứng dụng, Split-view linh hoạt, Quick drawer) | **6 mục:** `Khám phá` · `Yêu thích` · `Bộ sưu tập` · `Chuyến đi` · `Thông báo` · `Tài khoản` | Bottom navigation bar 5 tab + Floating Action Button (FAB) |
| **3. Doanh nghiệp** | **Business Partner Shell** (Sidebar trái collapsible, Workspace header với context switcher) | **6 mục:** `Hồ sơ` · `Thành viên` · `Xác minh` · `Địa điểm` · `Dịch vụ` · `Yêu cầu` | Top App bar + Offcanvas Drawer |
| **4. Quản trị & Kiểm duyệt** | **Admin Console Shell** (Dense Dashboard Sidebar, Status pills, Quick filter bar) | **7 mục:** `Người dùng` · `Địa điểm` · `Danh mục/địa giới` · `Kiểm duyệt` · `Doanh nghiệp` · `Nhập dữ liệu` · `AI` | Responsive Drawer hoặc Desktop-first layout |

---

## 2. MA TRẬN PHÂN LOẠI MÀN HÌNH: TRANG (PAGE) vs THẺ (TAB) vs HỘP THOẠI (MODAL/DRAWER)

Để tránh tình trạng phân mảnh URL, gián đoạn trải nghiệm người dùng và chuyển trang liên tục (page thrashing), toàn bộ danh sách chức năng được quy hoạch tối ưu:

| Khu vực | Tên màn hình / Thao tác nghiệp vụ | Phân loại hiển thị | Vị trí / Tuyến đường (Route / Context) | Lý do UX & Hành vi |
|---|---|---|---|---|
| **1. Khách** | **Trang chủ** | **Trang (Page)** | `/` | Trải nghiệm visual storytelling, giới thiệu cảm hứng, tìm kiếm nhanh |
| | **Khám phá / tìm kiếm địa điểm** | **Trang (Page)** | `/explore` (hoặc `/app` tab Khám phá) | Split-view: Danh sách thẻ bên trái (45%) và Bản đồ OSM tương tác bên phải (55%) |
| | **Chi tiết địa điểm** | **Trang / Drawer** | `/places/:id` (hoặc Slide-over Panel trên map) | Hiển thị full thông tin, media gallery, giờ mở cửa, tiện ích, review |
| | **Bản đồ địa điểm** | **Tích hợp (Integrated)** | Nhúng trong Khám phá & Chi tiết | Không tách riêng thành trang trống; bản đồ tương tác đồng bộ dữ liệu |
| | **Chi tiết dịch vụ / tour / sự kiện** | **Hộp thoại (Modal) / Thẻ** | Tab trong Chi tiết địa điểm hoặc Modal `/offerings/:id` | Xem thông tin giá, lịch trình tour, đơn vị tổ chức mà không mất ngữ cảnh địa điểm |
| | **Bộ sưu tập công khai** | **Trang (Page)** | `/collections/public` & `/collections/:id` | Khám phá cẩm nang, lịch trình do cộng đồng chia sẻ |
| | **Đăng nhập** | **Modal / Trang fallback** | Modal overlay toàn site hoặc `/login` | Giữ nguyên vị trí người dùng đang duyệt; đăng nhập xong tiếp tục thao tác ngay |
| | **Đăng ký** | **Modal / Tab Auth** | Chuyển đổi tab trong Auth Modal hoặc `/register` | Form tinh gọn 3 trường (email, password, tên hiển thị), thông báo kích hoạt |
| | **Xác minh email** | **Trang trạng thái (Page)** | `/verify-email?token=...` | Thông báo kết quả xác nhận token rõ ràng, nút điều hướng về Đăng nhập |
| | **Quên / Đặt lại mật khẩu** | **Modal / Trang fallback** | Modal tab hoặc `/forgot-password`, `/reset-password` | Nhận email reset link và nhập mật khẩu mới có kiểm tra độ mạnh |
| **2. Người dùng** | **Hồ sơ cá nhân** | **Thẻ (Tab)** | Tab trong menu `Tài khoản` (`/me/profile`) | Cập nhật tên hiển thị, avatar, email liên hệ, xem cấp độ thành viên |
| | **Bảo mật tài khoản** | **Thẻ (Tab)** | Tab trong menu `Tài khoản` (`/me/security`) | Đổi mật khẩu, xem danh sách thiết bị/phiên hoạt động, nút thu hồi phiên từ xa |
| | **Sở thích và quyền riêng tư** | **Thẻ (Tab)** | Tab trong menu `Tài khoản` (`/me/preferences`) | Chọn tag du lịch yêu thích, bật/tắt cá nhân hóa gợi ý AI (có consent version) |
| | **Xóa tài khoản** | **Hộp thoại xác nhận nguy hiểm (Dialog)** | Trigger từ tab Bảo mật | Modal xác nhận 2 lớp, cảnh báo hủy dữ liệu liên service theo chuẩn GDPR |
| | **Thông báo** | **Trang + Popover** | Dropdown ở Header + Trang đầy đủ `/me/notifications` | Danh sách thông báo trạng thái, nút "Đánh dấu đã đọc", filter đã đọc/chưa đọc |
| | **Địa điểm yêu thích** | **Trang (Page)** | Menu `Yêu thích` (`/me/favorites`) | Grid card các địa điểm đã lưu (tim), nút "Thêm vào chuyến đi" nhanh |
| | **Đánh giá của tôi** | **Thẻ (Tab)** | Tab trong `Tài khoản` hoặc `Yêu thích` | Xem lịch sử đánh giá đã gửi, trạng thái kiểm duyệt (Chờ duyệt, Đã duyệt, Bị từ chối) |
| | **Viết / sửa đánh giá** | **Hộp thoại (Modal)** | Modal mở từ Chi tiết địa điểm | Đánh giá sao 1-5, textarea cảm nhận, upload ảnh minh họa |
| | **Báo cáo nội dung** | **Hộp thoại (Modal)** | Modal mở từ icon cờ báo cáo | Chọn danh mục vi phạm (spam, thông tin sai, xúc phạm), mô tả ngắn |
| | **Bộ sưu tập của tôi** | **Trang (Page)** | Menu `Bộ sưu tập` (`/me/collections`) | Danh sách album địa điểm cá nhân, tag Công khai/Riêng tư, nút tạo mới |
| | **Chi tiết / sửa bộ sưu tập** | **Drawer / Trang con** | `/me/collections/:id` | Sắp xếp thứ tự địa điểm bằng drag-and-drop, thêm ghi chú cho từng điểm |
| | **Đóng góp của tôi** | **Thẻ (Tab)** | Tab trong menu `Tài khoản` (`/me/contributions`) | Theo dõi đề xuất địa điểm mới / sửa đổi, trạng thái (Chờ duyệt, Đã áp dụng) |
| | **Tạo / sửa đóng góp** | **Drawer (Ngăn trượt)** | Offcanvas Drawer mở từ Chi tiết địa điểm / Nút (+) | Form đề xuất sửa thông tin địa điểm (giờ mở cửa, tọa độ, tiện ích) có preview diff |
| | **Danh sách chuyến đi** | **Trang (Page)** | Menu `Chuyến đi` (`/me/trips`) | Thẻ các chuyến đi (Sắp tới, Đang đi, Đã qua), thanh tiến độ, ngân sách |
| | **Tạo / sửa thông tin chuyến đi**| **Hộp thoại (Modal)** | Modal mở khi click "+ Tạo chuyến đi mới" | Nhập tên chuyến đi, ngày bắt đầu - kết thúc, điểm đến, ngân sách dự trù |
| | **Chi tiết / biên tập lịch trình**| **Trang chuyên sâu (Studio Page)** | `/me/trips/:id/editor` | **Giao diện cốt lõi**: Timeline nhiều ngày, Kanban/List địa điểm, nút Khóa/Mở |
| | **Chặng di chuyển** | **Thẻ / Panel tích hợp** | Panel trong Biên tập lịch trình | Xem ước tính khoảng cách, thời gian di chuyển giữa các điểm bằng OSM route |
| | **Gợi ý địa điểm (khi bật AI)** | **Drawer gợi ý thông minh** | Panel trượt bên phải màn Biên tập lịch trình | Danh sách gợi ý kèm điểm số phù hợp (Score), nút "1-Click chèn vào ngày X" |
| **3. Doanh nghiệp** | **Doanh nghiệp của tôi** | **Trang (Page)** | Menu `Hồ sơ` (`/biz`) | Danh sách tổ chức tham gia, role (Owner/Manager/Staff), trạng thái pháp lý |
| | **Hồ sơ doanh nghiệp** | **Thẻ (Tab)** | Tab trong `/biz/profile` | Tên công ty, MST, địa chỉ trụ sở, hotline, logo, giấy phép kinh doanh |
| | **Thành viên doanh nghiệp** | **Thẻ (Tab)** | Tab trong `/biz/members` | Danh sách thành viên, mời qua email, phân quyền quản trị |
| | **Xác minh doanh nghiệp** | **Thẻ / Hộp thoại** | Tab `/biz/verification` | Upload minh chứng (evidence keys), theo dõi tiến độ xét duyệt KYC |
| | **Yêu cầu quản lý địa điểm** | **Hộp thoại (Modal) / Wizard** | Modal mở từ danh sách Địa điểm | Tìm địa điểm trên hệ thống, nhập minh chứng chủ sở hữu (hợp đồng, hóa đơn) |
| | **Địa điểm đang quản lý** | **Trang (Page)** | Menu `Địa điểm` (`/biz/places`) | Danh sách địa điểm đã được duyệt quyền quản lý, trạng thái hoạt động |
| | **Đề xuất cập nhật địa điểm**| **Drawer / Trang con** | `/biz/places/:id/edit` | Cập nhật giờ mở cửa, giá vé, tiện ích, ảnh đại diện, menu dịch vụ |
| | **Lịch sử yêu cầu thay đổi** | **Thẻ (Tab)** | Tab trong `/biz/requests` | Theo dõi các request update, lý do từ chối nếu có, phiên bản đối soát |
| | **Quản lý dịch vụ / tour / sự kiện**| **Trang (Page)** | Menu `Dịch vụ` (`/biz/offerings`) | CRUD các gói tour, trải nghiệm, voucher, sự kiện gắn với địa điểm quản lý |
| **4. Quản trị & Kiểm duyệt**| **Quản lý người dùng** | **Trang (Page)** | `/admin/users` | Danh sách tài khoản, tìm kiếm, xem role, thao tác khóa/mở, audit log |
| | **Quản lý địa điểm** | **Trang (Page)** | `/admin/places` | Toàn quyền kiểm soát kho POI, đổi trạng thái (Draft, Published, Hidden, Archived) |
| | **Quản lý địa giới & taxonomy** | **Trang (Page)** | `/admin/geography` & `/admin/taxonomy` | Cây phân cấp hành chính (Tỉnh/Thành/Quận/Huyện), danh mục du lịch, bộ tiện ích |
| | **Quản lý dịch vụ / tour / sự kiện**| **Trang (Page)** | `/admin/offerings` | Giám sát toàn bộ offering trên hệ thống, duyệt công khai hoặc hạ dịch vụ vi phạm |
| | **Kiểm duyệt media** | **Trang kiểm duyệt (Console)** | Tab trong `/admin/moderation/media` | Grid ảnh/video chờ duyệt, công cụ zoom, gắn nhãn vi phạm hoặc duyệt hàng loạt |
| | **Kiểm duyệt đánh giá / báo cáo**| **Trang kiểm duyệt (Console)** | Tab trong `/admin/moderation/reviews` | Bảng đối soát review bị report, lý do vi phạm, nút Duyệt / Ẩn / Khôi phục |
| | **Duyệt đóng góp địa điểm** | **Trang đối chiếu Diff** | Tab trong `/admin/moderation/contributions` | Giao diện Split-diff so sánh dữ liệu hiện tại vs dữ liệu người dùng đề xuất |
| | **Duyệt xác minh doanh nghiệp** | **Trang kiểm duyệt KYC** | Tab trong `/admin/businesses/verifications` | Xem hồ sơ pháp lý, mã minh chứng, quyết định Phê duyệt / Từ chối / Thu hồi |
| | **Duyệt quyền quản lý địa điểm** | **Trang kiểm duyệt Claim** | Tab trong `/admin/businesses/claims` | Xét duyệt quyền sở hữu địa điểm của doanh nghiệp theo hồ sơ pháp lý |
| | **Duyệt yêu cầu thay đổi địa điểm**| **Trang đối chiếu Diff** | Tab trong `/admin/businesses/updates` | So sánh thay đổi thông tin giờ/giá/tiện ích từ doanh nghiệp và apply atomic |
| | **Quản lý nguồn nhập dữ liệu** | **Trang (Page)** | `/admin/ingestion/sources` | Cấu hình crawler/API đối tác, giấy phép dữ liệu, chính sách bản quyền |
| | **Danh sách / chi tiết job nhập** | **Trang (Page)** | `/admin/ingestion/jobs` | Giám sát tiến độ job (FULL/INCREMENTAL/REPLAY), số bản ghi thành công/lỗi |
| | **Bản ghi lỗi / chờ đối sánh** | **Trang đối soát (Review Queue)**| `/admin/ingestion/quarantine` | Xử lý các POI bị trùng lặp mơ hồ (Ambiguous), quyết định tạo mới hoặc gộp điểm |
| | **Quản lý dataset — khi bật AI** | **Trang (Page)** | `/admin/ai/datasets` | Quản lý snapshot tập dữ liệu huấn luyện, kiểm tra checksum & consent |
| | **Job huấn luyện — khi bật AI** | **Trang (Page)** | `/admin/ai/training` | Khởi chạy pipeline huấn luyện mô hình gợi ý, theo dõi loss/metrics thời gian thực |
| | **Quản lý model — khi bật AI** | **Trang (Page)** | `/admin/ai/models` | Bảng điều khiển phiên bản model (Canary/Active), Deploy hoặc Rollback tức thì |

---

## 3. THIẾT KẾ DESIGN SYSTEM (AURORA UI — SMARTTRAVEL VN)

Được cấu hình chuẩn từ `ui-ux-pro-max`, tối ưu hóa đặc thù cho nền tảng Du lịch Việt Nam:

### 3.1. Bảng màu Semantic Tokens & Độ tương phản WCAG 4.5:1

```css
:root {
  /* Brand Primary: Cam phiêu lưu ấm áp (Adventure Orange) */
  --color-primary: #EA580C;
  --color-primary-hover: #C2410C;
  --color-primary-light: #FFEDD5;
  --color-on-primary: #FFFFFF;

  /* Brand Secondary: Xanh ngọc biển đảo & bản đồ (Map Teal) */
  --color-secondary: #0891B2;
  --color-secondary-hover: #0E7490;
  --color-secondary-light: #CFFAFE;
  --color-on-secondary: #FFFFFF;

  /* Accent & Action (CTA): Vàng nắng miền Trung */
  --color-accent: #D97706;
  --color-accent-hover: #B45309;
  --color-on-accent: #FFFFFF;

  /* Neutrals: Nền ấm cát trắng & Chữ than đá chống mỏi mắt */
  --color-background: #FDFBF7;        /* Nền tổng thể ấm áp */
  --color-surface: #FFFFFF;           /* Nền thẻ / Card */
  --color-surface-subtle: #F8F5EE;    /* Nền phụ / Khối lọc */
  --color-foreground: #0F172A;        /* Chữ chính (Độ tương phản > 12:1) */
  --color-foreground-muted: #475569;  /* Chữ phụ (Độ tương phản > 5.5:1) */
  --color-border: #EADBCC;           /* Viền ngăn cách nhẹ */
  --color-border-hover: #CBD5E1;

  /* Trạng thái nghiệp vụ */
  --color-success: #15803D;
  --color-success-bg: #DCFCE7;
  --color-warning: #B45309;
  --color-warning-bg: #FEF3C7;
  --color-destructive: #DC2626;
  --color-destructive-bg: #FEE2E2;
  --color-on-destructive: #FFFFFF;

  /* Rings & Focus accessibility */
  --color-ring: #EA580C;
  --focus-ring: 0 0 0 3px rgba(234, 88, 12, 0.25);
}
```

### 3.2. Hệ thống Typography tiếng Việt (Vietnamese Typography Hierarchy)

Dùng font chữ chuyên dụng có dấu tròn trịa, hiển thị thanh lịch, không bị lỗi dấu:
- **Heading Family:** `Be Vietnam Pro` (Weights: 600 SemiBold, 700 Bold, 800 ExtraBold)
- **Body & Data Family:** `Noto Sans` / `Inter` (Weights: 400 Regular, 500 Medium)

| Cấp bậc (Scale) | Kích thước / Line-height | Font-weight | Ứng dụng |
|---|---|---|---|
| **Display 1** | `48px` / `1.15` | `800` | Tiêu đề Hero Trang chủ |
| **Heading 1** | `32px` / `1.25` | `700` | Tiêu đề chính màn hình (Khám phá, Chuyến đi, Chi tiết) |
| **Heading 2** | `24px` / `1.3` | `700` | Tiêu đề khối / Section headers / Tên địa điểm |
| **Heading 3** | `18px` / `1.4` | `600` | Tiêu đề Card, Header Modal, Thẻ ngày lịch trình |
| **Body Large** | `16px` / `1.6` | `400` | Mô tả giới thiệu, đoạn văn bài viết |
| **Body Default** | `14px` / `1.5` | `400 / 500`| Nội dung form, danh sách thông số, địa chỉ |
| **Caption / Tag**| `12px` / `1.4` | `600` | Tag danh mục, nhãn trạng thái (Pills), thời gian |

### 3.3. Quy tắc Hiển thị Icon & Tránh Anti-pattern

- **Nghiêm cấm Emoji làm icon**: Toàn bộ icon sử dụng SVG đồng nhất nét vẽ (Lucide Icons hoặc Heroicons phong cách outline 1.75px).
- **Phản hồi tương tác (Micro-feedback)**: Mọi phần tử click được đều có `cursor: pointer`, hiệu ứng hover êm ái `150ms-200ms ease`, scale tối đa `1.02` (không gây giật layout CLS).
- **Khả năng tiếp cận (Accessibility - a11y)**:
  - Vùng chạm tối thiểu `44x44px` trên thiết bị di động.
  - Phím Tab điều hướng tuần tự có `focus-visible ring` màu cam thương hiệu.
  - Hỗ trợ `prefers-reduced-motion: reduce` tự động chuyển các animation phức tạp về fade đơn giản.

---

## 4. CHI TIẾT THIẾT KẾ CÁC KHU VỰC VÀ MÀN HÌNH CHỦ ĐẠO

### 4.1. KHU VỰC 1: KHÁCH CHƯA ĐĂNG NHẬP (GUEST EXPERIENCE)

#### Màn hình 1: Trang chủ (Landing Page)
- **Cấu trúc:**
  1. *Header mờ kính (Glassmorphic Navigation)*: Logo SmartTravel VN, menu anchor (`Khám phá`, `Lịch trình mẫu`, `Cộng đồng`), nút CTA `Bắt đầu chuyến đi`, nút `Đăng nhập`.
  2. *Hero Section (Storytelling)*: Câu thông điệp "Việt Nam mình, đi đâu cũng thương", hình ảnh phong cảnh chất lượng cao (Vịnh Hạ Long, Hội An, Sa Pa), thanh tìm kiếm nhanh tích hợp (Đi đâu? Ngày nào? Thể loại gì?).
  3. *Quick Filter Bar*: Bộ tag danh mục chạm nhanh (Biển đảo, Vùng cao, Ẩm thực, Di sản, Nghỉ dưỡng).
  4. *Cụm địa điểm thịnh hành (Trending Bento Grid)*: Thẻ địa điểm nổi bật kèm đánh giá sao, khu vực, khoảng giá tham khảo.
  5. *Lịch trình mẫu tạo cảm hứng (Curated Itineraries)*: 3 gói lịch trình mẫu 2N1Đ, 3N2Đ với nút "Tùy biến lịch trình này".
  6. *Footer*: Bản đồ liên kết, điều khoản chính sách, thông tin bản quyền và nguồn dữ liệu OpenStreetMap.

#### Màn hình 2 & 3: Khám phá & Bản đồ địa điểm (Interactive Explorer & Map)
- **Thiết kế Split-View hiện đại (Desktop) & Floating Sheet (Mobile)**:
  - **Cột trái (45% chiều rộng)**:
    - Thanh tìm kiếm từ khóa với debounce 300ms.
    - Thanh lọc đa tiêu chí (Drawer bộ lọc nâng cao): Tỉnh/Thành phố (Miền Bắc/Trung/Nam), Danh mục, Khoảng giá, Tiện ích (wifi, bãi đỗ xe, thanh toán thẻ), Khoảng cách radius (1km, 5km, 20km).
    - Danh sách kết quả phân trang bằng Keyset Cursor (`Xem thêm` hoặc Infinite Scroll mượt mà).
    - Mỗi Card địa điểm có: Thumbnail tỷ lệ 16:9, Tên địa điểm, Đánh giá sao & số lượng review, Địa chỉ rút gọn, Tag tiện ích, Nút lưu yêu thích (yêu cầu login), Nút "Thêm vào lịch trình".
  - **Cột phải (55% chiều rộng)**:
    - Bản đồ OpenStreetMap tương tác toàn màn hình.
    - Custom Marker ghim các địa điểm kèm giá/icon danh mục.
    - Khi click vào marker hoặc hover card tương ứng, bản đồ pan mượt mà và hiển thị **Mini Preview Card** (Tên, Ảnh nhỏ, Nút xem chi tiết).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo SmartTravel]   [Khám phá] [Lịch trình] [Bộ sưu tập]         [Đăng nhập] [Đăng ký]│
├────────────────────────────────────────┬───────────────────────────────────────────────┤
│ 🔍 [Tìm kiếm: "Cà phê phố cổ"...    ] │                                               │
│ Bộ lọc: [Miền Trung ▼] [Ẩm thực ▼] [Giá ▼]│             BẢN ĐỒ TƯƠNG TÁC                  │
├────────────────────────────────────────┤              OPENSTREETMAP                    │
│ ┌────────────────────────────────────┐ │                                               │
│ │ [Ảnh]  Cà phê Trầm Hội An          │ │                    📍 [Cà phê Trầm]           │
│ │ ⭐ 4.8 (124 đánh giá) · 45.000đ   │ │                                               │
│ │ 📍 12 Bạch Đằng, Hội An           │ │                                               │
│ │ [Thêm vào chuyến đi] [Xem chi tiết]│ │             📍 [Bánh Mì Phượng]               │
│ └────────────────────────────────────┘ │                                               │
│ ┌────────────────────────────────────┐ │                                               │
│ │ [Ảnh]  Bánh Mì Phượng               │ │                                               │
│ │ ⭐ 4.6 (890 đánh giá) · 35.000đ   │ │                                               │
│ │ 📍 2B Phan Châu Trinh, Hội An      │ │                                               │
│ └────────────────────────────────────┘ │ [ + ] Phóng to                                │
│ [Xem thêm địa điểm khác...]            │ [ - ] Thu nhỏ                                 │
└────────────────────────────────────────┴───────────────────────────────────────────────┘
```

#### Màn hình 4 & 5: Chi tiết địa điểm & Tab Dịch vụ / Tour / Sự kiện
- **Bố cục Hero Gallery**: Khối ảnh chính lớn + lưới thumbnail media; nút xem toàn bộ ảnh dạng Modal Lightbox.
- **Thanh tóm tắt nhanh (Quick Info Strip)**: Điểm đánh giá trung bình, Giờ hoạt động hôm nay (Hiển thị badge `Đang mở cửa` xanh lá hoặc `Đã đóng cửa` đỏ nhạt), Mức giá dao động, Tọa độ GPS.
- **Hệ thống Tab nội dung**:
  - *Tab 1: Tổng quan & Tiện ích*: Giới thiệu địa điểm, bảng tiện ích có sẵn (icon SVG: Wifi, Máy lạnh, Chỗ đậu xe hơi, Chấp nhận thú cưng), địa chỉ đầy đủ kèm chỉ đường.
  - *Tab 2: Dịch vụ & Tour trải nghiệm*: Danh sách các Offering đang mở bán/tổ chức tại địa điểm (Tên tour, Thời lượng, Giá người lớn/trẻ em, Đơn vị tổ chức đã xác minh).
  - *Tab 3: Đánh giá cộng đồng*: Điểm số chi tiết, danh sách nhận xét có phân loại sao, ảnh review thực tế từ du khách.
- **Floating Action Bar (Thanh cố định cuối trang)**:
  - Giá tham khảo.
  - Nút `Lưu yêu thích` (Icon tim có animation).
  - Nút Primary CTA: `Thêm vào chuyến đi` (Mở modal chọn chuyến đi hiện có hoặc tạo mới).

#### Màn hình 6: Bộ sưu tập công khai
- Danh sách tuyển tập du lịch theo chủ đề ("Top 10 quán rooftop ngắm hoàng hôn Đà Nẵng", "Cẩm nang 48h ăn sập Hải Phòng").
- Chi tiết bộ sưu tập: Hiển thị tác giả, ngày cập nhật, danh sách các chặng dừng chân kèm ghi chú riêng của tác giả.

#### Màn hình 7 - 10: Luồng Xác thực Khách (Auth Flows)
- **Triển khai dưới dạng Auth Modal đa năng**:
  - *Tab Đăng nhập*: Email + Password, nút xem/ẩn mật khẩu, checkbox "Ghi nhớ đăng nhập", link "Quên mật khẩu?".
  - *Tab Đăng ký*: Tên hiển thị + Email + Mật khẩu (có thước đo độ mạnh: Ít nhất 12 ký tự, số, ký tự đặc biệt).
  - *Màn hình Xác minh Email (`/verify-email`)*: Nhận token từ query param; hiển thị spinner kiểm tra; nếu hợp lệ hiện hoạt ảnh thành công (Checkmark xanh) và nút "Đăng nhập ngay"; nếu hết hạn hiển thị nút "Gửi lại email xác nhận".
  - *Màn hình Quên / Đặt lại mật khẩu*: Form nhập email nhận link -> Màn đặt mật khẩu mới với xác nhận mật khẩu 2 lần.

---

### 4.2. KHU VỰC 2: NGƯỜI DÙNG ĐÃ ĐĂNG NHẬP (TRAVELER WORKSPACE)

Trọng tâm thiết kế: Tối ưu **Core Loop** của khách du lịch:
`Khám phá` ➔ `Xem chi tiết địa điểm` ➔ `Thêm vào chuyến đi` ➔ `Biên tập & Tinh chỉnh lịch trình`.

#### Menu Điều hướng chuẩn của Người dùng (6 Mục chính):
```
[ Khám phá ] · [ Yêu thích ] · [ Bộ sưu tập ] · [ Chuyến đi ] · [ Thông báo ] · [ Tài khoản ]
```

#### Trọng tâm Cốt lõi: Màn hình Biên tập Lịch trình (`/me/trips/:id/editor`)
Đây là màn hình giàu tương tác nhất, được thiết kế theo dạng **Trip Planner Studio (3 Cột chuyên nghiệp)**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Quay lại danh sách | CHUYẾN ĐI: HÀ NỘI - ĐÀ NẴNG (3 Ngày 2 Đêm)     [Lưu] [Chia sẻ]  │
│ Ngân sách: 5.000.000 đ | Trạng thái: Đang lên lịch                    [ + Thêm ngày ]  │
├───────────────┬────────────────────────────────────────┬───────────────────────────────┤
│ CỘT 1: CÁC NGÀY│ CỘT 2: TIMELINE CHI TIẾT CỦA NGÀY      │ CỘT 3: BẢN ĐỒ & GỢI Ý ĐIỂM ĐẾN│
├───────────────┼────────────────────────────────────────┼───────────────────────────────┤
│ [Ngày 1: 24/10]│ NGÀY 1 (Hội An hoài niệm)              │ [Bản đồ OSM lộ trình Ngày 1]  │
│ 3 địa điểm    │ ────────────────────────────────────── │ 🚩 Điểm 1 ➔ 🚩 Điểm 2 ➔ 🚩 Điểm 3│
│               │ 08:30 - Bánh Mì Phượng                 │ Ước tính: 18.5 km · 42 phút xe│
│ [Ngày 2: 25/10]│   ⏱ 45 phút · 📍 Phố Cổ                │ ───────────────────────────── │
│ 4 địa điểm    │   [🔒 Đã khóa giờ] [⋮ Thao tác]        │ 💡 GỢI Ý PHÙ HỢP (AI / POPULAR)│
│               │      ⬇ 🚗 Di chuyển: 12 phút (4.2 km)  │ • Quán Cà Phê Rêu Phố Cổ      │
│ [Ngày 3: 26/10]│ 10:00 - Chùa Cầu & Đi bộ phố cổ        │   ⭐ 4.7 · Tiện đường ghé     │
│ 2 địa điểm    │   ⏱ 90 phút · 📍 Đường Trần Phú        │   [ + Chèn sau Bánh Mì Phượng]│
│               │      ⬇ 🚶 Đi bộ: 5 phút                │ • Show Ký Ức Hội An           │
│               │ 12:00 - Cơm Gà Bà Buội                 │   ⭐ 4.9 · Phù hợp buổi tối   │
│               │   ⏱ 60 phút · [🔓 Tự do sắp xếp]       │   [ + Thêm vào lịch trình]    │
│               │ ────────────────────────────────────── │                               │
│               │ [ + Thêm địa điểm vào ngày này ]       │                               │
└───────────────┴────────────────────────────────────────┴───────────────────────────────┘
```

- **Tính năng độc quyền trong Biên tập Lịch trình**:
  - **Khóa mục lịch trình (Locking)**: Cho phép người dùng khóa cứng những điểm bắt buộc (ví dụ: giờ bay, giờ check-in khách sạn, giờ xem show ca nhạc); các điểm mở khóa (unlocked) có thể tự do kéo thả đổi thứ tự.
  - **Tích hợp Chặng di chuyển (Route Segments)**: Giữa 2 điểm đến tự động tính toán khoảng cách và thời gian di chuyển (qua router/OSM), cảnh báo nếu khoảng cách di chuyển quá xa trong khung giờ ngắn.
  - **Gợi ý AI thông minh (Smart Drawer)**: Khi bật AI, hệ thống tự động nhận biết khoảng trống trong lịch trình (ví dụ: trống lịch từ 14:00 - 16:00 tại Hội An) để gợi ý các địa điểm liền kề tối ưu lộ trình.
  - **Kiểm soát phiên bản & Concurrency (If-Match)**: Khi nhiều tab mở hoặc đồng biên tập, mọi thao tác lưu gửi version hiện tại; nếu có conflict (409), hiển thị hộp thoại so sánh thay đổi để người dùng chọn giữ phiên bản nào, không làm mất ghi chú của chuyến đi.

#### Các Màn hình & Modal hỗ trợ của Người dùng:
1. **Modal "Thêm vào chuyến đi" (Quick Add Modal)**:
   - Mở ngay khi người dùng bấm nút "Thêm vào chuyến đi" từ bất kỳ card địa điểm nào ở trang Khám phá.
   - Chọn chuyến đi trong danh sách -> Chọn ngày tham quan cụ thể (Ngày 1, Ngày 2...) -> Nhập thời lượng dự kiến (mặc định 60 phút) -> Bấm "Xác nhận thêm".
2. **Modal "Viết / Sửa đánh giá" (Review Modal)**:
   - Chấm điểm sao 1-5 (hover hiệu ứng sao lấp lánh).
   - Textarea cảm nhận trải nghiệm (tối đa 1024 ký tự).
   - Đính kèm hình ảnh minh chứng.
   - Thông báo rõ ràng: "Đánh giá của bạn sẽ được gửi tới bộ phận kiểm duyệt trước khi hiển thị công khai".
3. **Modal "Báo cáo nội dung" (Report Dialog)**:
   - Radio chọn lý do: *Thông tin không chính xác*, *Địa điểm đã đóng cửa*, *Nội dung xúc phạm / nhạy cảm*, *Spam / Quảng cáo trái phép*.
   - Ô nhập chi tiết bổ sung -> Gửi báo cáo với mã trace ID hỗ trợ.
4. **Màn hình "Tài khoản" (Account Hub)**:
   - Sử dụng bố cục **Vertical Tabs**:
     - *Tab 1: Hồ sơ cá nhân* (Tên, avatar, email).
     - *Tab 2: Bảo mật & Phiên* (Đổi mật khẩu, danh sách thiết bị đang login kèm nút "Đăng xuất khỏi thiết bị này").
     - *Tab 3: Sở thích & Quyền riêng tư* (Chọn thể loại du lịch thích, checkbox đồng ý cá nhân hóa AI kèm ngày hiệu lực consent; nút thu hồi consent).
     - *Tab 4: Đánh giá & Đóng góp của tôi* (Bảng theo dõi các đóng góp địa điểm và review đã gửi, trạng thái Chờ duyệt / Đã duyệt / Bị từ chối).
     - *Vùng nguy hiểm: Yêu cầu xóa tài khoản* (Cảnh báo hậu quả, xác nhận checkbox, gửi yêu cầu xóa và tự động thu hồi phiên).

---

### 4.3. KHU VỰC 3: DOANH NGHIỆP (BUSINESS PARTNER PORTAL)

Dành cho các chủ homestay, khách sạn, nhà hàng, đơn vị lữ hành quản lý địa điểm và dịch vụ của mình.

#### Menu Điều hướng Doanh nghiệp (6 Mục chính):
```
[ Hồ sơ ] · [ Thành viên ] · [ Xác minh ] · [ Địa điểm ] · [ Dịch vụ ] · [ Yêu cầu ]
```

#### Thiết kế chi tiết các phân hệ Doanh nghiệp:
1. **Hồ sơ & Thành viên (`/biz/profile`, `/biz/members`)**:
   - Quản lý danh sách doanh nghiệp mà tài khoản tham gia (hỗ trợ chuyển đổi giữa nhiều doanh nghiệp nếu có).
   - Bảng phân quyền thành viên: `Owner` (Chủ sở hữu), `Manager` (Quản lý), `Staff` (Nhân viên vận hành).
   - Nút mời thành viên mới bằng email với hạn phân quyền.
2. **Xác minh doanh nghiệp (`/biz/verification`)**:
   - Quy trình KYC doanh nghiệp: Tải lên giấy phép ĐKKD, giấy tờ pháp lý.
   - Hiển thị tiến trình trực quan: `Chờ nộp hồ sơ` ➔ `Đang xét duyệt` ➔ `Đã xác minh` (Được cấp huy hiệu Verified xanh) hoặc `Cần bổ sung hồ sơ`.
3. **Yêu cầu quản lý địa điểm & Địa điểm đang quản lý (`/biz/places`)**:
   - Tra cứu địa điểm trên hệ thống SmartTravel VN.
   - Gửi yêu cầu Claim quyền quản lý kèm tài liệu chứng minh sở hữu (Hợp đồng thuê, giấy tờ pháp lý kinh doanh tại địa chỉ đó).
   - Danh sách địa điểm đã được duyệt quyền quản lý: Xem số lượt xem (Place views), số lượt lưu yêu thích, điểm rating trung bình.
4. **Đề xuất cập nhật địa điểm (`/biz/places/:id/edit`)**:
   - Form chỉnh sửa chuyên sâu: Khung giờ hoạt động theo từng thứ trong tuần, bảng giá vé/thực đơn, danh sách tiện ích chính xác, bộ ảnh đại diện độ nét cao.
   - Khi submit, hệ thống ghi nhận dưới dạng Change Proposal và chuyển sang ban kiểm duyệt duyệt nhanh.
5. **Quản lý Dịch vụ / Tour / Sự kiện (`/biz/offerings`)**:
   - Danh sách các Offering gắn với từng địa điểm.
   - Form tạo Offering: Tiêu đề tour/dịch vụ, mô tả trải nghiệm, thời gian bắt đầu - kết thúc, giá niêm yết, số lượng chỗ tối đa, trạng thái (Active / Inactive).

---

### 4.4. KHU VỰC 4: QUẢN TRỊ & KIỂM DUYỆT (ADMIN & MODERATION CONSOLE)

Dành cho Ban điều hành, Đội ngũ kiểm duyệt viên và Kỹ sư dữ liệu/AI. Thiết kế theo phong cách **High-Density Pro Dashboard** để thao tác nhanh, chuẩn xác, không nhầm lẫn dữ liệu.

#### Menu Điều hướng Quản trị (7 Phân hệ chính):
```
[ Người dùng ] · [ Địa điểm ] · [ Danh mục/địa giới ] · [ Kiểm duyệt ] · [ Doanh nghiệp ] · [ Nhập dữ liệu ] · [ AI ]
```

#### Thiết kế chi tiết các phân hệ Quản trị:
1. **Quản lý Người dùng (`/admin/users`)**:
   - Bảng người dùng có bộ lọc trạng thái (Active, Suspended, Deletion Requested).
   - Drawer xem chi tiết hoạt động, lịch sử đăng nhập, phân quyền quản trị viên (Admin roles).
2. **Quản lý Địa điểm & Địa giới / Danh mục (`/admin/places`, `/admin/taxonomy`)**:
   - Bảng kho POI toàn quốc: Tìm kiếm theo tên, tỉnh thành, trạng thái hiển thị (`PUBLISHED`, `HIDDEN`, `DRAFT`, `ARCHIVED`).
   - Thao tác nhanh: Ẩn khẩn cấp địa điểm có sự cố, kích hoạt lại địa điểm.
   - Quản trị cây địa giới hành chính (63 tỉnh thành, các quận huyện, tên gọi cũ/mới).
3. **Kiểm duyệt Đánh giá, Báo cáo & Đóng góp (`/admin/moderation`)**:
   - **Giao diện Side-by-Side Review**:
     - *Duyệt đóng góp*: Cột trái hiển thị thông tin hiện tại của địa điểm; Cột phải hiển thị thông tin do người dùng đề xuất sửa đổi (tô sáng Highlight các dòng thay đổi). Nút thao tác rõ ràng: `Chấp thuận áp dụng (Approve & Apply)` hoặc `Từ chối (Reject) kèm lý do`.
     - *Duyệt đánh giá / Báo cáo*: Hiển thị nội dung review bị báo cáo, lý do tố cáo từ cộng đồng, ngữ cảnh địa điểm. Nút: `Giữ lại (Valid)`, `Ẩn review (Hide)`, `Khôi phục (Restore)`.
4. **Duyệt Doanh nghiệp & Claim địa điểm (`/admin/businesses`)**:
   - Kiểm tra hồ sơ KYC và các minh chứng tải lên.
   - Xét duyệt hoặc thu hồi quyền quản lý địa điểm của doanh nghiệp theo phiên bản (version-controlled).
5. **Quản lý Nguồn & Job Nhập dữ liệu (`/admin/ingestion`)**:
   - Giám sát các nguồn dữ liệu đối tác (OpenStreetMap, Cổng du lịch địa phương...).
   - Bảng theo dõi tiến độ Job đồng bộ: Chế độ (`FULL`, `INCREMENTAL`, `REPLAY`), Trạng thái (`RUNNING`, `COMPLETED`, `FAILED`), Số bản ghi xử lý.
   - **Khu vực bản ghi cách ly (Quarantine & Dedup Queue)**: Hiển thị các địa điểm ngoại lai nghi ngờ trùng lặp với POI đã có trong hệ thống, cung cấp công cụ đối sánh và gộp bản ghi (Merge).
6. **Quản trị AI & Mô hình gợi ý (`/admin/ai`) — Khi bật cờ AI**:
   - Quản lý phiên bản Dataset: Checksum dữ liệu, số lượng tương tác, điều kiện consent.
   - Theo dõi Job huấn luyện: Trạng thái epoch, biểu đồ loss, thời gian huấn luyện.
   - Quản lý Mô hình: Phiên bản model đang Active, tỷ lệ phục vụ, nút `Kiểm tra (Validate)`, `Kích hoạt (Deploy)` và `Khôi phục phiên bản trước (Rollback)` với 1-click.

---

## 5. THIẾT KẾ CÁC TRẠNG THÁI GIAO DIỆN & TRẢI NGHIỆM LỖI (UI STATES & CONFLICT HANDLING)

Hệ thống giao diện tuân thủ nghiêm ngặt các quy tắc trạng thái của `ui-ux-pro-max`:

### 5.1. Trạng thái Đang tải (Loading Skeletons)
- Tuyệt đối không dùng màn hình trắng hoặc chỉ một spinner tròn đơn điệu giữa trang.
- Sử dụng **Skeleton Shimmer Screens** phản ánh đúng khung xương layout của card địa điểm, bảng dữ liệu hoặc dòng timeline, tạo cảm giác tải trang tức thì.

### 5.2. Trạng thái Trống (Empty States)
- Mỗi khối dữ liệu trống (chưa có chuyến đi, chưa có địa điểm yêu thích, kết quả tìm kiếm rỗng) đều được thiết kế trang nhã:
  - Hình minh họa SVG nhẹ nhàng về du lịch Việt Nam.
  - Thông điệp thân thiện: *"Bạn chưa có chuyến đi nào cho kỳ nghỉ sắp tới?"*.
  - Nút hành động trực tiếp (Primary CTA): *"Khám phá điểm đến ngay"* thay vì để người dùng bơ vơ.

### 5.3. Xử lý Lỗi & Xung đột Phiên bản (Version Conflict Resolution - 409)
Dự án áp dụng cơ chế khóa lạc quan (Optimistic Concurrency Control) với `version` và `If-Match`. Khi gặp lỗi `409 Version Conflict` (do dữ liệu đã được cập nhật ở phiên khác):
- **Không tự động ghi đè làm mất công sức người dùng**.
- Hiển thị **Conflict Dialog**:
  - *"Dữ liệu này vừa được cập nhật bởi một phiên làm việc khác."*
  - Hiển thị 2 lựa chọn: `Tải lại dữ liệu mới nhất (Reload)` hoặc `Sao chép nội dung vừa nhập vào bộ nhớ tạm`.

---

## 6. KIẾN TRÚC MÃ NGUỒN FRONTEND ĐỀ XUẤT (REACT 19 + TYPESCRIPT)

Cấu trúc thư mục được module hóa theo Feature-Driven Architecture, khớp hoàn toàn với các client API hiện có:

```
frontend/src/
├── api/                     # API Clients cho 6 microservices (Đã có sẵn)
│   ├── client.ts            # Base ApiClient, headers, Idempotency-Key
│   ├── auth.ts              # BrowserTokenStore, refresh mutex
│   ├── identity.ts          # IdentityClient
│   ├── travel.ts            # Catalog, Community, Trip, Intelligence client
│   └── types.ts             # ServiceName, ApiError, Resource types
├── components/              # Các UI Component dùng chung (Atomic Design)
│   ├── common/              # Button, Input, Select, Checkbox, Badge, Modal, Drawer
│   ├── feedback/            # Skeleton, EmptyState, ToastNotice, ErrorAlert
│   ├── icons/               # Bộ Icon SVG chuẩn nét (Compass, Pin, Calendar, Heart...)
│   └── map/                 # OpenStreetMap interactive embed & custom marker
├── features/                # Các phân vùng nghiệp vụ (Feature Modules)
│   ├── guest/               # LandingPage, PublicExplorer, PublicCollections
│   ├── traveler/            # TripStudio, Timeline, DayPlanner, Favorites, Collections
│   ├── business/            # BusinessProfile, Members, VerificationKYC, ClaimManager
│   ├── admin/               # UserAdmin, PlaceAdmin, ModerationConsole, IngestionJobs, AIAdmin
│   └── auth/                # LoginModal, RegisterModal, VerifyEmailPage, ResetPassword
├── layouts/                 # Khung sườn điều hướng theo phân vùng
│   ├── GuestLayout.tsx      # Header trong suốt + Footer
│   ├── TravelerLayout.tsx   # Header ứng dụng + Bottom Nav di động (6 Tabs)
│   ├── BusinessLayout.tsx   # Sidebar doanh nghiệp + Context switcher
│   └── AdminLayout.tsx      # Sidebar quản trị dense + Top quick bar
├── styles/                  # Design Tokens & Style Sheets
│   ├── tokens.css           # Bảng biến CSS (Màu sắc, Spacing, Shadows, Radius)
│   ├── base.css             # Reset CSS, Typography Be Vietnam Pro, focus rings
│   └── components.css       # Các class tiện ích cho Button, Card, Modal
└── App.tsx                  # Master Router & Context Provider (Auth, Theme, Notice)
```

---

## 7. BẢNG CHECKLIST NGHIỆM THU UI/UX PRO MAX TRƯỚC KHI BÀN GIAO

- [x] **Biểu tượng (Icons)**: 100% dùng SVG đồng bộ, không dùng emoji làm biểu tượng chức năng.
- [x] **Typography**: Font `Be Vietnam Pro` và `Noto Sans` hiển thị hoàn hảo dấu tiếng Việt, không lỗi font chân.
- [x] **Màu sắc & Độ tương phản**: Tất cả chữ trên nền đạt chuẩn WCAG AA tối thiểu 4.5:1; nút quan trọng đạt tỷ lệ cao.
- [x] **Vùng chạm di động (Touch Target)**: Mọi nút bấm, tab và control trên mobile đạt tối thiểu 44×44px với khoảng cách an toàn >= 8px.
- [x] **Điều hướng nhất quán**:
  - Người dùng: 6 mục (`Khám phá` · `Yêu thích` · `Bộ sưu tập` · `Chuyến đi` · `Thông báo` · `Tài khoản`).
  - Doanh nghiệp: 6 mục (`Hồ sơ` · `Thành viên` · `Xác minh` · `Địa điểm` · `Dịch vụ` · `Yêu cầu`).
  - Quản trị: 7 mục (`Người dùng` · `Địa điểm` · `Danh mục/địa giới` · `Kiểm duyệt` · `Doanh nghiệp` · `Nhập dữ liệu` · `AI`).
- [x] **Trạng thái phản hồi (Feedback)**: Đầy đủ trạng thái Loading Skeleton, Empty State có hướng dẫn, Error Alert có Trace ID, Toast thông báo thành công.
- [x] **An toàn tương tranh (Concurrency Safe)**: Tích hợp đầy đủ `version`, `If-Match` và `Idempotency-Key` trên mọi thao tác sửa đổi.
- [x] **Tương thích cờ AI**: Ẩn/hiện mượt mà các thành phần AI khi `VITE_AI_ENABLED=false` mà không tạo ra bất kỳ lỗ hổng giao diện nào.
