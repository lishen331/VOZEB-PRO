import { Client, Pool, type QueryResult, type QueryResultRow } from "pg";

import { POSTGRESQL_SCHEMA_SQL } from "@/lib/server/database/schema";

type DatabaseProvider = "file" | "postgres";

export type QueryExecutor = {
    query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
};

const POSTGRES_TABLE_PREFIX = "vozeb_pro_";
const POSTGRES_TABLES = [
    "schema_migrations",
    "app_settings",
    "system_model_channels",
    "entitlement_plans",
    "users",
    "sessions",
    "account_deletion_requests",
    "rate_limits",
    "email_codes",
    "quota_usage",
    "point_records",
    "daily_plan_point_wallets",
    "billing_products",
    "promotion_campaigns",
    "promotion_products",
    "coupon_templates",
    "coupon_template_products",
    "billing_orders",
    "user_coupons",
    "coupon_redemptions",
    "payment_transactions",
    "billing_refund_jobs",
    "referral_programs",
    "referral_codes",
    "referral_relationships",
    "referral_rewards",
    "published_works",
    "published_work_versions",
    "published_work_assets",
    "published_work_cases",
    "published_work_likes",
    "user_follows",
    "user_blocks",
    "user_notifications",
    "billing_reconciliation_runs",
    "billing_reconciliation_rows",
    "user_plan_assignments",
    "payment_provider_events",
    "cdk_codes",
    "cdk_redemptions",
    "announcements",
    "prompts",
    "prompt_seed_sources",
    "generation_logs",
    "generation_log_assets",
    "generation_tasks",
    "generation_concurrency_reservations",
    "generation_worker_heartbeats",
    "generation_webhook_events",
    "creative_conversations",
    "creative_messages",
    "creative_assets",
    "local_media_assets",
    "object_storage_settings",
    "canvas_projects",
    "library_assets",
    "drama_projects",
    "drama_project_versions",
    "practice_sessions",
    "practice_script_projects",
    "practice_script_versions",
    "practice_script_entities",
    "practice_script_stages",
    "practice_script_agent_operations",
    "practice_copy_requests",
    "creative_run_events",
    "audit_logs",
    "schools",
    "school_memberships",
    "school_invite_codes",
    "school_classes",
    "school_class_members",
    "platform_courses",
    "platform_course_chapters",
    "platform_course_lessons",
    "course_materials",
    "school_course_assignments",
    "school_course_offerings",
    "teaching_assignments",
    "teaching_submissions",
    "commercial_orders",
    "commercial_order_participants",
    "commercial_order_deliveries",
    "school_compute_pools",
    "school_compute_ledger_entries",
    "school_production_groups",
    "school_production_group_members",
    "school_compute_allocation_requests",
    "school_compute_group_projects",
    "school_compute_personal_advances",
    "school_compute_settlements",
    "school_compute_consumptions",
    "ip_packages",
    "ip_sub_ips",
    "ip_versions",
    "ip_content_files",
    "ip_items",
    "ip_school_grants",
    "ip_usage_records",
    "ip_download_records",
    "ip_file_cleanup_queue",
    "drama_lab_ai_configs",
    "drama_lab_character_library",
    "drama_lab_scene_library",
    "drama_lab_prop_library",
    "drama_lab_async_tasks",
    "drama_lab_image_generations",
    "drama_lab_video_generations",
    "drama_lab_video_merges",
    "drama_lab_assets",
    "drama_lab_image_proxy_cache",
    "drama_lab_ai_model_map",
    "drama_lab_global_settings",
    "drama_lab_prompt_templates",
    "drama_lab_business_scenarios",
    "drama_lab_generation_settings",
    "drama_lab_story_options",
    "drama_lab_sd2_assets",
    "drama_lab_project_groups",
    "drama_lab_project_members",
    "drama_lab_project_invites",
    "drama_lab_join_requests",
    "drama_lab_approval_configs",
    "drama_lab_approvals",
    "check_ins",
] as const;

const POSTGRES_SCHEMA_OBJECTS = [
    "user_account_id_seq",
    "users_account_id_idx",
    "users_username_lower_idx",
    "users_email_lower_idx",
    "users_plan_id_idx",
    "sessions_user_id_idx",
    "sessions_expires_at_idx",
    "account_deletion_requests_user_pending_idx",
    "account_deletion_requests_user_created_idx",
    "account_deletion_requests_status_created_idx",
    "rate_limits_reset_idx",
    "email_codes_lookup_idx",
    "quota_usage_date_idx",
    "point_records_user_created_idx",
    "point_records_idempotency_idx",
    "point_records_refund_source_idx",
    "daily_plan_point_wallets_assignment_idx",
    "billing_products_plan_idx",
    "billing_products_enabled_idx",
    "promotion_campaigns_active_idx",
    "promotion_products_product_idx",
    "coupon_templates_code_idx",
    "coupon_templates_active_idx",
    "coupon_template_products_product_idx",
    "billing_orders_user_created_idx",
    "billing_orders_status_created_idx",
    "billing_orders_created_idx",
    "billing_orders_pending_expires_idx",
    "billing_orders_provider_idx",
    "billing_orders_provider_payment_idx",
    "billing_orders_product_idx",
    "user_coupons_user_status_idx",
    "user_coupons_template_user_idx",
    "user_coupons_locked_order_idx",
    "coupon_redemptions_order_idx",
    "coupon_redemptions_coupon_idx",
    "payment_transactions_order_idx",
    "payment_transactions_user_idx",
    "payment_transactions_created_idx",
    "payment_transactions_provider_trade_idx",
    "payment_transactions_provider_payment_idx",
    "billing_refund_jobs_due_idx",
    "billing_refund_jobs_provider_refund_idx",
    "billing_reconciliation_runs_provider_file_hash_idx",
    "referral_codes_code_idx",
    "referral_relationships_inviter_idx",
    "referral_relationships_risk_idx",
    "referral_relationships_ip_idx",
    "referral_relationships_payment_idx",
    "referral_rewards_relationship_role_idx",
    "referral_rewards_trigger_order_idx",
    "referral_rewards_beneficiary_idx",
    "referral_rewards_due_idx",
    "referral_rewards_status_idx",
    "published_works_slug_idx",
    "published_works_owner_updated_idx",
    "published_works_lifecycle_idx",
    "published_works_origin_updated_idx",
    "published_works_gallery_featured_idx",
    "published_works_gallery_popular_idx",
    "published_work_versions_work_number_idx",
    "published_work_versions_moderation_idx",
    "published_work_versions_public_idx",
    "published_work_versions_public_category_idx",
    "published_work_versions_public_tags_idx",
    "published_work_versions_public_search_idx",
    "published_work_assets_unique_role",
    "published_work_assets_version_order_idx",
    "published_work_assets_storage_idx",
    "published_work_cases_open_unique_idx",
    "published_work_cases_admin_idx",
    "published_work_cases_work_idx",
    "published_work_likes_user_created_idx",
    "published_work_likes_work_created_idx",
    "user_follows_followed_created_idx",
    "user_follows_follower_created_idx",
    "user_blocks_blocked_created_idx",
    "user_notifications_dedup_idx",
    "user_notifications_user_created_idx",
    "user_notifications_unread_idx",
    "billing_reconciliation_runs_created_idx",
    "billing_reconciliation_runs_provider_created_idx",
    "billing_reconciliation_rows_run_idx",
    "billing_reconciliation_rows_issue_codes_gin_idx",
    "user_plan_assignments_user_active_idx",
    "user_plan_assignments_plan_idx",
    "user_plan_assignments_source_idx",
    "user_plan_assignments_source_unique_idx",
    "payment_provider_events_provider_created_idx",
    "payment_provider_events_provider_event_idx",
    "cdk_codes_status_idx",
    "cdk_codes_status_created_idx",
    "cdk_redemptions_user_id_idx",
    "announcements_visible_idx",
    "prompts_scope_updated_idx",
    "prompts_owner_updated_idx",
    "prompts_tags_gin_idx",
    "generation_logs_user_created_idx",
    "generation_logs_created_idx",
    "generation_logs_admin_filter_idx",
    "generation_logs_conversation_idx",
    "generation_log_assets_log_idx",
    "generation_tasks_user_status_idx",
    "generation_tasks_expires_idx",
    "generation_tasks_user_client_request_idx",
    "generation_tasks_channel_upstream_idx",
    "generation_tasks_conversation_idx",
    "generation_tasks_run_idx",
    "generation_tasks_workflow_idx",
    "generation_tasks_user_project_idx",
    "generation_tasks_recovery_due_idx",
    "generation_concurrency_reservations_expires_idx",
    "generation_worker_heartbeats_seen_idx",
    "generation_webhook_events_received_idx",
    "creative_conversations_user_updated_idx",
    "creative_conversations_user_source_idx",
    "creative_conversations_project_idx",
    "creative_messages_conversation_sequence_idx",
    "creative_messages_run_idx",
    "creative_assets_conversation_idx",
    "creative_assets_run_idx",
    "local_media_assets_owner_created_idx",
    "local_media_assets_source_idx",
    "local_media_assets_expires_idx",
    "local_media_assets_local_created_idx",
    "local_media_assets_local_filter_idx",
    "local_media_assets_storage_provider_check",
    "local_media_assets_external_object_idx",
    "canvas_projects_user_updated_idx",
    "library_assets_user_updated_idx",
    "drama_projects_user_updated_idx",
    "canvas_projects_user_profile_updated_idx",
    "drama_projects_user_profile_updated_idx",
    "practice_sessions_school_user_request_idx",
    "practice_sessions_user_updated_idx",
    "practice_sessions_project_updated_idx",
    "practice_script_projects_owner_updated_idx",
    "practice_script_versions_project_created_idx",
    "practice_script_entities_project_type_idx",
    "practice_script_stages_project_updated_idx",
    "practice_script_agent_operations_project_created_idx",
    "practice_script_projects_set_updated_at",
    "practice_script_entities_set_updated_at",
    "practice_script_stages_set_updated_at",
    "practice_copy_requests_project_idx",
    "drama_project_versions_user_created_idx",
    "creative_run_events_run_id_idx",
    "audit_logs_created_idx",
    "audit_logs_action_idx",
    "audit_logs_actor_user_idx",
    "audit_logs_target_idx",
    "schools_status_updated_idx",
    "school_memberships_school_status_updated_idx",
    "school_memberships_school_role_updated_idx",
    "school_invite_codes_school_status_updated_idx",
    "school_classes_school_status_updated_idx",
    "school_class_members_school_class_idx",
    "school_class_members_school_membership_idx",
    "platform_courses_status_updated_idx",
    "platform_courses_deleted_by_user_id_fkey",
    "platform_course_chapters_course_sort_idx",
    "platform_course_lessons_course_chapter_sort_idx",
    "course_materials_course_target_sort_idx",
    "course_materials_assignment_status_updated_idx",
    "school_course_assignments_course_id_id_idx",
    "school_course_assignments_school_status_updated_idx",
    "school_course_assignments_course_updated_idx",
    "school_course_offerings_school_status_updated_idx",
    "school_course_offerings_school_teacher_updated_idx",
    "teaching_assignments_school_status_updated_idx",
    "teaching_assignments_school_offering_updated_idx",
    "teaching_assignments_school_chapter_idx",
    "teaching_assignments_school_lesson_idx",
    "teaching_assignments_course_target",
    "teaching_submissions_school_status_updated_idx",
    "teaching_submissions_school_student_updated_idx",
    "commercial_orders_status_updated_idx",
    "commercial_orders_school_status_updated_idx",
    "commercial_orders_school_teacher_updated_idx",
    "commercial_order_participants_school_status_updated_idx",
    "commercial_order_participants_school_order_updated_idx",
    "commercial_order_participants_school_member_updated_idx",
    "commercial_order_deliveries_school_status_updated_idx",
    "commercial_order_deliveries_school_order_created_idx",
    "school_compute_ledger_entries_school_created_idx",
    "school_compute_ledger_entries_school_group_created_idx",
    "school_compute_ledger_entries_school_order_created_idx",
    "school_production_group_members_leader_unique_idx",
    "school_production_group_members_school_group_idx",
    "school_production_group_members_school_membership_idx",
    "school_compute_allocation_requests_school_group_status_idx",
    "school_compute_group_projects_active_project_idx",
    "school_compute_group_projects_school_group_created_idx",
    "school_compute_group_projects_school_order_created_idx",
    "school_compute_personal_advances_school_group_order_idx",
    "school_compute_personal_advances_school_membership_idx",
    "school_compute_settlements_school_group_status_idx",
    "school_compute_consumptions_school_order_created_idx",
    "school_compute_consumptions_generation_task_idx",
    "ip_packages_slug_idx",
    "ip_packages_visibility_status_updated_idx",
    "ip_packages_visibility_check",
    "ip_packages_status_check",
    "ip_packages_cover_file_fk",
    "ip_packages_cover_file_ip_fk",
    "ip_sub_ips_ip_order_idx",
    "ip_sub_ips_cover_file_idx",
    "ip_sub_ips_cover_file_fk",
    "ip_sub_ips_cover_file_sub_ip_fk",
    "ip_sub_ips_tags_check",
    "ip_sub_ips_id_ip_unique",
    "ip_content_files_kind_check",
    "ip_content_files_storage_provider_check",
    "ip_content_files_status_check",
    "ip_content_files_byte_size_check",
    "ip_content_files_metadata_check",
    "ip_content_files_id_ip_unique",
    "ip_content_files_id_sub_ip_unique",
    "ip_content_files_sub_ip_ip_fk",
    "ip_content_files_ip_sub_ip_status_created_idx",
    "ip_content_files_storage_idx",
    "ip_versions_ip_number_unique",
    "ip_versions_id_ip_unique",
    "ip_versions_tags_check",
    "ip_versions_cover_file_fk",
    "ip_versions_ip_status_created_idx",
    "ip_versions_cover_file_idx",
    "ip_items_file_required_check",
    "ip_items_file_fk",
    "ip_items_kind_check",
    "ip_items_category_check",
    "ip_items_file_sub_ip_fk",
    "ip_items_sub_ip_order_idx",
    "ip_items_sub_ip_kind_category_idx",
    "ip_items_file_idx",
    "ip_school_grants_ip_sub_ip_school_created_idx",
    "ip_school_grants_school_status_window_idx",
    "ip_school_grants_mode_check",
    "ip_school_grants_status_check",
    "ip_school_grants_window_check",
    "ip_usage_records_ip_created_idx",
    "ip_usage_records_sub_ip_created_idx",
    "ip_usage_records_school_created_idx",
    "ip_usage_records_user_created_idx",
    "ip_usage_records_item_ids_check",
    "ip_usage_records_action_check",
    "ip_usage_records_target_type_check",
    "ip_download_records_type_check",
    "ip_download_records_result_check",
    "ip_download_records_item_check",
    "ip_download_records_ip_created_idx",
    "ip_download_records_sub_ip_created_idx",
    "ip_download_records_school_created_idx",
    "ip_download_records_user_created_idx",
    "ip_file_cleanup_queue_provider_check",
    "drama_lab_ai_configs_user_active_idx",
    "drama_lab_character_library_user_idx",
    "drama_lab_character_library_project_idx",
    "drama_lab_scene_library_user_idx",
    "drama_lab_scene_library_project_idx",
    "drama_lab_prop_library_user_idx",
    "drama_lab_prop_library_project_idx",
    "drama_lab_async_tasks_user_status_idx",
    "drama_lab_async_tasks_resource_idx",
    "drama_lab_image_generations_user_idx",
    "drama_lab_image_generations_project_idx",
    "drama_lab_image_generations_task_idx",
    "drama_lab_video_generations_user_idx",
    "drama_lab_video_generations_project_idx",
    "drama_lab_video_generations_task_idx",
    "drama_lab_video_merges_user_idx",
    "drama_lab_video_merges_project_idx",
    "drama_lab_assets_user_idx",
    "drama_lab_assets_project_idx",
    "drama_lab_image_proxy_cache_created_idx",
    "drama_lab_ai_model_map_user_key_idx",
    "drama_lab_prompt_templates_user_category_idx",
    "drama_lab_prompt_templates_user_key_idx",
    "drama_lab_prompt_templates_global_key_idx",
    "drama_lab_business_scenarios_user_updated_idx",
    "drama_lab_story_options_user_kind_value_idx",
    "drama_lab_sd2_assets_user_type_idx",
    "drama_lab_project_groups_owner_idx",
    "drama_lab_project_members_group_status_idx",
    "drama_lab_project_members_user_idx",
    "drama_lab_project_invites_group_idx",
    "drama_lab_join_requests_group_status_idx",
    "drama_lab_join_requests_pending_idx",
    "drama_lab_approval_configs_group_idx",
    "drama_lab_approvals_project_status_idx",
    "drama_lab_approvals_group_reviewer_idx",
    "drama_lab_approvals_group_created_idx",
    "drama_lab_project_members_role",
    "drama_lab_project_members_status",
    "drama_lab_approval_configs_reviewer_scope",
    "drama_lab_join_requests_status",
    "drama_lab_approvals_status",
    "drama_projects_episodes_gin_idx",
    "drama_projects_characters_gin_idx",
    "drama_projects_scenes_gin_idx",
    "ip_library_validate_school_grant",
    "ip_school_grants_validate",
    "ip_packages_set_updated_at",
    "ip_sub_ips_set_updated_at",
    "ip_school_grants_set_updated_at",
    "ip_content_files_set_updated_at",
    "entitlement_plans_set_updated_at",
    "app_settings_set_updated_at",
    "system_model_channels_set_updated_at",
    "users_set_updated_at",
    "daily_plan_point_wallets_set_updated_at",
    "billing_products_set_updated_at",
    "promotion_campaigns_set_updated_at",
    "coupon_templates_set_updated_at",
    "billing_orders_set_updated_at",
    "user_coupons_set_updated_at",
    "coupon_redemptions_set_updated_at",
    "payment_transactions_set_updated_at",
    "referral_programs_set_updated_at",
    "referral_codes_set_updated_at",
    "referral_relationships_set_updated_at",
    "referral_rewards_set_updated_at",
    "published_works_set_updated_at",
    "published_work_versions_set_updated_at",
    "published_work_cases_set_updated_at",
    "billing_reconciliation_runs_set_updated_at",
    "billing_reconciliation_rows_set_updated_at",
    "user_plan_assignments_set_updated_at",
    "payment_provider_events_set_updated_at",
    "cdk_codes_set_updated_at",
    "announcements_set_updated_at",
    "prompts_set_updated_at",
    "generation_logs_set_updated_at",
    "drama_projects_set_updated_at",
    "practice_sessions_set_updated_at",
    "practice_copy_requests_set_updated_at",
    "vozeb_pro_prevent_project_identity_change",
    "canvas_projects_identity_immutable",
    "drama_projects_identity_immutable",
    "object_storage_settings_set_updated_at",
] as const;

const POSTGRES_RELATION_NAMES = new Set<string>([...POSTGRES_TABLES, ...POSTGRES_SCHEMA_OBJECTS]);
const POSTGRES_IDENTIFIER_PATTERN = new RegExp(`(?<!${POSTGRES_TABLE_PREFIX})\\b(${[...POSTGRES_SCHEMA_OBJECTS, ...POSTGRES_TABLES].join("|")})\\b`, "g");
const POSTGRES_RELATION_LITERAL_FUNCTIONS = new Set<string>(["currval", "nextval", "pg_get_serial_sequence", "setval", "to_regclass"]);
const POSTGRES_CATALOG_OBJECT_NAME_COLUMNS = new Set<string>(["conname", "indexname", "proname", "relname", "sequencename", "tgname"]);

const globalForPostgres = globalThis as typeof globalThis & {
    __vozebProPostgresPool?: Pool;
    __vozebProPostgresSchemaReady?: Promise<void>;
    __vozebProPostgresNotifications?: PostgresNotificationState;
};

type PostgresNotificationListener = (payload: string) => void;
const POSTGRES_SCHEMA_LOCK_KEY = "vozeb-pro:schema";
type PostgresNotificationState = {
    client?: Client;
    connecting?: Promise<void>;
    reconnectTimer?: ReturnType<typeof setTimeout>;
    listeners: Map<string, Set<PostgresNotificationListener>>;
};

export function getDatabaseProvider(): DatabaseProvider {
    return process.env.VOZEB_PRO_DATABASE_PROVIDER?.trim().toLowerCase() === "file" ? "file" : "postgres";
}

export function isPostgresDatabaseEnabled() {
    return getDatabaseProvider() === "postgres";
}

export function getPostgresConnectionString() {
    return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || "";
}

function getPostgresPool() {
    const connectionString = getPostgresConnectionString();
    if (!connectionString) throw new Error("DATABASE_URL is required when VOZEB_PRO_DATABASE_PROVIDER=postgres");

    if (!globalForPostgres.__vozebProPostgresPool) {
        globalForPostgres.__vozebProPostgresPool = new Pool({
            connectionString,
            max: normalizePoolMax(process.env.VOZEB_PRO_DATABASE_POOL_MAX),
            ssl: postgresSslConfig(),
        });
    }

    return globalForPostgres.__vozebProPostgresPool;
}

export async function postgresQuery<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    return getPostgresPool().query<T>(prefixPostgresSql(text), values);
}

export async function withPostgresTransaction<T>(handler: (client: QueryExecutor) => Promise<T>) {
    const client = await getPostgresPool().connect();
    let queryQueue = Promise.resolve();
    let queryFailed = false;
    let queryError: unknown;
    const executor: QueryExecutor = {
        query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
            const pending = queryQueue.then(async () => {
                if (queryFailed) throw queryError;
                try {
                    return await client.query<T>(prefixPostgresSql(text), values);
                } catch (error) {
                    queryFailed = true;
                    queryError = error;
                    throw error;
                }
            });
            queryQueue = pending.then(
                () => undefined,
                () => undefined,
            );
            return pending;
        },
    };
    try {
        await client.query("BEGIN");
        const result = await handler(executor);
        await queryQueue;
        if (queryFailed) throw queryError;
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await queryQueue;
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function subscribePostgresNotification(channel: string, listener: PostgresNotificationListener) {
    const name = normalizeNotificationChannel(channel);
    const state: PostgresNotificationState = globalForPostgres.__vozebProPostgresNotifications ?? (globalForPostgres.__vozebProPostgresNotifications = { listeners: new Map() });
    const existing = state.listeners.get(name);
    const listeners = existing || new Set<PostgresNotificationListener>();
    listeners.add(listener);
    state.listeners.set(name, listeners);
    if (state.client && !existing) await state.client.query(`LISTEN ${name}`);
    else await ensurePostgresNotificationClient(state);
    return () => {
        const current = state.listeners.get(name);
        current?.delete(listener);
        if (!current?.size) state.listeners.delete(name);
    };
}

async function ensurePostgresNotificationClient(state: PostgresNotificationState) {
    if (state.client) return;
    if (state.connecting) return state.connecting;
    const connectionString = getPostgresConnectionString();
    if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL notifications");
    const client = new Client({ connectionString, ssl: postgresSslConfig() });
    state.connecting = (async () => {
        await client.connect();
        client.on("notification", (message) => {
            for (const listener of [...(state.listeners.get(message.channel) || [])]) listener(message.payload || "");
        });
        client.on("error", () => reconnectPostgresNotifications(state, client));
        for (const channel of state.listeners.keys()) await client.query(`LISTEN ${channel}`);
        state.client = client;
    })().finally(() => {
        state.connecting = undefined;
    });
    return state.connecting;
}

function reconnectPostgresNotifications(state: PostgresNotificationState, client: Client) {
    if (state.client === client) state.client = undefined;
    void client.end().catch(() => undefined);
    if (!state.listeners.size || state.reconnectTimer) return;
    state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = undefined;
        void ensurePostgresNotificationClient(state).catch(() => reconnectPostgresNotifications(state, client));
    }, 1_000);
    state.reconnectTimer.unref?.();
}

function normalizeNotificationChannel(value: string) {
    const channel = value.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(channel)) throw new Error("Invalid PostgreSQL notification channel");
    return channel;
}

export async function ensurePostgresSchema() {
    if (globalForPostgres.__vozebProPostgresSchemaReady) return globalForPostgres.__vozebProPostgresSchemaReady;

    const result = await getPostgresPool().query<{ table_name: string | null }>("SELECT to_regclass('public.vozeb_pro_users')::text AS table_name");
    if (!result.rows[0]?.table_name) throw new Error("PostgreSQL schema has not been initialized");

    return initializePostgresSchema();
}

export async function initializePostgresSchema() {
    if (!globalForPostgres.__vozebProPostgresSchemaReady) {
        globalForPostgres.__vozebProPostgresSchemaReady = withPostgresTransaction(async (client) => {
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [POSTGRES_SCHEMA_LOCK_KEY]);
            await client.query(prefixPostgresSql(POSTGRESQL_SCHEMA_SQL));
        })
            .then(() => undefined)
            .catch((error) => {
                globalForPostgres.__vozebProPostgresSchemaReady = undefined;
                throw error;
            });
    }
    return globalForPostgres.__vozebProPostgresSchemaReady;
}

function prefixPostgresSql(sql: string) {
    let result = "";
    let segmentStart = 0;
    let cursor = 0;

    while (cursor < sql.length) {
        if (sql.startsWith("--", cursor)) {
            result += prefixPostgresIdentifiers(sql.slice(segmentStart, cursor));
            const commentEnd = sql.indexOf("\n", cursor + 2);
            const end = commentEnd === -1 ? sql.length : commentEnd + 1;
            result += sql.slice(cursor, end);
            cursor = end;
            segmentStart = end;
            continue;
        }
        if (sql.startsWith("/*", cursor)) {
            result += prefixPostgresIdentifiers(sql.slice(segmentStart, cursor));
            const end = findPostgresBlockCommentEnd(sql, cursor);
            result += sql.slice(cursor, end);
            cursor = end;
            segmentStart = end;
            continue;
        }
        if (sql[cursor] === "$") {
            const delimiter = readPostgresDollarDelimiter(sql, cursor);
            if (delimiter) {
                result += prefixPostgresIdentifiers(sql.slice(segmentStart, cursor));
                const bodyStart = cursor + delimiter.length;
                const closingStart = sql.indexOf(delimiter, bodyStart);
                const end = closingStart === -1 ? sql.length : closingStart + delimiter.length;
                if (closingStart !== -1 && isPostgresExecutableDollarBody(sql, cursor)) {
                    result += delimiter + prefixPostgresSql(sql.slice(bodyStart, closingStart)) + delimiter;
                } else {
                    result += sql.slice(cursor, end);
                }
                cursor = end;
                segmentStart = end;
                continue;
            }
        }
        if (sql[cursor] === "'") {
            result += prefixPostgresIdentifiers(sql.slice(segmentStart, cursor));
            const end = findPostgresStringEnd(sql, cursor);
            result += prefixPostgresRelationLiteral(sql, cursor, end);
            cursor = end;
            segmentStart = end;
            continue;
        }
        cursor += 1;
    }

    return result + prefixPostgresIdentifiers(sql.slice(segmentStart));
}

function prefixPostgresIdentifiers(sql: string) {
    return sql.replace(POSTGRES_IDENTIFIER_PATTERN, `${POSTGRES_TABLE_PREFIX}$1`);
}

function readPostgresDollarDelimiter(sql: string, start: number) {
    let cursor = start + 1;
    if (sql[cursor] === "$") return "$$";
    if (!/[a-z_]/i.test(sql[cursor] || "")) return "";
    cursor += 1;
    while (/[a-z0-9_]/i.test(sql[cursor] || "")) cursor += 1;
    return sql[cursor] === "$" ? sql.slice(start, cursor + 1) : "";
}

function isPostgresExecutableDollarBody(sql: string, start: number) {
    let cursor = start - 1;
    while (cursor >= 0 && /\s/.test(sql[cursor])) cursor -= 1;
    const wordEnd = cursor + 1;
    while (cursor >= 0 && /[a-z]/i.test(sql[cursor])) cursor -= 1;
    const precedingWord = sql.slice(cursor + 1, wordEnd).toLowerCase();
    if (precedingWord === "do") return true;
    if (precedingWord !== "as") return false;
    const statement = sql.slice(sql.lastIndexOf(";", cursor) + 1, start);
    return /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\b/i.test(statement);
}

function findPostgresStringEnd(sql: string, start: number) {
    const escapeBackslashes = sql[start - 1]?.toLowerCase() === "e" && !/[a-z0-9_$]/i.test(sql[start - 2] || "");
    let cursor = start + 1;
    while (cursor < sql.length) {
        if (escapeBackslashes && sql[cursor] === "\\") {
            cursor += 2;
            continue;
        }
        if (sql[cursor] !== "'") {
            cursor += 1;
            continue;
        }
        if (sql[cursor + 1] === "'") {
            cursor += 2;
            continue;
        }
        return cursor + 1;
    }
    return sql.length;
}

function findPostgresBlockCommentEnd(sql: string, start: number) {
    let depth = 1;
    let cursor = start + 2;
    while (cursor < sql.length && depth > 0) {
        if (sql.startsWith("/*", cursor)) {
            depth += 1;
            cursor += 2;
        } else if (sql.startsWith("*/", cursor)) {
            depth -= 1;
            cursor += 2;
        } else {
            cursor += 1;
        }
    }
    return cursor;
}

function prefixPostgresRelationLiteral(sql: string, start: number, end: number) {
    const literal = sql.slice(start, end);
    const shouldPrefix = isPostgresRelationLiteralContext(sql, start, end) || isPostgresCatalogObjectLiteralContext(sql, start);
    if (!shouldPrefix) return literal;

    const value = literal.slice(1, -1);
    const separator = value.lastIndexOf(".");
    const qualifier = separator === -1 ? "" : value.slice(0, separator + 1);
    const name = separator === -1 ? value : value.slice(separator + 1);
    return POSTGRES_RELATION_NAMES.has(name) ? `'${qualifier}${POSTGRES_TABLE_PREFIX}${name}'` : literal;
}

function isPostgresRelationLiteralContext(sql: string, start: number, end: number) {
    if (/^\s*::\s*(?:pg_catalog\.)?regclass\b/i.test(sql.slice(end))) return true;

    let cursor = start - 1;
    while (cursor >= 0 && /\s/.test(sql[cursor])) cursor -= 1;
    if (sql[cursor] !== "(") return false;
    cursor -= 1;
    while (cursor >= 0 && /\s/.test(sql[cursor])) cursor -= 1;
    const nameEnd = cursor + 1;
    while (cursor >= 0 && /[a-z0-9_.]/i.test(sql[cursor])) cursor -= 1;
    const functionName =
        sql
            .slice(cursor + 1, nameEnd)
            .split(".")
            .pop()
            ?.toLowerCase() || "";
    return POSTGRES_RELATION_LITERAL_FUNCTIONS.has(functionName);
}

function isPostgresCatalogObjectLiteralContext(sql: string, start: number) {
    let cursor = start - 1;
    while (cursor >= 0 && /\s/.test(sql[cursor])) cursor -= 1;
    if (sql[cursor] !== "=") return false;
    cursor -= 1;
    while (cursor >= 0 && /\s/.test(sql[cursor])) cursor -= 1;
    const nameEnd = cursor + 1;
    while (cursor >= 0 && /[a-z0-9_.]/i.test(sql[cursor])) cursor -= 1;
    const columnName =
        sql
            .slice(cursor + 1, nameEnd)
            .split(".")
            .pop()
            ?.toLowerCase() || "";
    return POSTGRES_CATALOG_OBJECT_NAME_COLUMNS.has(columnName);
}

function normalizePoolMax(value: string | undefined) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(50, Math.floor(parsed)) : 10;
}

function parseBoolean(value: string | undefined) {
    return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() || "");
}

function postgresSslConfig() {
    if (!parseBoolean(process.env.VOZEB_PRO_DATABASE_SSL)) return undefined;
    const rejectUnauthorized = !["0", "false", "no", "off"].includes(process.env.VOZEB_PRO_DATABASE_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() || "");
    const ca = process.env.VOZEB_PRO_DATABASE_SSL_CA?.trim().replace(/\\n/g, "\n") || "";
    return { rejectUnauthorized, ...(ca ? { ca } : {}) };
}
