# P08 Dataset training model và Intelligence nâng cao

Trạng thái: **Chưa triển khai**. Dependency: P06/P07 và dữ liệu đủ điều kiện. Mục tiêu: hoàn thiện vòng đời ML trong bảng nguồn. Thiếu dữ liệu thì ghi blocker và giữ Basic Recommendation hoạt động.

## Công việc

- [ ] P08-01: Bật 5 bảng ML trong [Intelligence](../database/intelligence.md); artifact private storage/checksum, schema compatibility.
- [ ] P08-02: Dataset builder kiểm source allow_training hiện hành và consent; source/license lineage, cutoff/query/criteria/feature version. Dữ liệu thủ công/UGC cũng cần provenance và policy.
- [ ] P08-03: Chọn thuật toán/bài toán, metrics phù hợp nhãn; temporal/user split tránh leakage, so sánh Basic baseline, báo sample size.
- [ ] P08-04: Training worker resource budget/timeout/cancel, code revision/seed/params/logs. Python nếu cần vẫn là worker của Intelligence.
- [ ] P08-05: Validate artifact/quality/checksum, activate transaction khóa use_case, unique model active; rollback model còn hợp lệ có lịch sử.
- [ ] P08-06: Serving deadline/warmup/fallback Basic, tracking model/algorithm version và latency.
- [ ] P08-07: Consent/source revoke/user deletion impact lên dataset/model; revoke/retrain/artifact cleanup theo policy có bằng chứng.

## Contract và dữ liệu

dataset_versions/dataset_sources/training_jobs/model_versions/model_deployments. FK recommendation→model nằm trong Intelligence. Admin APIs datasets/jobs/models/metrics/validate/deploy/rollback; public recommendation contract giữ nguyên P07. Publish model.deployed; consume source policy/deletion.

Frontend: admin dataset/job/model comparison/activation history; user dùng cùng giao diện recommendation, không cần giao diện training.

## Kiểm nhận

- [ ] Dataset từ cùng definition/checkpoint/code tái lập count/checksum theo quy trình; artifact mismatch bị chặn.
- [ ] Nguồn chưa cho training/consent revoked không vào dataset mới; model bị policy revoke không được activate lại.
- [ ] Concurrent deploy chỉ một active/use_case; history đủ và fallback chạy khi inference timeout.
- [ ] Evaluation trên holdout, không chỉ training set; quality gate đo so baseline, không tự tuyên bố accuracy.
- [ ] Model active truy được dataset/training/code/checksum/metrics/deployment. Không thêm chatbot/RAG/vector DB nếu không có use case.

Đầu ra: pipeline/registry/artifacts metadata, API/UI, reproducibility/evaluation evidence và activation/rollback/privacy runbook. Model lỗi chuyển Basic hoặc validated model trước; không xóa evidence để che lỗi.
