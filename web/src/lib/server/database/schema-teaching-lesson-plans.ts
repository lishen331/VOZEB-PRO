/*
 * 备课教案：只新增表，不改动已有的课程 / 班级表。
 * teaching_lesson_plans = 老师自己的教案（学校课程 × 课时 × 老师），与班级无关。
 * 试讲记录不更新 updated_at，避免和编辑器的「基于哪个版本保存」冲突检查互相干扰。
 * platform_lesson_plan_templates = 课程方给课时写的标准教案（每个课时最多一份），老师只读参考。
 */
export const POSTGRESQL_TEACHING_LESSON_PLANS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS teaching_lesson_plans (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    assignment_id text NOT NULL,
    lesson_id text NOT NULL REFERENCES platform_course_lessons(id) ON DELETE CASCADE,
    teacher_membership_id text NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready')),
    content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
    last_rehearsal jsonb CHECK (last_rehearsal IS NULL OR jsonb_typeof(last_rehearsal) = 'object'),
    rehearsal_count integer NOT NULL DEFAULT 0 CHECK (rehearsal_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (school_id, assignment_id, lesson_id, teacher_membership_id),
    FOREIGN KEY (school_id, assignment_id) REFERENCES school_course_assignments(school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, teacher_membership_id) REFERENCES school_memberships(school_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS teaching_lesson_plans_school_teacher_assignment_idx ON teaching_lesson_plans (school_id, teacher_membership_id, assignment_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_lesson_plan_templates (
    lesson_id text PRIMARY KEY REFERENCES platform_course_lessons(id) ON DELETE CASCADE,
    content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
    updated_by_user_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
`;
