export const POSTGRESQL_SCHOOL_COMPUTE_SCHEMA_SQL = `
ALTER TABLE commercial_orders ADD COLUMN IF NOT EXISTS production_group_id text;

CREATE TABLE IF NOT EXISTS school_compute_pools (
    school_id text PRIMARY KEY REFERENCES schools(id) ON DELETE RESTRICT,
    available_points numeric(18, 2) NOT NULL DEFAULT 0 CHECK (available_points >= 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS school_production_groups (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    leader_membership_id text NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'frozen', 'settling', 'settled', 'archived')),
    school_points_balance numeric(18, 2) NOT NULL DEFAULT 0 CHECK (school_points_balance >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (school_id, id),
    FOREIGN KEY (school_id, leader_membership_id) REFERENCES school_memberships(school_id, id)
);

CREATE TABLE IF NOT EXISTS school_compute_ledger_entries (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    group_id text,
    order_id text,
    type text NOT NULL,
    amount numeric(18, 2) NOT NULL CHECK (amount <> 0),
    balance_after numeric(18, 2) NOT NULL CHECK (balance_after >= 0),
    idempotency_key text NOT NULL UNIQUE,
    actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
    source_entry_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (school_id, group_id) REFERENCES school_production_groups(school_id, id),
    FOREIGN KEY (school_id, order_id) REFERENCES commercial_orders(assigned_school_id, id),
    FOREIGN KEY (source_entry_id) REFERENCES school_compute_ledger_entries(id)
);

CREATE INDEX IF NOT EXISTS school_compute_ledger_entries_school_created_idx ON school_compute_ledger_entries (school_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS school_compute_ledger_entries_school_group_created_idx ON school_compute_ledger_entries (school_id, group_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS school_compute_ledger_entries_school_order_created_idx ON school_compute_ledger_entries (school_id, order_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS school_production_group_members (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    group_id text NOT NULL,
    membership_id text NOT NULL,
    role text NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (school_id, id),
    UNIQUE (group_id, membership_id),
    FOREIGN KEY (school_id, group_id) REFERENCES school_production_groups(school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, membership_id) REFERENCES school_memberships(school_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS school_production_group_members_leader_unique_idx ON school_production_group_members (group_id) WHERE role = 'leader';
CREATE INDEX IF NOT EXISTS school_production_group_members_school_group_idx ON school_production_group_members (school_id, group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS school_production_group_members_school_membership_idx ON school_production_group_members (school_id, membership_id, created_at DESC);

CREATE TABLE IF NOT EXISTS school_compute_allocation_requests (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    group_id text NOT NULL,
    order_id text NOT NULL,
    requested_by_membership_id text NOT NULL,
    amount numeric(18, 2) NOT NULL CHECK (amount > 0),
    reason text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    review_note text NOT NULL DEFAULT '',
    reviewed_by_membership_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (school_id, group_id) REFERENCES school_production_groups(school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, order_id) REFERENCES commercial_orders(assigned_school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, requested_by_membership_id) REFERENCES school_memberships(school_id, id),
    FOREIGN KEY (school_id, reviewed_by_membership_id) REFERENCES school_memberships(school_id, id)
);

CREATE INDEX IF NOT EXISTS school_compute_allocation_requests_school_group_status_idx ON school_compute_allocation_requests (school_id, group_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS school_compute_group_projects (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    group_id text NOT NULL,
    order_id text NOT NULL,
    project_type text NOT NULL CHECK (project_type IN ('canvas', 'drama')),
    project_id text NOT NULL,
    created_by_membership_id text NOT NULL,
    settled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (school_id, id),
    FOREIGN KEY (school_id, group_id) REFERENCES school_production_groups(school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, order_id) REFERENCES commercial_orders(assigned_school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, created_by_membership_id) REFERENCES school_memberships(school_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS school_compute_group_projects_active_project_idx ON school_compute_group_projects (project_type, project_id) WHERE settled_at IS NULL;
CREATE INDEX IF NOT EXISTS school_compute_group_projects_school_group_created_idx ON school_compute_group_projects (school_id, group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS school_compute_group_projects_school_order_created_idx ON school_compute_group_projects (school_id, order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS school_compute_personal_advances (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    group_id text NOT NULL,
    order_id text NOT NULL,
    membership_id text NOT NULL,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_points numeric(18, 2) NOT NULL CHECK (original_points > 0),
    consumed_points numeric(18, 2) NOT NULL DEFAULT 0 CHECK (consumed_points >= 0),
    remaining_points numeric(18, 2) NOT NULL DEFAULT 0 CHECK (remaining_points >= 0),
    returned_points numeric(18, 2) NOT NULL DEFAULT 0 CHECK (returned_points >= 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'partially_consumed', 'pending_school_confirmation', 'returned', 'disputed')),
    point_record_id text NOT NULL REFERENCES point_records(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (consumed_points + remaining_points + returned_points = original_points),
    UNIQUE (school_id, id),
    UNIQUE (point_record_id),
    FOREIGN KEY (school_id, group_id) REFERENCES school_production_groups(school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, order_id) REFERENCES commercial_orders(assigned_school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, membership_id) REFERENCES school_memberships(school_id, id)
);

CREATE INDEX IF NOT EXISTS school_compute_personal_advances_school_group_order_idx ON school_compute_personal_advances (school_id, group_id, order_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS school_compute_personal_advances_school_membership_idx ON school_compute_personal_advances (school_id, membership_id, created_at DESC);

CREATE TABLE IF NOT EXISTS school_compute_settlements (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    group_id text NOT NULL,
    order_id text NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending_school_confirmation', 'completed', 'disputed')),
    unused_personal_points_returned numeric(18, 2) NOT NULL DEFAULT 0 CHECK (unused_personal_points_returned >= 0),
    consumed_personal_points_pending numeric(18, 2) NOT NULL DEFAULT 0 CHECK (consumed_personal_points_pending >= 0),
    confirmed_personal_points_returned numeric(18, 2) NOT NULL DEFAULT 0 CHECK (confirmed_personal_points_returned >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (school_id, id),
    UNIQUE (school_id, order_id),
    FOREIGN KEY (school_id, group_id) REFERENCES school_production_groups(school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, order_id) REFERENCES commercial_orders(assigned_school_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS school_compute_settlements_school_group_status_idx ON school_compute_settlements (school_id, group_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS school_compute_consumptions (
    id text PRIMARY KEY,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    group_id text NOT NULL,
    order_id text NOT NULL,
    generation_task_id text NOT NULL REFERENCES generation_tasks(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type text NOT NULL CHECK (source_type IN ('group_school_points', 'group_personal_advance')),
    source_id text NOT NULL,
    amount numeric(18, 2) NOT NULL CHECK (amount > 0),
    status text NOT NULL DEFAULT 'charged' CHECK (status IN ('charged', 'refunded', 'settled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (generation_task_id, source_type, source_id),
    FOREIGN KEY (school_id, group_id) REFERENCES school_production_groups(school_id, id) ON DELETE CASCADE,
    FOREIGN KEY (school_id, order_id) REFERENCES commercial_orders(assigned_school_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS school_compute_consumptions_school_order_created_idx ON school_compute_consumptions (school_id, order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS school_compute_consumptions_generation_task_idx ON school_compute_consumptions (generation_task_id, created_at DESC);

ALTER TABLE commercial_orders DROP CONSTRAINT IF EXISTS commercial_orders_school_group_fk;
ALTER TABLE commercial_orders ADD CONSTRAINT commercial_orders_school_group_fk
    FOREIGN KEY (assigned_school_id, production_group_id)
    REFERENCES school_production_groups(school_id, id);
`;
