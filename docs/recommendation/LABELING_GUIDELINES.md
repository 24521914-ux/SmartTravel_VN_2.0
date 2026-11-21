# Hướng dẫn chấm nhãn Relevance (0–3 & Không đủ thông tin) — SmartTravel VN

Tài liệu này hướng dẫn người đánh giá (human annotator) chấm điểm mức độ phù hợp cho bộ **Human Evaluation Dataset** trên tab **B. Dataset & Labeling** (`/quan-tri`).

---

## 1. Nguyên tắc bắt buộc để tránh sai lệch (Bias & Leakage)

1. **Không dùng điểm Hybrid làm đáp án**: Bộ ứng viên được tạo bằng lấy mẫu phân tầng từ các địa điểm công khai thật trong database sau khi qua bộ lọc cứng — không chọn theo điểm của `HybridRankingEngine`, và toàn bộ nhãn ban đầu để trống (`UNLABELED`).
2. **Tách biệt nhóm kịch bản (`scenario_group`) giữa `VALIDATION` và `TEST`**:
   - Nhóm `VALIDATION`: dùng để tinh chỉnh trọng số (Weight Tuning).
   - Nhóm `TEST` (Holdout): **chỉ dùng để đánh giá độc lập sau khi chốt ứng viên từ `VALIDATION`**, tuyệt đối không điều chỉnh trọng số nhìn vào tập `TEST`.
3. **Chấm xong chưa tự động đạt `QUALITY_VALIDATED`**:
   - Ngay cả khi dataset đã có nhãn con người và đã `FREEZE`, cấu hình vẫn chỉ chuyển từ `UNVALIDATED` / `QUALITY_PENDING` sang `PASSED` khi vượt qua đánh giá độc lập trên tập `TEST` (`hard_constraint_violations = 0`, `queries_evaluated >= 3`, `judged_coverage >= 50%`) và có xác nhận rõ ràng của người đánh giá (`reviewer_note`).

---

## 2. Thang chấm điểm Relevance (0–3) và "Không đủ thông tin"

| Mức chấm | Nhãn | Tiêu chí áp dụng | Ví dụ |
|---|---|---|---|
| **3** | **Rất phù hợp** (Highly Relevant) | Đáp ứng xuất sắc mọi yêu cầu cứng lẫn mong muốn mềm của truy vấn; là lựa chọn nên nằm trong **Top 1–3**. | Truy vấn *"Cà phê yên tĩnh gần trung tâm Hà Nội, ngân sách ≤ 200k"*: quán cà phê đúng khu vực, giá rõ trong tầm, không gian yên tĩnh, mô tả/đánh giá tốt. |
| **2** | **Phù hợp** (Relevant) | Đáp ứng đúng yêu cầu chính của truy vấn; hoàn toàn hợp lý khi xuất hiện trong **Top 5–10** (dùng làm ngưỡng dương `grade >= 2` cho `Precision@K` & `Recall@K`). | Đúng danh mục & khu vực, nhưng chỉ đáp ứng một phần sở thích mềm hoặc hơi xa tâm hơn lựa chọn hạng 3. |
| **1** | **Tạm được / Liên quan yếu** (Marginally Relevant) | Đúng điều kiện lọc cứng nhưng ít hấp dẫn hoặc khớp yếu với ngữ cảnh/ý định truy vấn; chỉ nên đứng cuối danh sách nếu thiếu lựa chọn tốt hơn. | Đúng tỉnh/danh mục nhưng địa điểm ít đặc trưng du lịch, xa tâm hoặc giá/loại hình chưa thật đúng nhu cầu. |
| **0** | **Không phù hợp** (Irrelevant) | Không khớp ý định người dùng, lạc ngữ cảnh, dữ liệu sai lệch rõ ràng (ví dụ tọa độ/địa chỉ ở nước ngoài cho truy vấn du lịch Việt Nam), hoặc không đáng gợi ý. | Truy vấn tìm địa điểm du lịch Hà Nội nhưng ứng viên là cửa hàng không liên quan du lịch hoặc địa chỉ ngoài phạm vi mong muốn. |
| **?** | **Không đủ thông tin** (`INSUFFICIENT_INFO`) | Thông tin hiển thị (tên, địa chỉ, mô tả, giá, danh mục) quá mơ hồ hoặc thiếu dữ kiện cốt lõi khiến người chấm **không thể kết luận công bằng** là phù hợp hay không. | Địa điểm chỉ có một mã số/tên chung chung, không có địa chỉ/mô tả/giá/đánh giá. Hệ thống **không ép thành điểm 0** và ghi nhận riêng trong tỷ lệ `judged_coverage`. |

---

## 3. Quy trình thao tác trên giao diện `/quan-tri`

1. Đăng nhập tài khoản Admin (`fixture-admin@example.invalid` hoặc tài khoản `ADMIN`) và mở **`/quan-tri` → Tab `B. Dataset & Labeling`**.
2. Chọn bộ **`Human Evaluation Benchmark Pool`** (hoặc bấm **Tạo bộ chấm nhãn con người từ DB thật** để tạo mới).
3. Lọc theo **`Chưa chấm (UNLABELED)`** và chấm lần lượt từng truy vấn (`VALIDATION` và `TEST`):
   - Đọc tiêu chí truy vấn ở đầu thẻ (điểm đến, danh mục, ngân sách, tọa độ gốc, ưu tiên mềm).
   - Xem thông tin thật của từng địa điểm ứng viên (tên, địa chỉ, mô tả, giá, đánh giá, tọa độ/khoảng cách).
   - Bấm trực tiếp nút **`0`**, **`1`**, **`2`**, **`3`** hoặc **`? Không đủ thông tin`** (có thể ghi chú ngắn nếu cần).
4. Khi đã chấm đủ các truy vấn ở cả `VALIDATION` và `TEST`, bấm **`Freeze`** để khóa phiên bản dataset kèm SHA-256 checksum.
5. Chuyển sang **Tab `C. Evaluation & Tuning`**:
   - Bước 1: Chạy **Weight Tuning** (hệ thống tự khóa chỉ chạy trên tập **`VALIDATION`**) → sinh cấu hình `DRAFT` mới (không tự kích hoạt).
   - Bước 2: Chạy **Offline Evaluation** trên tập **`TEST`** cho cả `hybrid-baseline-v1` (baseline) và cấu hình `DRAFT` vừa tune (challenger), so sánh `NDCG@10`, `Precision@10`, `Hard Violations`, `Judged Coverage` và các slice.
6. Chỉ khi `TEST` cho thấy cải thiện thực sự và đạt tiêu chuẩn, sang **Tab `D. Config, CF & Deployment`** để kiểm định (kèm `reviewer_note`) và kích hoạt thủ công.
