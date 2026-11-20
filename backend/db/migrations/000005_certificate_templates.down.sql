ALTER TABLE certificates DROP COLUMN IF EXISTS template_id;
ALTER TABLE courses
    DROP COLUMN IF EXISTS certificate_text,
    DROP COLUMN IF EXISTS certificate_template_id,
    DROP COLUMN IF EXISTS certificate_enabled;
DROP TABLE IF EXISTS certificate_templates;
