-- 题库组件化：模板增加说明字段
ALTER TABLE question_templates
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE question_templates
  ADD COLUMN IF NOT EXISTS college_id UUID REFERENCES colleges(id);

ALTER TABLE question_templates
  DROP CONSTRAINT IF EXISTS question_templates_scope_check;

ALTER TABLE question_templates
  ADD CONSTRAINT question_templates_scope_check
  CHECK (scope IN ('public','college','major','course','private'));

CREATE INDEX IF NOT EXISTS idx_qtemplates_college
  ON question_templates(college_id);

COMMENT ON COLUMN question_templates.description IS '题型模板说明';
COMMENT ON COLUMN question_templates.college_id IS '学院范围模板所属学院';
COMMENT ON COLUMN question_templates.components IS '组件拼装 JSON';
COMMENT ON COLUMN questions.components IS '题目组件拼装 JSON';
