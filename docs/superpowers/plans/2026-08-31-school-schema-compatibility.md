# School Schema Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the school-course schema initializer upgrade the previous JSON-based PostgreSQL schema without blocking authentication or other database-backed APIs.

**Architecture:** Keep the existing single transactional initializer, but make the school-domain DDL explicitly additive and ordered: add missing columns to legacy tables before creating dependent indexes and constraints, while preserving legacy JSON columns. Strengthen readiness so it executes the schema initializer and reports failures, and make staging deployment wait on the database-aware readiness endpoint.

**Tech Stack:** Next.js Route Handlers, TypeScript, PostgreSQL, Vitest, GitHub Actions.

## Global Constraints

- Preserve existing user changes and untracked files.
- Do not reset passwords or delete/rebuild the production database.
- Keep old course JSON columns; do not perform destructive data conversion.
- Run documentation update and validation scripts before every push.
- Run focused tests, full release checks, and remote health/API verification before claiming completion.

### Task 1: Reproduce legacy schema failure

**Files:**
- Modify: `web/src/lib/server/database/school-domain-schema.postgres.test.ts`

- [x] Add a PostgreSQL integration test that creates legacy `platform_courses` and `teaching_assignments` tables without new columns, inserts legacy rows, runs the school-domain schema twice, and asserts new tables/columns exist and legacy JSON data remains.
- [x] Run the focused integration test against a dedicated PostgreSQL database and verify the repeatable upgrade succeeds after the compatibility DDL is added.

### Task 2: Add ordered idempotent compatibility DDL

**Files:**
- Modify: `web/src/lib/server/database/schema-school-domain.ts`

- [x] Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for `platform_courses.deleted_at`, `platform_courses.deleted_by_user_id`, `teaching_assignments.chapter_id`, and `teaching_assignments.lesson_id` before dependent indexes.
- [x] Preserve old JSON columns and make the target constraints repeatable with guarded `ADD CONSTRAINT` blocks.
- [x] Keep new table creation before foreign-key/index statements that depend on those tables and columns.
- [x] Run the legacy upgrade test and the existing school-domain PostgreSQL tests until green.
- [x] Register the prefixed soft-delete foreign-key name and verify a fresh prefixed schema creates exactly one constraint.

### Task 3: Make readiness schema-aware

**Files:**
- Modify: `web/src/lib/server/install-status.ts`
- Modify: `web/src/app/api/health/ready/route.ts`
- Test: `web/src/lib/server/install-status.test.ts`

- [x] Ensure PostgreSQL status calls the initializer after confirming connectivity, so `schemaReady=true` is only returned when the complete idempotent schema succeeds.
- [x] Add tests for initializer failure yielding `schemaReady=false` and for a successful repeatable initialization.
- [x] Preserve the existing worker heartbeat check in `/api/health/ready`.

### Task 4: Gate staging on readiness

**Files:**
- Modify: `.github/workflows/staging-image.yml`

- [x] Change the post-deploy probe to require `/api/health/ready` and print non-secret compose status on failure.
- [x] Include the legacy upgrade regression in the PostgreSQL Quality job and include application/Worker logs in staging failure diagnostics.
- [x] Keep liveness as the container healthcheck; use readiness only as deployment acceptance.

### Task 5: Verify, document, commit, and deploy

- [x] Run focused tests, full `pnpm run check:release`, documentation update/validation scripts, and `git diff`/`git status` checks.
- [ ] Commit tracked changes, push `origin/main`, create the delivery branch and `lishen331:develop` PR, enable squash auto-merge, and wait for Quality/Staging image workflows.
- [ ] Verify `/api/health/live`, `/api/health/ready`, session, announcements, gallery, and login behavior remotely; report any remaining worker or infrastructure failure with evidence.
