-- 题库组件化：模板增加说明字段
ALTER TABLE question_templates
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN question_templates.description IS '题型模板说明';
COMMENT ON COLUMN question_templates.components IS '组件拼装 JSON';
COMMENT ON COLUMN questions.components IS '题目组件拼装 JSON';
