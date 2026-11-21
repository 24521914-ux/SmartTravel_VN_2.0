-- V12: Human-in-the-loop Evaluation Labeling workflow (UNLABELED, LABELED 0..3, INSUFFICIENT_INFO)

ALTER TABLE intelligence.eval_judgments
  ALTER COLUMN relevance_grade DROP NOT NULL;

ALTER TABLE intelligence.eval_judgments
  ADD COLUMN IF NOT EXISTS judgment_status TEXT NOT NULL DEFAULT 'LABELED';

ALTER TABLE intelligence.eval_judgments
  DROP CONSTRAINT IF EXISTS eval_judgments_status_check;

ALTER TABLE intelligence.eval_judgments
  ADD CONSTRAINT eval_judgments_status_check
  CHECK (judgment_status IN ('UNLABELED', 'LABELED', 'INSUFFICIENT_INFO'));

ALTER TABLE intelligence.eval_judgments
  DROP CONSTRAINT IF EXISTS eval_judgments_grade_status_consistency;

ALTER TABLE intelligence.eval_judgments
  ADD CONSTRAINT eval_judgments_grade_status_consistency
  CHECK (
    (judgment_status = 'LABELED' AND relevance_grade IS NOT NULL AND relevance_grade BETWEEN 0 AND 3)
    OR (judgment_status IN ('UNLABELED', 'INSUFFICIENT_INFO') AND relevance_grade IS NULL)
  );

ALTER TABLE intelligence.eval_datasets
  ADD COLUMN IF NOT EXISTS labeled_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unlabeled_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insufficient_info_count INT NOT NULL DEFAULT 0;

UPDATE intelligence.eval_datasets d
SET
  labeled_count = COALESCE((SELECT COUNT(*) FROM intelligence.eval_judgments j WHERE j.eval_dataset_id = d.eval_dataset_id AND j.judgment_status = 'LABELED'), 0),
  unlabeled_count = COALESCE((SELECT COUNT(*) FROM intelligence.eval_judgments j WHERE j.eval_dataset_id = d.eval_dataset_id AND j.judgment_status = 'UNLABELED'), 0),
  insufficient_info_count = COALESCE((SELECT COUNT(*) FROM intelligence.eval_judgments j WHERE j.eval_dataset_id = d.eval_dataset_id AND j.judgment_status = 'INSUFFICIENT_INFO'), 0);

CREATE INDEX IF NOT EXISTS idx_eval_judgments_dataset_status
  ON intelligence.eval_judgments (eval_dataset_id, judgment_status, split, query_id);
