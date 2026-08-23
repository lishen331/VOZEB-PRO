export const POSTGRESQL_SCHOOL_DOMAIN_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schools (
    id text PRIMARY KEY,
    name text NOT NULL,
    profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(profile) = 'object'),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schools_status_updated_idx ON schools (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS school_memberships (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('teacher', 'student')),
    permissions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permissions) = 'array'),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    join_source text NOT NULL DEFAULT 'admin' CHECK (join_source IN ('admin', 'import', 'invite')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id),
    UNIQUE (school_id, id)
);

CREATE INDEX IF NOT EXISTS school_memberships_school_status_updated_idx ON school_memberships (school_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS school_memberships_school_role_updated_idx ON school_memberships (school_id, role, updated_at DESC);

CREATE TABLE IF NOT EXISTS school_invite_codes (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('teacher', 'student')),
    code_digest text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (school_id, role),
    UNIQUE (code_digest)
);

CREATE INDEX IF NOT EXISTS school_invite_codes_school_status_updated_idx ON school_invite_codes (school_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS school_classes (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (school_id, id)
);

CREATE INDEX IF NOT EXISTS school_classes_school_status_updated_idx ON school_classes (school_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS school_class_members (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id text NOT NULL,
    membership_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (class_id, membership_id),
    FOREIGN KEY (school_id, class_id) REFERENCES school_classes(school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, membership_id) REFERENCES school_memberships(school_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS school_class_members_school_class_idx ON school_class_members (school_id, class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS school_class_members_school_membership_idx ON school_class_members (school_id, membership_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_courses (
    id text PRIMARY KEY,
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
    chapters jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(chapters) = 'array'),
    attachments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachments) = 'array'),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'disabled')),
    created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_courses_status_updated_idx ON platform_courses (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS school_course_assignments (
    id text PRIMARY KEY,
    course_id text NOT NULL REFERENCES platform_courses(id) ON DELETE CASCADE,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (course_id, school_id),
    UNIQUE (school_id, id)
);

CREATE INDEX IF NOT EXISTS school_course_assignments_school_status_updated_idx ON school_course_assignments (school_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS school_course_assignments_course_updated_idx ON school_course_assignments (course_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS school_course_offerings (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    assignment_id text NOT NULL,
    class_id text NOT NULL,
    teacher_membership_id text NOT NULL,
    supplemental_resources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(supplemental_resources) = 'array'),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (school_id, id),
    UNIQUE (assignment_id, class_id, teacher_membership_id),
    FOREIGN KEY (school_id, assignment_id) REFERENCES school_course_assignments(school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, class_id) REFERENCES school_classes(school_id, id),
    FOREIGN KEY (school_id, teacher_membership_id) REFERENCES school_memberships(school_id, id)
);

CREATE INDEX IF NOT EXISTS school_course_offerings_school_status_updated_idx ON school_course_offerings (school_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS school_course_offerings_school_teacher_updated_idx ON school_course_offerings (school_id, teacher_membership_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS teaching_assignments (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    offering_id text NOT NULL,
    teacher_membership_id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('lesson', 'homework', 'commercial_practice')),
    title text NOT NULL,
    instructions text NOT NULL DEFAULT '',
    resources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(resources) = 'array'),
    due_at timestamptz,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (school_id, id),
    FOREIGN KEY (school_id, offering_id) REFERENCES school_course_offerings(school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, teacher_membership_id) REFERENCES school_memberships(school_id, id)
);

CREATE INDEX IF NOT EXISTS teaching_assignments_school_status_updated_idx ON teaching_assignments (school_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS teaching_assignments_school_offering_updated_idx ON teaching_assignments (school_id, offering_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS teaching_submissions (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    assignment_id text NOT NULL,
    student_membership_id text NOT NULL,
    note text NOT NULL DEFAULT '',
    content_references jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(content_references) = 'array'),
    status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'revision_required', 'reviewed')),
    feedback text NOT NULL DEFAULT '',
    submitted_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (assignment_id, student_membership_id),
    FOREIGN KEY (school_id, assignment_id) REFERENCES teaching_assignments(school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, student_membership_id) REFERENCES school_memberships(school_id, id)
);

CREATE INDEX IF NOT EXISTS teaching_submissions_school_status_updated_idx ON teaching_submissions (school_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS teaching_submissions_school_student_updated_idx ON teaching_submissions (school_id, student_membership_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS commercial_orders (
    id text PRIMARY KEY,
    title text NOT NULL,
    requirements text NOT NULL DEFAULT '',
    reference_materials jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reference_materials) = 'array'),
    acceptance_criteria text NOT NULL DEFAULT '',
    internal_amount_cents bigint NOT NULL DEFAULT 0 CHECK (internal_amount_cents >= 0),
    deadline_at timestamptz,
    assigned_school_id text REFERENCES schools(id),
    production_group_id text,
    teacher_membership_id text,
    class_id text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'assigned', 'in_progress', 'submitted', 'revision_required', 'accepted', 'cancelled')),
    platform_feedback text NOT NULL DEFAULT '',
    created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (assigned_school_id, id),
    CHECK (status IN ('draft', 'cancelled') OR assigned_school_id IS NOT NULL),
    CONSTRAINT commercial_orders_assignment_configuration CHECK (assigned_school_id IS NOT NULL OR (teacher_membership_id IS NULL AND class_id IS NULL AND production_group_id IS NULL)),
    FOREIGN KEY (assigned_school_id, teacher_membership_id) REFERENCES school_memberships(school_id, id),
    FOREIGN KEY (assigned_school_id, class_id) REFERENCES school_classes(school_id, id)
);

CREATE INDEX IF NOT EXISTS commercial_orders_status_updated_idx ON commercial_orders (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS commercial_orders_school_status_updated_idx ON commercial_orders (assigned_school_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS commercial_orders_school_teacher_updated_idx ON commercial_orders (assigned_school_id, teacher_membership_id, updated_at DESC);

ALTER TABLE commercial_orders ADD COLUMN IF NOT EXISTS production_group_id text;
ALTER TABLE commercial_orders DROP CONSTRAINT IF EXISTS commercial_orders_assignment_configuration;
ALTER TABLE commercial_orders ADD CONSTRAINT commercial_orders_assignment_configuration CHECK (assigned_school_id IS NOT NULL OR (teacher_membership_id IS NULL AND class_id IS NULL AND production_group_id IS NULL));

CREATE TABLE IF NOT EXISTS commercial_order_participants (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    order_id text NOT NULL,
    membership_id text NOT NULL,
    candidate_references jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(candidate_references) = 'array'),
    note text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'submitted')),
    submitted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id, membership_id),
    FOREIGN KEY (school_id, order_id) REFERENCES commercial_orders(assigned_school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, membership_id) REFERENCES school_memberships(school_id, id)
);

CREATE INDEX IF NOT EXISTS commercial_order_participants_school_status_updated_idx ON commercial_order_participants (school_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS commercial_order_participants_school_order_updated_idx ON commercial_order_participants (school_id, order_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS commercial_order_participants_school_member_updated_idx ON commercial_order_participants (school_id, membership_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS commercial_order_deliveries (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    order_id text NOT NULL,
    submitted_by_membership_id text NOT NULL,
    content_references jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(content_references) = 'array'),
    note text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'revision_required', 'accepted')),
    platform_feedback text NOT NULL DEFAULT '',
    submitted_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (school_id, order_id) REFERENCES commercial_orders(assigned_school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, submitted_by_membership_id) REFERENCES school_memberships(school_id, id)
);

CREATE INDEX IF NOT EXISTS commercial_order_deliveries_school_status_updated_idx ON commercial_order_deliveries (school_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS commercial_order_deliveries_school_order_created_idx ON commercial_order_deliveries (school_id, order_id, created_at DESC);
`;
