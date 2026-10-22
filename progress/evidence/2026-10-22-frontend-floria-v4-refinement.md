# Bằng chứng kiểm thử: SmartTravel_VN — Premium Visual Refinement V4 (Floria Art Direction)

Cập nhật lần cuối: **23/10/2026** · Revision: `544dd08` (nhánh `feature/frontend-floria-v4-refinement`) · Người thực hiện: Truong102006.

---

## 1. Mục tiêu & Phạm vi

Thực hiện **SmartTravel_VN Visual Refinement V4** lấy cảm hứng từ art direction của **Floria** (`https://floria-landing-page.vercel.app/`), kết hợp hai kỹ năng **Taste Skill** (`taste-skill`) và **UI/UX Pro Max** (`ui-ux-pro-max`), tập trung vào 5 trụ cột:
1. **Header (Transparent to Floating Glass):** Trạng thái ban đầu `scrollY = 0` hoàn toàn hòa vào nền ảnh hero (không capsule xanh đen thô, không viền, không bóng); khi scroll > 60px chuyển thành floating glass pill mỏng nhẹ (`min-height: 64px`, `border-radius: 999px`, `backdrop-filter: blur(24px) saturate(150%)`, viền `rgba(255,255,255,0.12)`).
2. **Typography Editorial:** Thiết lập hierarchy tương phản cao kết hợp Display Serif (`Playfair Display` italic hỗ trợ tiếng Việt) với UI Sans (`Be Vietnam Pro`), padding descender chống cắt dấu, token `--font-display`, `--font-heading`, `--font-body`.
3. **Background System:** Xóa bỏ hoàn toàn cảm giác nền đen phẳng `#0b1411` đơn điệu; bổ sung chuyển tầng khí quyển với radial lights, dark emerald vignette và khối nghỉ tương phản màu đá ấm (*warm stone* `#e9e5dc` / `#e2ded4`) cho khu vực lên kế hoạch chuyến đi.
4. **Bố cục ảnh Editorial bất đối xứng:** Thay thế grid 3 cột thô bằng layout bất đối xứng: Thẻ tiêu điểm Ninh Bình (`01 · TIÊU ĐIỂM`) chiếm 58% chiều rộng làm focal point; hai thẻ vệ tinh Hội An & Hạ Long xếp so le bên phải với tỉ lệ 16:11 và hiệu ứng zoom mượt khi tương tác.
5. **Thu gọn Empty State:** Tinh giản khối thông báo catalog đang chờ dữ liệu du lịch từ box 300px viền đứt nét thô thành một thanh glass badge ngang thanh lịch, trung thực về dữ liệu nhưng không phá vỡ trải nghiệm du lịch.

---

## 2. Kết quả kiểm thử tự động

### 2.1. Build & Typecheck
- **Lệnh:** `npm run build` (`tsc --noEmit && vite build`)
- **Kết quả:** **PASS** (15.01s, 0 lỗi TypeScript, 0 lỗi bundle, gzip chunk tối ưu).

### 2.2. Contract Tests (API & Gateway)
- **Lệnh:** `npm run test:contracts` (`node --test scripts/mock-contract-test.mjs`)
- **Kết quả:** **8/8 PASS** (0 failed, 0 errors, 0 skipped).
  - `catalog search preserves Unicode, category and opaque cursor across pages`
  - `reads six frozen partner fixture sets using native filesystem paths`
  - `requests preserve bearer, version, idempotency, trace and JSON fields`
  - `204 and domain errors preserve status and trace; malformed JSON is explicit`
  - `concurrent refresh sends one single-use token and omits expired bearer`
  - `late refresh cannot overwrite newer login; failed refresh clears its session`
  - `logout waits for rotation and revokes the resulting token once`
  - `logout of a pending old refresh preserves a later login and revokes only its old session`

### 2.3. Editorial UI & Responsive Check
- **Lệnh:** `npm run test:ui:editorial` (`node scripts/editorial-ui-check.mjs`)
- **Kết quả:** **32/32 PASS** (0 failed, 0 errors, 0 skipped).
  - Responsive: 375px (iPhone SE), 430px (iPhone Pro Max), 768px (iPad Mini), 1366px (Laptop), 1920px (Desktop) đều không bị ngang overflow.
  - Image ratios: Khớp tỉ lệ editorial, không méo hình, không cắt mất chủ thể.
  - Accessibility & Tokens: `reduced-motion` được hỗ trợ, dark tokens chuẩn, dropdown menu an toàn.

---

## 3. Visual Critique & Refinement Log (Vòng lặp Creative Director)

Theo quy trình Visual Refinement, 5 điểm yếu đã được phát hiện và tinh chỉnh triệt để:
1. **Điểm yếu 1 — Scroll Listener Jitter:** Ban đầu `LayoutShell` dùng 1px sentinel node gắn ở `document.body` với `IntersectionObserver`, khiến một số viewport kích hoạt nhầm trạng thái `is-scrolled` ngay tại `scrollY = 0`.  
   *Giải pháp:* Thay bằng `requestAnimationFrame` lắng nghe `window.scrollY > 60` với throttle thụ động, đảm bảo mượt mà 60fps và header luôn transparent 100% ở đỉnh trang.
2. **Điểm yếu 2 — Logo / Navigation Imbalance:** Việc dùng `justify-content: space-between` khiến menu ở giữa bị kéo lệch khi cụm logo bên trái dài hơn nút auth bên phải.  
   *Giải pháp:* Chuyển `.liquid-glass-container` sang CSS Grid `1fr auto 1fr`, cố định tuyệt đối navigation ở giữa trục đối xứng của viewport.
3. **Điểm yếu 3 — Empty State Catalog chiếm toàn màn hình:** Khối thông báo danh mục chiếm hơn 300px chiều cao với viền đứt nét làm landing page trông như màn hình bảo trì.  
   *Giải pháp:* Thiết lập component `EmptyState` với `variant="compact"`, layout ngang, icon la bàn 18px tinh tế và badge mờ không cướp tiêu điểm của ảnh editorial.
4. **Điểm yếu 4 — Typography thiếu tương phản văn hóa:** Toàn bộ tiêu đề dùng một kiểu chữ sans-serif đồng nhất khiến landing page thiếu chất du lịch sâu lắng.  
   *Giải pháp:* Đưa font `Playfair Display` serif italic vào các vế nhấn mạnh (`miền diệu kỳ.`, `vạn điều khám phá.`, `đang chờ bạn khám phá.`), đi kèm khoảng đệm âm (descender clearance `padding-bottom: 6px`) chống cắt đuôi chữ cái tiếng Việt có dấu (`ề`, `ỳ`, `ắ`).
5. **Điểm yếu 5 — Nền tối đơn điệu không nhịp điệu:** Tất cả section dưới hero nối nhau trên cùng một mã màu tối `#0b1411`.  
   *Giải pháp:* Thiết kế nhịp điệu ánh sáng Floria: Hero ảnh mờ dần -> Section khám phá emerald mờ -> Section editorial bất đối xứng -> Section kế hoạch nền đá ấm (`#e9e5dc`) tương phản cao -> Finale ảnh rộng Hạ Long.

---

## 4. Trạng thái task

- Task **P03-07** (Frontend & Integration): Tiếp tục giữ **PARTIAL** trên revision dirty `cfd121d` cho tới khi tạo commit trên nhánh và chạy CI.
