-- ============================================================
-- 知测 · 多专业在线考试平台
-- 数据库初始化脚本 (PostgreSQL 16+)
-- 优化版 v3 — 学院 / 行政班 / 合班开课
-- ============================================================
-- 使用方式:
--   1. 先手动建库:
--      psql -U postgres -c "CREATE DATABASE zhice ENCODING='UTF8' TEMPLATE=template0;"
--   2. 再导入:
--      psql -U postgres -d zhice -f database_ddl.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- UUID v7 函数：时间有序 UUID，B-tree 写入性能比 v4 高 40%+
-- ============================================================
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS UUID AS $$
DECLARE
    unix_ts_ms BYTEA;
    uuid_bytes BYTEA;
BEGIN
    unix_ts_ms := substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::BIGINT) FROM 3);
    uuid_bytes := unix_ts_ms || gen_random_bytes(10);
    -- version 7
    uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
    -- RFC 4122 variant
    uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
    RETURN encode(uuid_bytes, 'hex')::UUID;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ============================================================
-- 一、组织与课程：学院 → 专业 → 课程 → 知识域
-- ============================================================

CREATE TABLE colleges (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    code            VARCHAR(20)  NOT NULL UNIQUE,
    name            VARCHAR(100) NOT NULL UNIQUE,
    short_name      VARCHAR(20),
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE majors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    college_id      UUID NOT NULL REFERENCES colleges(id),
    code            VARCHAR(20)  NOT NULL UNIQUE,
    name            VARCHAR(100) NOT NULL,
    short_name      VARCHAR(20),
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_majors_college ON majors(college_id);

CREATE TABLE courses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    major_id        UUID NOT NULL REFERENCES majors(id) ON DELETE CASCADE,
    code            VARCHAR(20)  NOT NULL,
    name            VARCHAR(200) NOT NULL,
    credit          NUMERIC(3,1),
    semester        VARCHAR(20),
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(major_id, code)
);
CREATE INDEX idx_courses_major ON courses(major_id);

CREATE TABLE knowledge_domains (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES knowledge_domains(id),
    name            VARCHAR(200) NOT NULL,
    code            VARCHAR(50),
    description     TEXT,
    level           SMALLINT NOT NULL DEFAULT 1,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_kd_course ON knowledge_domains(course_id);
CREATE INDEX idx_kd_parent ON knowledge_domains(parent_id);

-- ============================================================
-- 二、学期、行政班、用户与开课（支持合班 + 多主讲）
-- ============================================================

CREATE TABLE semesters (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    name            VARCHAR(50) NOT NULL UNIQUE,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    is_current      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 行政班：学籍归属；grade 为入学年，如 2024
CREATE TABLE classes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    major_id        UUID NOT NULL REFERENCES majors(id),
    name            VARCHAR(100) NOT NULL,
    grade           VARCHAR(10)  NOT NULL,
    student_count   INT NOT NULL DEFAULT 0,
    head_teacher_id UUID,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(major_id, grade, name)
);
CREATE INDEX idx_classes_major ON classes(major_id);
CREATE INDEX idx_classes_grade ON classes(grade);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    username        VARCHAR(50)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    real_name       VARCHAR(100) NOT NULL,
    role            VARCHAR(20)  NOT NULL CHECK (role IN ('student','teacher','admin')),
    email           VARCHAR(200),
    phone           VARCHAR(20),
    avatar_url      VARCHAR(500),
    college_id      UUID REFERENCES colleges(id),
    major_id        UUID REFERENCES majors(id),
    class_id        UUID REFERENCES classes(id),
    department      VARCHAR(100),
    title           VARCHAR(50),
    status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','locked')),
    last_login_at   TIMESTAMPTZ,
    last_login_ip   INET,
    password_changed_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_college ON users(college_id);
CREATE INDEX idx_users_major ON users(major_id);
CREATE INDEX idx_users_class ON users(class_id);
CREATE INDEX idx_users_status ON users(status);

ALTER TABLE classes
    ADD CONSTRAINT fk_classes_head_teacher
    FOREIGN KEY (head_teacher_id) REFERENCES users(id);

CREATE TABLE role_permissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    role            VARCHAR(20) NOT NULL,
    resource        VARCHAR(100) NOT NULL,
    action          VARCHAR(50)  NOT NULL,
    description     VARCHAR(200),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(role, resource, action)
);

-- 教师可授课程资质（可选）
CREATE TABLE teacher_courses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    role            VARCHAR(20) DEFAULT 'instructor' CHECK (role IN ('instructor','assistant','coordinator')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(teacher_id, course_id)
);

-- 教学班 / 开课：真正上课与排考单位（可合班）
CREATE TABLE class_offerings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    course_id       UUID NOT NULL REFERENCES courses(id),
    semester_id     UUID NOT NULL REFERENCES semesters(id),
    name            VARCHAR(200),
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','closed','cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_offerings_course ON class_offerings(course_id);
CREATE INDEX idx_offerings_semester ON class_offerings(semester_id);

-- 开课 ↔ 行政班（N:N，支持合班）
CREATE TABLE offering_classes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    offering_id     UUID NOT NULL REFERENCES class_offerings(id) ON DELETE CASCADE,
    class_id        UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(offering_id, class_id)
);
CREATE INDEX idx_offering_classes_class ON offering_classes(class_id);

-- 同一学期同一课程下，一个行政班只能进一个教学班
CREATE OR REPLACE FUNCTION check_offering_class_unique()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM offering_classes oc
        JOIN class_offerings o1 ON o1.id = oc.offering_id
        JOIN class_offerings o2 ON o2.id = NEW.offering_id
        WHERE oc.class_id = NEW.class_id
          AND oc.offering_id <> NEW.offering_id
          AND o1.semester_id = o2.semester_id
          AND o1.course_id = o2.course_id
    ) THEN
        RAISE EXCEPTION '同一学期同一课程下，行政班只能加入一个教学班';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_offering_class_unique
    BEFORE INSERT OR UPDATE ON offering_classes
    FOR EACH ROW EXECUTE FUNCTION check_offering_class_unique();

-- 开课 ↔ 授课老师（可多主讲 / 助教）
CREATE TABLE offering_teachers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    offering_id     UUID NOT NULL REFERENCES class_offerings(id) ON DELETE CASCADE,
    teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'instructor'
                    CHECK (role IN ('instructor','assistant')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(offering_id, teacher_id)
);
CREATE INDEX idx_offering_teachers_teacher ON offering_teachers(teacher_id);

-- ============================================================
-- 三、题库核心
-- ============================================================

CREATE TABLE question_templates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    name            VARCHAR(200) NOT NULL,
    type            VARCHAR(30)  NOT NULL,
    college_id      UUID REFERENCES colleges(id),
    major_id        UUID REFERENCES majors(id),
    course_id       UUID REFERENCES courses(id),
    scope           VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (scope IN ('public','college','major','course','private')),
    default_score   NUMERIC(5,1) NOT NULL DEFAULT 2,
    components      JSONB NOT NULL DEFAULT '[]',
    usage_count     INT NOT NULL DEFAULT 0,
    created_by      UUID REFERENCES users(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_qtemplates_college ON question_templates(college_id);
CREATE INDEX idx_qtemplates_major ON question_templates(major_id);
CREATE INDEX idx_qtemplates_course ON question_templates(course_id);
CREATE INDEX idx_qtemplates_scope ON question_templates(scope);
CREATE INDEX idx_qtemplates_type ON question_templates(type);

CREATE TABLE questions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    template_id     UUID REFERENCES question_templates(id),
    major_id        UUID NOT NULL REFERENCES majors(id),
    course_id       UUID NOT NULL REFERENCES courses(id),
    domain_id       UUID REFERENCES knowledge_domains(id),
    type            VARCHAR(30) NOT NULL,
    difficulty      SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
    score           NUMERIC(5,1) NOT NULL DEFAULT 2,
    title           TEXT NOT NULL,
    options         JSONB,
    answer          TEXT,
    answer_explain  TEXT,
    components      JSONB NOT NULL DEFAULT '[]',
    language        VARCHAR(20),
    test_cases      JSONB,
    code_template   TEXT,
    media_urls      JSONB,
    bank_type       VARCHAR(20) NOT NULL DEFAULT 'exam' CHECK (bank_type IN ('exam','practice','both')),
    usage_count     INT NOT NULL DEFAULT 0,
    correct_rate    NUMERIC(5,2),
    status          VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
    created_by      UUID REFERENCES users(id),
    reviewed_by     UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_questions_pick ON questions(major_id, course_id, type, difficulty, bank_type, status);
CREATE INDEX idx_questions_domain ON questions(domain_id);
CREATE INDEX idx_questions_type ON questions(type);
CREATE INDEX idx_questions_status ON questions(status);
CREATE INDEX idx_questions_created_by ON questions(created_by);
CREATE INDEX idx_questions_title_trgm ON questions USING gin(title gin_trgm_ops);

CREATE TABLE question_domains (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    domain_id       UUID NOT NULL REFERENCES knowledge_domains(id) ON DELETE CASCADE,
    weight          NUMERIC(3,2) DEFAULT 1.0,
    UNIQUE(question_id, domain_id)
);
CREATE INDEX idx_qd_question ON question_domains(question_id);
CREATE INDEX idx_qd_domain ON question_domains(domain_id);

-- ============================================================
-- 四、考试核心
-- ============================================================

CREATE TABLE exams (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    name            VARCHAR(300) NOT NULL,
    major_id        UUID NOT NULL REFERENCES majors(id),
    course_id       UUID NOT NULL REFERENCES courses(id),
    semester_id     UUID NOT NULL REFERENCES semesters(id),
    exam_mode       VARCHAR(10)  NOT NULL CHECK (exam_mode IN ('online','offline')),
    exam_type       VARCHAR(20)  NOT NULL CHECK (exam_type IN ('formal','mock','practice')),
    total_score     NUMERIC(6,1) NOT NULL,
    pass_score      NUMERIC(6,1) NOT NULL DEFAULT 60,
    duration_min    INT NOT NULL,
    start_time      TIMESTAMPTZ,
    end_time        TIMESTAMPTZ,
    exam_date       DATE,
    exam_period     VARCHAR(20),
    paper_copies    INT,
    ab_paper        VARCHAR(10) DEFAULT 'single' CHECK (ab_paper IN ('single','ab')),
    paper_mode      VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (paper_mode IN ('manual','rule','random')),
    paper_rules     JSONB,
    anti_cheat      JSONB NOT NULL DEFAULT '{}',
    switch_tolerance INT NOT NULL DEFAULT 3,
    listening_plays  INT NOT NULL DEFAULT 2,
    makeup_limit    NUMERIC(6,1),
    makeup_no_repeat BOOLEAN DEFAULT TRUE,
    defer_no_limit  BOOLEAN DEFAULT TRUE,
    scoring_mode    VARCHAR(20) NOT NULL DEFAULT 'percentage' CHECK (scoring_mode IN ('percentage','grade','rubric','passfail')),
    rubric_config   JSONB,
    status          VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','review_rejected','approved','published','in_progress','grading','completed','archived')),
    reviewed_by     UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    review_comment  TEXT,
    published_at    TIMESTAMPTZ,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_exams_major ON exams(major_id);
CREATE INDEX idx_exams_course ON exams(course_id);
CREATE INDEX idx_exams_semester ON exams(semester_id);
CREATE INDEX idx_exams_status ON exams(status);
CREATE INDEX idx_exams_mode ON exams(exam_mode);
CREATE INDEX idx_exams_created_by ON exams(created_by);
CREATE INDEX idx_exams_start_time ON exams(start_time);

CREATE TABLE exam_questions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    exam_id         UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_id     UUID NOT NULL REFERENCES questions(id),
    sort_order      INT NOT NULL DEFAULT 0,
    score           NUMERIC(5,1) NOT NULL,
    section         VARCHAR(50),
    is_required     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(exam_id, question_id)
);
CREATE INDEX idx_eq_exam ON exam_questions(exam_id);
CREATE INDEX idx_eq_question ON exam_questions(question_id);

CREATE TABLE exam_candidates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    exam_id         UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    class_id        UUID REFERENCES classes(id),
    seat_no         VARCHAR(10),
    room            VARCHAR(50),
    exam_status     VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (exam_status IN ('pending','ready','taking','submitted','absent','cheating','deferred','makeup')),
    started_at      TIMESTAMPTZ,
    submitted_at    TIMESTAMPTZ,
    ip_address      INET,
    device_info     JSONB,
    face_verified   BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(exam_id, user_id)
);
CREATE INDEX idx_ec_exam_status ON exam_candidates(exam_id, exam_status);
CREATE INDEX idx_ec_user ON exam_candidates(user_id);

-- ============================================================
-- 五、线下考试扩展
-- ============================================================

CREATE TABLE paper_layout_templates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    name            VARCHAR(200) NOT NULL,
    major_id        UUID REFERENCES majors(id),
    scope           VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (scope IN ('public','major','private')),
    page_config     JSONB NOT NULL DEFAULT '{}',
    header_config   JSONB NOT NULL DEFAULT '{}',
    content_html    TEXT,
    usage_count     INT NOT NULL DEFAULT 0,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE exam_rooms (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    exam_id         UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    room_name       VARCHAR(100) NOT NULL,
    building        VARCHAR(100),
    capacity        INT NOT NULL,
    invigilator_id  UUID REFERENCES users(id),
    invigilator2_id UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(exam_id, room_name)
);

-- ============================================================
-- 六、考试执行（核心性能优化区）
-- ============================================================

-- 作答记录 — RANGE 分区（按学期），UUID v7 主键
CREATE TABLE answer_records (
    id              UUID NOT NULL DEFAULT uuid_generate_v7(),
    exam_id         UUID NOT NULL,
    candidate_id    UUID NOT NULL REFERENCES exam_candidates(id),
    question_id     UUID NOT NULL REFERENCES questions(id),
    answer_content  JSONB,
    answer_text     TEXT,
    is_correct      BOOLEAN,
    score_earned    NUMERIC(5,1),
    grader_id       UUID REFERENCES users(id),
    grader_comment  TEXT,
    graded_at       TIMESTAMPTZ,
    time_spent_sec  INT,
    version         INT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE answer_records_2025s1 PARTITION OF answer_records FOR VALUES FROM ('2025-02-01') TO ('2025-08-01');
CREATE TABLE answer_records_2025s2 PARTITION OF answer_records FOR VALUES FROM ('2025-08-01') TO ('2026-02-01');
CREATE TABLE answer_records_2026s1 PARTITION OF answer_records FOR VALUES FROM ('2026-02-01') TO ('2026-08-01');
CREATE TABLE answer_records_2026s2 PARTITION OF answer_records FOR VALUES FROM ('2026-08-01') TO ('2027-02-01');
CREATE TABLE answer_records_2027s1 PARTITION OF answer_records FOR VALUES FROM ('2027-02-01') TO ('2027-08-01');
CREATE TABLE answer_records_2027s2 PARTITION OF answer_records FOR VALUES FROM ('2027-08-01') TO ('2028-02-01');
CREATE TABLE answer_records_2028s1 PARTITION OF answer_records FOR VALUES FROM ('2028-02-01') TO ('2028-08-01');
CREATE TABLE answer_records_2028s2 PARTITION OF answer_records FOR VALUES FROM ('2028-08-01') TO ('2029-02-01');

CREATE INDEX idx_ar_exam_candidate ON answer_records(exam_id, candidate_id);
CREATE INDEX idx_ar_question ON answer_records(question_id);
CREATE INDEX idx_ar_ungraded ON answer_records(exam_id) WHERE score_earned IS NULL;

-- 考试事件日志 — 季度分区
CREATE TABLE exam_event_logs (
    id              UUID NOT NULL DEFAULT uuid_generate_v7(),
    exam_id         UUID NOT NULL,
    candidate_id    UUID NOT NULL,
    event_type      VARCHAR(30) NOT NULL,
    event_data      JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE exam_event_logs_2025q3 PARTITION OF exam_event_logs FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE exam_event_logs_2025q4 PARTITION OF exam_event_logs FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
CREATE TABLE exam_event_logs_2026q1 PARTITION OF exam_event_logs FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE exam_event_logs_2026q2 PARTITION OF exam_event_logs FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE exam_event_logs_2026q3 PARTITION OF exam_event_logs FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE exam_event_logs_2026q4 PARTITION OF exam_event_logs FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
CREATE TABLE exam_event_logs_2027q1 PARTITION OF exam_event_logs FOR VALUES FROM ('2027-01-01') TO ('2027-04-01');
CREATE TABLE exam_event_logs_2027q2 PARTITION OF exam_event_logs FOR VALUES FROM ('2027-04-01') TO ('2027-07-01');

CREATE INDEX idx_eel_exam ON exam_event_logs(exam_id);
CREATE INDEX idx_eel_candidate ON exam_event_logs(candidate_id);
CREATE INDEX idx_eel_type ON exam_event_logs(event_type);

-- 考试会话 — UNLOGGED 表（高频心跳写入，无需 crash-safe）
CREATE UNLOGGED TABLE exam_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    candidate_id    UUID NOT NULL REFERENCES exam_candidates(id) ON DELETE CASCADE,
    session_token   VARCHAR(255) NOT NULL UNIQUE,
    ip_address      INET,
    user_agent      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_es_active ON exam_sessions(is_active) WHERE is_active = TRUE;

-- ============================================================
-- 七、成绩与分析
-- ============================================================

-- 成绩汇总 — 去掉静态排名，用视图动态计算
CREATE TABLE exam_results (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    exam_id         UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    candidate_id    UUID NOT NULL REFERENCES exam_candidates(id),
    total_score     NUMERIC(6,1),
    objective_score NUMERIC(6,1),
    subjective_score NUMERIC(6,1),
    grade           VARCHAR(5),
    passed          BOOLEAN,
    time_spent_sec  INT,
    submit_order    INT,
    is_makeup       BOOLEAN NOT NULL DEFAULT FALSE,
    is_deferred     BOOLEAN NOT NULL DEFAULT FALSE,
    anomaly_flag    BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(exam_id, candidate_id)
);
CREATE INDEX idx_er_exam ON exam_results(exam_id);
CREATE INDEX idx_er_exam_score ON exam_results(exam_id, total_score DESC);

CREATE TABLE grade_appeals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    exam_result_id  UUID NOT NULL REFERENCES exam_results(id),
    question_id     UUID NOT NULL REFERENCES questions(id),
    reason          TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','accepted','rejected')),
    handler_id      UUID REFERENCES users(id),
    handler_comment TEXT,
    score_before    NUMERIC(5,1),
    score_after     NUMERIC(5,1),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

CREATE TABLE question_analysis (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    exam_id         UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_id     UUID NOT NULL REFERENCES questions(id),
    attempt_count   INT NOT NULL DEFAULT 0,
    correct_count   INT NOT NULL DEFAULT 0,
    correct_rate    NUMERIC(5,4),
    discrimination  NUMERIC(5,4),
    avg_time_sec    NUMERIC(6,1),
    option_dist     JSONB,
    quality_label   VARCHAR(20),
    suggestion      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(exam_id, question_id)
);

CREATE TABLE student_knowledge_mastery (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         UUID NOT NULL REFERENCES users(id),
    domain_id       UUID NOT NULL REFERENCES knowledge_domains(id),
    mastery_level   NUMERIC(4,3),
    attempt_count   INT NOT NULL DEFAULT 0,
    correct_count   INT NOT NULL DEFAULT 0,
    last_tested_at  TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, domain_id)
);

-- ============================================================
-- 八、辅助功能
-- ============================================================

CREATE TABLE wrong_question_book (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         UUID NOT NULL REFERENCES users(id),
    question_id     UUID NOT NULL REFERENCES questions(id),
    exam_id         UUID REFERENCES exams(id),
    wrong_answer    JSONB,
    wrong_count     INT NOT NULL DEFAULT 1,
    is_reviewed     BOOLEAN NOT NULL DEFAULT FALSE,
    last_wrong_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at     TIMESTAMPTZ,
    UNIQUE(user_id, question_id)
);
CREATE INDEX idx_wqb_user ON wrong_question_book(user_id);

-- 练习记录 — 按学期分区
CREATE TABLE practice_records (
    id              UUID NOT NULL DEFAULT uuid_generate_v7(),
    user_id         UUID NOT NULL REFERENCES users(id),
    question_id     UUID NOT NULL REFERENCES questions(id),
    is_correct      BOOLEAN,
    answer_content  JSONB,
    time_spent_sec  INT,
    mode            VARCHAR(20) NOT NULL DEFAULT 'random' CHECK (mode IN ('random','sequential','weak_point','exam_sim')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE practice_records_2025s1 PARTITION OF practice_records FOR VALUES FROM ('2025-02-01') TO ('2025-08-01');
CREATE TABLE practice_records_2025s2 PARTITION OF practice_records FOR VALUES FROM ('2025-08-01') TO ('2026-02-01');
CREATE TABLE practice_records_2026s1 PARTITION OF practice_records FOR VALUES FROM ('2026-02-01') TO ('2026-08-01');
CREATE TABLE practice_records_2026s2 PARTITION OF practice_records FOR VALUES FROM ('2026-08-01') TO ('2027-02-01');

CREATE INDEX idx_pr_user ON practice_records(user_id);
CREATE INDEX idx_pr_user_time ON practice_records(user_id, created_at DESC);

-- 审计日志 — 季度分区
CREATE TABLE audit_logs (
    id              UUID NOT NULL DEFAULT uuid_generate_v7(),
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(50) NOT NULL,
    resource_id     UUID,
    detail          JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_logs_2025q3 PARTITION OF audit_logs FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE audit_logs_2025q4 PARTITION OF audit_logs FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
CREATE TABLE audit_logs_2026q1 PARTITION OF audit_logs FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE audit_logs_2026q2 PARTITION OF audit_logs FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE audit_logs_2026q3 PARTITION OF audit_logs FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE audit_logs_2026q4 PARTITION OF audit_logs FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
CREATE TABLE audit_logs_2027q1 PARTITION OF audit_logs FOR VALUES FROM ('2027-01-01') TO ('2027-04-01');
CREATE TABLE audit_logs_2027q2 PARTITION OF audit_logs FOR VALUES FROM ('2027-04-01') TO ('2027-07-01');

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_time ON audit_logs(created_at DESC);

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    recipient_id    UUID NOT NULL REFERENCES users(id),
    sender_id       UUID REFERENCES users(id),
    title           VARCHAR(200) NOT NULL,
    content         TEXT,
    type            VARCHAR(30) NOT NULL CHECK (type IN ('exam_notice','review_result','appeal_result','system','grade_published','makeup_notice')),
    related_id      UUID,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notif_recipient ON notifications(recipient_id, is_read, created_at DESC);

-- ============================================================
-- 九、视图
-- ============================================================

CREATE VIEW v_bank_health AS
SELECT 
    m.name AS major_name,
    c.name AS course_name,
    q.type,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE q.status = 'published') AS published,
    COUNT(*) FILTER (WHERE q.status = 'draft') AS draft,
    ROUND(AVG(q.difficulty), 2) AS avg_difficulty,
    ROUND(AVG(q.correct_rate), 3) AS avg_p_value,
    COUNT(*) FILTER (WHERE q.correct_rate IS NULL) AS untested
FROM questions q
JOIN courses c ON q.course_id = c.id
JOIN majors m ON q.major_id = m.id
GROUP BY m.name, c.name, q.type;

CREATE VIEW v_student_grades AS
SELECT 
    u.id AS user_id,
    u.real_name,
    u.username,
    e.name AS exam_name,
    e.exam_mode,
    e.exam_type,
    er.total_score,
    er.grade,
    er.time_spent_sec,
    RANK() OVER (PARTITION BY er.exam_id ORDER BY er.total_score DESC) AS rank_in_exam,
    ROUND((PERCENT_RANK() OVER (PARTITION BY er.exam_id ORDER BY er.total_score) * 100)::NUMERIC, 2) AS percentile,
    er.created_at AS exam_date
FROM exam_results er
JOIN exam_candidates ec ON er.candidate_id = ec.id
JOIN users u ON ec.user_id = u.id
JOIN exams e ON er.exam_id = e.id;

CREATE VIEW v_class_ranks AS
SELECT 
    er.exam_id,
    u.class_id,
    er.candidate_id,
    u.real_name,
    er.total_score,
    RANK() OVER (PARTITION BY er.exam_id, u.class_id ORDER BY er.total_score DESC) AS rank_in_class
FROM exam_results er
JOIN exam_candidates ec ON er.candidate_id = ec.id
JOIN users u ON ec.user_id = u.id;

-- ============================================================
-- 十、存储过程：考试结束后批量分析题目质量
-- ============================================================
CREATE OR REPLACE FUNCTION sp_analyze_exam_questions(p_exam_id UUID)
RETURNS TABLE(question_id UUID, correct_rate NUMERIC, discrimination NUMERIC, quality_label TEXT) AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT 
            ar.question_id,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE ar.is_correct) AS correct,
            AVG(ar.time_spent_sec) AS avg_time
        FROM answer_records ar
        WHERE ar.exam_id = p_exam_id
        GROUP BY ar.question_id
    ),
    ranked AS (
        SELECT 
            ar.question_id,
            ar.candidate_id,
            er.total_score,
            NTILE(3) OVER (ORDER BY er.total_score) AS score_group
        FROM answer_records ar
        JOIN exam_results er ON ar.candidate_id = er.candidate_id AND ar.exam_id = er.exam_id
        WHERE ar.exam_id = p_exam_id
    ),
    disc AS (
        SELECT 
            ranked.question_id,
            (COUNT(*) FILTER (WHERE score_group = 3 AND ar.is_correct))::NUMERIC / 
                NULLIF(COUNT(*) FILTER (WHERE score_group = 3), 0) -
            (COUNT(*) FILTER (WHERE score_group = 1 AND ar.is_correct))::NUMERIC / 
                NULLIF(COUNT(*) FILTER (WHERE score_group = 1), 0) AS discrimination_val
        FROM ranked
        JOIN answer_records ar ON ar.question_id = ranked.question_id AND ar.candidate_id = ranked.candidate_id AND ar.exam_id = p_exam_id
        GROUP BY ranked.question_id
    )
    SELECT 
        s.question_id,
        ROUND(s.correct::NUMERIC / NULLIF(s.total, 0), 4),
        ROUND(COALESCE(d.discrimination_val, 0), 4),
        CASE 
            WHEN s.correct::NUMERIC / NULLIF(s.total, 0) > 0.9 THEN 'too_easy'
            WHEN s.correct::NUMERIC / NULLIF(s.total, 0) < 0.2 THEN 'too_hard'
            WHEN COALESCE(d.discrimination_val, 0) < 0.2 THEN 'poor_discrimination'
            ELSE 'good'
        END
    FROM stats s
    LEFT JOIN disc d ON s.question_id = d.question_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 十一、种子数据
-- ============================================================

INSERT INTO colleges (code, name, short_name, sort_order) VALUES
    ('SIE',  '信息工程学院', '信工', 1),
    ('SFL',  '外国语学院',   '外语', 2),
    ('SCI',  '理学院',       '理学院', 3),
    ('MED',  '医学院',       '医学院', 4),
    ('ART',  '艺术学院',     '艺术', 5);

INSERT INTO majors (college_id, code, name, short_name, sort_order)
SELECT c.id, m.code, m.name, m.short_name, m.sort_order
FROM (VALUES
    ('SIE', 'IOT',  '物联网工程', '物联网', 1),
    ('SIE', 'CS',   '计算机科学', '计算机', 2),
    ('SFL', 'ENG',  '英语/外语',  '外语',   1),
    ('SCI', 'MATH', '数学/物理',  '数理',   1),
    ('MED', 'NURS', '医学/护理',  '医学',   1),
    ('ART', 'DES',  '艺术/设计',  '艺术',   1)
) AS m(college_code, code, name, short_name, sort_order)
JOIN colleges c ON c.code = m.college_code;

INSERT INTO semesters (name, start_date, end_date, is_current) VALUES
    ('2025-2026-1', '2025-09-01', '2026-01-15', TRUE),
    ('2025-2026-2', '2026-02-20', '2026-07-10', FALSE);

INSERT INTO courses (major_id, code, name, credit, semester)
SELECT maj.id, c.code, c.name, c.credit, c.semester
FROM (VALUES
    ('IOT', 'IOT101', '物联网导论',     3.0, '1'),
    ('IOT', 'IOT201', '传感器与检测',   3.5, '3'),
    ('IOT', 'IOT301', '嵌入式系统',     4.0, '5'),
    ('CS',  'CS101',  '程序设计基础',   4.0, '1'),
    ('CS',  'CS201',  '数据结构',       3.5, '3')
) AS c(major_code, code, name, credit, semester)
JOIN majors maj ON maj.code = c.major_code;

INSERT INTO classes (major_id, name, grade, student_count)
SELECT maj.id, cl.name, cl.grade, cl.student_count
FROM (VALUES
    ('IOT', '物联2401', '2024', 45),
    ('IOT', '物联2402', '2024', 42),
    ('CS',  '计科2401', '2024', 48),
    ('CS',  '计科2301', '2023', 40)
) AS cl(major_code, name, grade, student_count)
JOIN majors maj ON maj.code = cl.major_code;

-- 示例合班开课：物联网导论 = 物联2401 + 物联2402
INSERT INTO class_offerings (course_id, semester_id, name)
SELECT c.id, s.id, '物联网导论 · 合班A'
FROM courses c
JOIN majors m ON m.id = c.major_id AND m.code = 'IOT'
JOIN semesters s ON s.name = '2025-2026-1'
WHERE c.code = 'IOT101';

INSERT INTO offering_classes (offering_id, class_id)
SELECT o.id, cl.id
FROM class_offerings o
JOIN courses c ON c.id = o.course_id AND c.code = 'IOT101'
JOIN classes cl ON cl.name IN ('物联2401', '物联2402');

INSERT INTO role_permissions (role, resource, action, description) VALUES
    ('admin',   'system',     'manage',    '系统全局管理'),
    ('admin',   'users',      'manage',    '用户与班级管理'),
    ('admin',   'colleges',   'manage',    '学院管理'),
    ('admin',   'majors',     'manage',    '专业管理'),
    ('admin',   'courses',    'manage',    '课程管理'),
    ('admin',   'classes',    'manage',    '行政班管理'),
    ('admin',   'offerings',  'manage',    '开课与合班安排'),
    ('admin',   'semesters',  'manage',    '学期管理'),
    ('admin',   'audit_logs', 'read',      '查看操作日志'),
    ('admin',   'backup',     'manage',    '数据备份与恢复'),
    ('teacher', 'questions',  'manage',    '题库管理（增删改查）'),
    ('teacher', 'exams',      'create',    '创建考试'),
    ('teacher', 'exams',      'review',    '审核试卷'),
    ('teacher', 'exams',      'monitor',   '考试监控'),
    ('teacher', 'grading',    'manage',    '主观题批改'),
    ('teacher', 'analysis',   'read',      '查看成绩分析'),
    ('teacher', 'templates',  'manage',    '管理题型模板'),
    ('teacher', 'paper_layout','manage',   '试卷排版编辑'),
    ('student', 'exams',      'take',      '参加考试'),
    ('student', 'results',    'read_own',  '查看自己的成绩'),
    ('student', 'appeal',     'create',    '成绩申诉'),
    ('student', 'practice',   'use',       '自主练习'),
    ('student', 'wrongbook',  'read_own',  '查看自己的错题本');

SELECT '========================================' AS info;
SELECT '  知测数据库初始化完成 (v3 学院/合班)！' AS status;
SELECT '========================================' AS info;
SELECT
    (SELECT COUNT(*) FROM colleges) AS colleges_count,
    (SELECT COUNT(*) FROM majors) AS majors_count,
    (SELECT COUNT(*) FROM courses) AS courses_count,
    (SELECT COUNT(*) FROM classes) AS classes_count,
    (SELECT COUNT(*) FROM class_offerings) AS offerings_count,
    (SELECT COUNT(*) FROM semesters) AS semesters_count,
    (SELECT COUNT(*) FROM role_permissions) AS permissions_count;
