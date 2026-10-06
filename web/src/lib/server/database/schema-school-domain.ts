import { ALL_ADMIN_PERMISSIONS } from "@/lib/admin-permissions";
import { DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS } from "@/lib/feature-modules";

const RBAC_ALL_PLATFORM_PERMISSIONS_JSON = JSON.stringify(ALL_ADMIN_PERMISSIONS);
const RBAC_DEFAULT_USER_MENU_PERMISSIONS_JSON = JSON.stringify(DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS);

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
    is_protected_manager boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    join_source text NOT NULL DEFAULT 'admin' CHECK (join_source IN ('admin', 'import', 'invite')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id),
    UNIQUE (school_id, id)
);

CREATE INDEX IF NOT EXISTS school_memberships_school_status_updated_idx ON school_memberships (school_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS school_memberships_school_role_updated_idx ON school_memberships (school_id, role, updated_at DESC);
ALTER TABLE school_memberships ADD COLUMN IF NOT EXISTS is_protected_manager boolean NOT NULL DEFAULT false;

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
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'disabled')),
    created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    deleted_at timestamptz,
    deleted_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_courses ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE platform_courses ADD COLUMN IF NOT EXISTS deleted_by_user_id text;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'platform_courses'::regclass
          AND conname = 'platform_courses_deleted_by_user_id_fkey'
    ) THEN
        ALTER TABLE platform_courses
            ADD CONSTRAINT platform_courses_deleted_by_user_id_fkey
            FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS platform_courses_status_updated_idx ON platform_courses (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_course_chapters (
    id text PRIMARY KEY,
    course_id text NOT NULL REFERENCES platform_courses(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (course_id, id)
);

CREATE INDEX IF NOT EXISTS platform_course_chapters_course_sort_idx ON platform_course_chapters (course_id, sort_order, id);

CREATE TABLE IF NOT EXISTS platform_course_lessons (
    id text PRIMARY KEY,
    course_id text NOT NULL REFERENCES platform_courses(id) ON DELETE CASCADE,
    chapter_id text NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (course_id, id),
    FOREIGN KEY (course_id, chapter_id) REFERENCES platform_course_chapters(course_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS platform_course_lessons_course_chapter_sort_idx ON platform_course_lessons (course_id, chapter_id, sort_order, id);

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

CREATE UNIQUE INDEX IF NOT EXISTS school_course_assignments_course_id_id_idx ON school_course_assignments (course_id, id);
CREATE INDEX IF NOT EXISTS school_course_assignments_school_status_updated_idx ON school_course_assignments (school_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS school_course_assignments_course_updated_idx ON school_course_assignments (course_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS course_materials (
    id text PRIMARY KEY,
    course_id text NOT NULL REFERENCES platform_courses(id) ON DELETE CASCADE,
    chapter_id text,
    lesson_id text,
    source_scope text NOT NULL CHECK (source_scope IN ('platform', 'school')),
    school_course_assignment_id text,
    title text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    bytes bigint NOT NULL CHECK (bytes >= 0),
    storage_key text NOT NULL,
    url text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((CASE WHEN chapter_id IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN lesson_id IS NOT NULL THEN 1 ELSE 0 END) = 1),
    CHECK ((source_scope = 'platform' AND school_course_assignment_id IS NULL) OR (source_scope = 'school' AND school_course_assignment_id IS NOT NULL)),
    FOREIGN KEY (course_id, chapter_id) REFERENCES platform_course_chapters(course_id, id) ON DELETE CASCADE,
    FOREIGN KEY (course_id, lesson_id) REFERENCES platform_course_lessons(course_id, id) ON DELETE CASCADE,
    FOREIGN KEY (course_id, school_course_assignment_id) REFERENCES school_course_assignments(course_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS course_materials_course_target_sort_idx ON course_materials (course_id, chapter_id, lesson_id, sort_order, id);
CREATE INDEX IF NOT EXISTS course_materials_assignment_status_updated_idx ON course_materials (school_course_assignment_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS school_course_offerings (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    assignment_id text NOT NULL,
    class_id text NOT NULL,
    teacher_membership_id text NOT NULL,
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
    chapter_id text,
    lesson_id text,
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
    FOREIGN KEY (school_id, teacher_membership_id) REFERENCES school_memberships(school_id, id),
    CONSTRAINT teaching_assignments_course_target CHECK (chapter_id IS NULL OR lesson_id IS NULL)
);

ALTER TABLE teaching_assignments ADD COLUMN IF NOT EXISTS chapter_id text;
ALTER TABLE teaching_assignments ADD COLUMN IF NOT EXISTS lesson_id text;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'teaching_assignments'::regclass
          AND conname = 'teaching_assignments_course_target'
    ) THEN
        ALTER TABLE teaching_assignments
            ADD CONSTRAINT teaching_assignments_course_target
            CHECK (chapter_id IS NULL OR lesson_id IS NULL);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS teaching_assignments_school_status_updated_idx ON teaching_assignments (school_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS teaching_assignments_school_offering_updated_idx ON teaching_assignments (school_id, offering_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS teaching_assignments_school_chapter_idx ON teaching_assignments (school_id, chapter_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS teaching_assignments_school_lesson_idx ON teaching_assignments (school_id, lesson_id, updated_at DESC);

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

-- RBAC role catalogue. User roles remain scoped: platform roles have no school_id,
-- while school roles always retain the membership's tenant boundary.
CREATE TABLE IF NOT EXISTS rbac_roles (
    role_key text PRIMARY KEY,
    name text NOT NULL UNIQUE,
    scope text NOT NULL CHECK (scope IN ('platform', 'school', 'user')),
    permissions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permissions) = 'array'),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    is_builtin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rbac_user_role_bindings (
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_key text NOT NULL REFERENCES rbac_roles(role_key) ON DELETE RESTRICT,
    school_id text REFERENCES schools(id) ON DELETE CASCADE,
    protected boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rbac_user_role_bindings DROP CONSTRAINT IF EXISTS rbac_user_role_bindings_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS rbac_user_role_bindings_scope_unique_idx
ON rbac_user_role_bindings (user_id, role_key, coalesce(school_id, ''));

-- A platform administrator has exactly one platform role. Keep protected roles,
-- then custom roles, before removing historical duplicate default bindings.
WITH ranked_platform_bindings AS (
    SELECT ctid,
           row_number() OVER (
               PARTITION BY user_id
               ORDER BY protected DESC,
                        CASE WHEN role_key = 'platform-admin' THEN 1 ELSE 0 END,
                        created_at ASC,
                        role_key ASC
           ) AS binding_rank
    FROM rbac_user_role_bindings
    WHERE school_id IS NULL
)
DELETE FROM rbac_user_role_bindings binding
USING ranked_platform_bindings duplicate_binding
WHERE binding.ctid = duplicate_binding.ctid
  AND duplicate_binding.binding_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS rbac_user_role_bindings_platform_user_unique_idx
ON rbac_user_role_bindings (user_id)
WHERE school_id IS NULL;

CREATE INDEX IF NOT EXISTS rbac_user_role_bindings_role_idx
ON rbac_user_role_bindings (role_key, school_id, user_id);

INSERT INTO rbac_roles (role_key, name, scope, permissions, is_builtin)
VALUES
    ('platform-superadmin', '平台超管', 'platform', '${RBAC_ALL_PLATFORM_PERMISSIONS_JSON}'::jsonb, true),
    ('platform-admin', '平台管理员', 'platform', '${RBAC_ALL_PLATFORM_PERMISSIONS_JSON}'::jsonb, false),
    ('school-superadmin', '学校超管', 'school', '["school.manage"]'::jsonb, true),
    ('teacher', '老师', 'school', '${RBAC_DEFAULT_USER_MENU_PERMISSIONS_JSON}'::jsonb, true),
    ('student', '学生', 'school', '${RBAC_DEFAULT_USER_MENU_PERMISSIONS_JSON}'::jsonb, true),
    ('normal-user', '普通用户', 'user', '${RBAC_DEFAULT_USER_MENU_PERMISSIONS_JSON}'::jsonb, true)
ON CONFLICT (role_key) DO UPDATE SET
    name = EXCLUDED.name,
    scope = EXCLUDED.scope,
    is_builtin = EXCLUDED.is_builtin,
    permissions = CASE WHEN rbac_roles.permissions = '[]'::jsonb THEN EXCLUDED.permissions ELSE rbac_roles.permissions END;

UPDATE rbac_user_role_bindings SET role_key = 'school-superadmin', updated_at = now() WHERE role_key = 'school-admin';
DELETE FROM rbac_roles WHERE role_key = 'school-admin';

INSERT INTO rbac_user_role_bindings (user_id, role_key, protected)
SELECT users.id, CASE WHEN users.username = 'admin' THEN 'platform-superadmin' ELSE 'platform-admin' END, users.username = 'admin'
FROM users
WHERE users.role = 'admin'
  AND NOT EXISTS (
      SELECT 1
      FROM rbac_user_role_bindings existing_binding
      WHERE existing_binding.user_id = users.id
        AND existing_binding.school_id IS NULL
  )
ON CONFLICT DO NOTHING;

UPDATE users user_record
SET admin_permissions = role.permissions,
    updated_at = now()
FROM rbac_user_role_bindings binding
JOIN rbac_roles role ON role.role_key = binding.role_key AND role.scope = 'platform'
WHERE binding.user_id = user_record.id
  AND user_record.role = 'admin'
  AND binding.school_id IS NULL;

WITH first_school_managers AS (
    SELECT id,
           row_number() OVER (PARTITION BY school_id ORDER BY created_at ASC, id ASC) AS manager_rank
    FROM school_memberships
    WHERE role = 'teacher'
      AND permissions @> '["school.manage"]'::jsonb
)
UPDATE school_memberships membership
SET is_protected_manager = true
FROM first_school_managers manager
WHERE membership.id = manager.id
  AND manager.manager_rank = 1
  AND membership.is_protected_manager = false;


INSERT INTO rbac_user_role_bindings (user_id, role_key, school_id, protected)
SELECT membership.user_id, 'school-superadmin', membership.school_id, membership.is_protected_manager
FROM school_memberships membership
WHERE membership.role = 'teacher'
  AND membership.permissions @> '["school.manage"]'::jsonb
ON CONFLICT DO NOTHING;

UPDATE rbac_user_role_bindings binding
SET protected = membership.is_protected_manager,
    updated_at = now()
FROM school_memberships membership
WHERE binding.user_id = membership.user_id
  AND binding.role_key = 'school-superadmin'
  AND binding.school_id = membership.school_id;
INSERT INTO rbac_user_role_bindings (user_id, role_key, school_id)
SELECT membership.user_id, membership.role, membership.school_id
FROM school_memberships membership
ON CONFLICT DO NOTHING;

-- School-created accounts are school identities, not foreground normal users.
-- This is idempotent and only targets the historical admin/import provisioning paths.
DELETE FROM rbac_user_role_bindings binding
USING school_memberships membership
WHERE binding.user_id = membership.user_id
  AND binding.school_id IS NULL
  AND binding.role_key = 'normal-user'
  AND membership.join_source IN ('admin', 'import');

`;
