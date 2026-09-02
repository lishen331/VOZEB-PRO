import { createHash, randomBytes, randomUUID } from "node:crypto";

import { getDramaProject, getDramaProjectWithOwner } from "@/lib/server/drama-project-store";
import { summarizeDramaProject } from "@/lib/drama-project-summary";
import { ensurePostgresSchema, getDatabaseProvider, postgresQuery, withPostgresTransaction } from "@/lib/server/database";
import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "@/lib/server/data-adapter";

export const DRAMA_LAB_APPROVAL_STAGES = ["script", "assets", "storyboard", "storyboard_image", "storyboard_video", "final_export"] as const;
export type DramaLabApprovalStage = (typeof DRAMA_LAB_APPROVAL_STAGES)[number];
export type DramaLabProjectRole = "owner" | "admin" | "member";
export type DramaLabMemberStatus = "active" | "removed" | "left";
export type DramaLabJoinRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type DramaLabApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export type DramaLabReviewerScope = "owner" | "admins";

const STAGE_ALIASES: Record<string, DramaLabApprovalStage> = {
    asset_prompts: "assets",
    visual_images: "storyboard_image",
    final_cut: "final_export",
    video: "storyboard_video",
};

export type DramaLabProjectGroup = {
    id: string;
    projectId: string;
    ownerUserId: string;
    createdAt: string;
    updatedAt: string;
    lastTransferBy?: string;
    lastTransferAt?: string;
};

export type DramaLabProjectMember = {
    userId: string;
    role: DramaLabProjectRole;
    status: DramaLabMemberStatus;
    permissions: { manageMembers: boolean; approve: boolean };
    joinedAt: string;
    updatedAt: string;
};

export type DramaLabInvite = {
    id: string;
    projectId: string;
    expiresAt: string;
    revokedAt?: string;
    createdBy: string;
    createdAt: string;
    /** Only returned when an invite is created or rotated. */
    token?: string;
};

export type DramaLabJoinRequest = {
    id: string;
    projectId: string;
    applicantUserId: string;
    inviteId?: string;
    status: DramaLabJoinRequestStatus;
    reviewedBy?: string;
    reviewedAt?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
};

export type DramaLabApprovalConfig = {
    stage: DramaLabApprovalStage;
    enabled: boolean;
    reviewerScope: DramaLabReviewerScope;
    reviewerUserIds: string[];
    strictMode: boolean;
    updatedAt: string;
    updatedBy: string;
};

export type DramaLabApprovalRecord = {
    id: string;
    projectId: string;
    episodeId?: string;
    stage: DramaLabApprovalStage;
    resourceType: string;
    resourceId: string;
    versionId?: string;
    versionNumber?: number;
    submittedBy: string;
    submittedAt: string;
    snapshot?: unknown;
    status: DramaLabApprovalStatus;
    reviewerId?: string;
    reviewComment?: string;
    reviewedAt?: string;
    createdAt: string;
    updatedAt: string;
    location: { projectId: string; episodeId?: string; stage: DramaLabApprovalStage; resourceType: string; resourceId: string };
};

export type DramaLabCollaborationOverview = {
    group: DramaLabProjectGroup;
    /** Identity of the caller; used by the workbench to show permitted actions. */
    viewerUserId: string;
    members: DramaLabProjectMember[];
    invites: DramaLabInvite[];
    joinRequests: DramaLabJoinRequest[];
    approvalConfigs: DramaLabApprovalConfig[];
};

type StoredState = {
    version: 1;
    groups: DramaLabProjectGroup[];
    members: Array<DramaLabProjectMember & { groupId: string }>;
    invites: Array<DramaLabInvite & { groupId: string; tokenHash: string }>;
    joinRequests: Array<DramaLabJoinRequest & { groupId: string }>;
    approvalConfigs: Array<DramaLabApprovalConfig & { groupId: string }>;
    approvals: Array<DramaLabApprovalRecord & { groupId: string }>;
};

const FILE_NAME = "drama-lab-collaboration.json";
const PROJECT_FILE_NAME = "drama-projects.json";
const MAX_SNAPSHOT_BYTES = 512 * 1024;

export class DramaLabCollaborationError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

/** Ensure every newly-created Short Drama Lab project has a group and owner row. */
export async function ensureDramaLabProjectGroup(projectId: string, ownerUserId: string): Promise<DramaLabProjectGroup> {
    const project = await getDramaProject(projectId, ownerUserId);
    if (!project) throw new DramaLabCollaborationError("短剧项目不存在", 404);
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        return withPostgresTransaction(async (client) => {
            const existing = await client.query<DbGroup>("SELECT * FROM drama_lab_project_groups WHERE project_id = $1 FOR UPDATE", [projectId]);
            if (existing.rows[0]) return mapGroup(existing.rows[0]);
            const now = new Date().toISOString();
            const groupId = `drama-group-${randomUUID()}`;
            await client.query("INSERT INTO drama_lab_project_groups (id, project_id, owner_user_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$4)", [groupId, projectId, ownerUserId, new Date(now)]);
            await client.query("INSERT INTO drama_lab_project_members (group_id, user_id, role, status, permissions, joined_at, updated_at) VALUES ($1,$2,'owner','active',$3::jsonb,$4,$4)", [groupId, ownerUserId, JSON.stringify({ manageMembers: true, approve: true }), new Date(now)]);
            return { id: groupId, projectId, ownerUserId, createdAt: now, updatedAt: now };
        });
    }
    return withJsonDataFileLock(FILE_NAME, async () => {
        const state = await readState();
        const existing = state.groups.find((item) => item.projectId === projectId);
        if (existing) return existing;
        const now = new Date().toISOString();
        const group: DramaLabProjectGroup = { id: `drama-group-${randomUUID()}`, projectId, ownerUserId, createdAt: now, updatedAt: now };
        state.groups.unshift(group);
        state.members.unshift({ groupId: group.id, userId: ownerUserId, role: "owner", status: "active", permissions: { manageMembers: true, approve: true }, joinedAt: now, updatedAt: now });
        await writeState(state);
        return group;
    });
}

/** Lazily backfill collaboration rows for projects created before Phase 3. */
export async function ensureDramaLabProjectGroupForUser(userId: string, projectId: string) {
    const existing = await getDramaLabProjectGroup(projectId);
    if (existing) return existing;
    const project = await getDramaProject(projectId, userId);
    if (!project) throw new DramaLabCollaborationError("短剧项目不存在", 404);
    return ensureDramaLabProjectGroup(projectId, userId);
}

export async function getDramaLabProjectGroup(projectId: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<DbGroup>("SELECT * FROM drama_lab_project_groups WHERE project_id = $1", [projectId]);
        return result.rows[0] ? mapGroup(result.rows[0]) : null;
    }
    return (await readState()).groups.find((group) => group.projectId === projectId) || null;
}

export async function getDramaLabMembership(userId: string, projectId: string) {
    const group = await getDramaLabProjectGroup(projectId);
    if (!group) return null;
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<DbMember>("SELECT * FROM drama_lab_project_members WHERE group_id = $1 AND user_id = $2 AND status = 'active'", [group.id, userId]);
        return result.rows[0] ? mapMember(result.rows[0]) : null;
    }
    const row = (await readState()).members.find((member) => member.groupId === group.id && member.userId === userId && member.status === "active");
    return row ? stripGroupId(row) : null;
}

/**
 * Return the short-drama projects that the caller can access through the
 * collaboration graph.  Consumers that read owner-backed records (for
 * example the episode Canvas index) must use project IDs rather than the
 * caller's account ID: ownership transfer deliberately leaves the physical
 * storage owner unchanged.
 */
export async function listDramaLabProjectIdsForUser(userId: string) {
    const cleanUserId = typeof userId === "string" ? userId.trim() : "";
    if (!cleanUserId) return [];
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ project_id: string }>(
            "SELECT DISTINCT project.id AS project_id FROM drama_projects project LEFT JOIN drama_lab_project_groups group_row ON group_row.project_id = project.id LEFT JOIN drama_lab_project_members member ON member.group_id = group_row.id AND member.user_id = $1 AND member.status = 'active' WHERE member.user_id IS NOT NULL OR (project.user_id = $1 AND group_row.id IS NULL) ORDER BY project.id ASC",
            [cleanUserId],
        );
        return Array.from(new Set(result.rows.map((row) => row.project_id).filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim())));
    }
    const state = await readState();
    const groups = new Map(state.groups.map((group) => [group.id, group.projectId]));
    const accessible = state.members
        .filter((member) => member.userId === cleanUserId && member.status === "active")
        .map((member) => groups.get(member.groupId))
        .filter((id): id is string => Boolean(id));
    // Projects created before Phase 3 may not have a collaboration row yet.
    // Keep those projects visible to their storage owner without making a
    // former owner who has been removed from an existing group eligible.
    const ownedLegacy = (await readJsonDataFile<{ version: 1; projects: Array<{ userId?: string; project?: { id?: string } }> }>(PROJECT_FILE_NAME, { version: 1, projects: [] })).projects
        .filter((record) => record.userId === cleanUserId && record.project?.id && !state.groups.some((group) => group.projectId === record.project!.id))
        .map((record) => record.project!.id as string);
    return Array.from(new Set([...accessible, ...ownedLegacy]));
}

/** Resolve a project for an approved member without coupling storage to the
 * logical group owner. Ownership transfer changes management permissions; the
 * platform project/media owner remains stable so existing task and Canvas
 * records stay addressable. */
export async function getDramaLabProjectForUser(userId: string, projectId: string) {
    const group = await requireGroup(projectId);
    await requireActiveMember(group.id, userId);
    const project = await getDramaProject(projectId, group.ownerUserId);
    if (project) return { project, ownerUserId: group.ownerUserId };
    const resolved = await getDramaProjectWithOwner(projectId);
    if (!resolved) throw new DramaLabCollaborationError("短剧项目不存在", 404);
    return resolved;
}

/**
 * Resolve a project for a Drama Lab request while preserving its storage
 * owner. Approved members therefore use the collaboration group's logical
 * membership while writes continue to target the stable storage owner.
 * The direct lookup remains the fast path for owners and legacy projects.
 */
export async function resolveDramaLabProjectForRequest(userId: string, projectId: string) {
    const group = await getDramaLabProjectGroup(projectId);
    const directProject = await getDramaProject(projectId, userId);
    // A project that already has a collaboration group must always pass the
    // group membership check. Otherwise a former storage owner could keep
    // accessing a project after being removed from the group.
    if (directProject && !group) return { project: directProject, ownerUserId: userId };
    if (directProject && group && await getMembershipByGroup(group.id, userId)) return { project: directProject, ownerUserId: userId };
    return getDramaLabProjectForUser(userId, projectId);
}

/** List owner and approved-member projects without exposing projects outside the collaboration graph. */
export async function listDramaLabProjectsForUser(userId: string, input: { page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(input.pageSize) || 20)));
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ project_json: import("@/lib/drama-project-contract").DramaProject; execution_profile?: string; practice_source_work_id?: string; practice_source_version_id?: string; member_role: DramaLabProjectRole; total_count?: number }>("SELECT project.project_json, project.execution_profile, project.practice_source_work_id, project.practice_source_version_id, member.role AS member_role, COUNT(*) OVER() AS total_count FROM drama_projects project JOIN drama_lab_project_groups group_row ON group_row.project_id = project.id JOIN drama_lab_project_members member ON member.group_id = group_row.id AND member.user_id = $1 AND member.status = 'active' WHERE project.execution_profile = 'production' ORDER BY project.updated_at DESC LIMIT $2 OFFSET $3", [userId, pageSize, (page - 1) * pageSize]);
        return { items: result.rows.map((row) => ({ ...summarizeDramaProject({ ...row.project_json, executionProfile: row.execution_profile === "open-source-practice" ? "open-source-practice" : "production", practiceSource: row.practice_source_work_id && row.practice_source_version_id ? { type: "published-work", workId: row.practice_source_work_id, versionId: row.practice_source_version_id } : { type: "blank" } }), role: row.member_role })), total: Number(result.rows[0]?.total_count) || 0, page, pageSize };
    }
    const state = await readState();
    const groups = new Map(state.groups.map((group) => [group.id, group]));
    const memberships = state.members
        .filter((member) => member.userId === userId && member.status === "active")
        .map((member) => ({ group: groups.get(member.groupId), role: member.role }))
        .filter((item): item is { group: DramaLabProjectGroup; role: DramaLabProjectRole } => Boolean(item.group));
    const records = await Promise.all(memberships.map(async ({ group, role }) => {
        const direct = await getDramaProject(group.projectId, group.ownerUserId);
        const resolved = direct ? { project: direct } : await getDramaProjectWithOwner(group.projectId);
        return resolved ? { project: resolved.project, role } : null;
    }));
    const items = records
        .filter((record): record is NonNullable<typeof record> => Boolean(record))
        .sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt))
        .map(({ project, role }) => ({ ...summarizeDramaProject(project), role }));
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
}

/** Update the owner-backed aggregate while preserving the caller's member authorization. */
export async function updateDramaLabProjectForUser(userId: string, projectId: string, value: unknown) {
    const resolved = await getDramaLabProjectForUser(userId, projectId);
    const { updateDramaProjectForUser } = await import("@/lib/server/drama-project-service");
    return updateDramaProjectForUser(resolved.ownerUserId, projectId, value);
}

/**
 * Delete a Short Drama Lab project through the collaboration boundary.
 *
 * `group.ownerUserId` is the logical manager and may differ from the
 * storage owner after an ownership transfer. Resolve the latter from the
 * project record before calling the existing aggregate deletion service so
 * media, Canvas records, conversations, and task references are removed from
 * the correct account. Only the logical project owner can perform this
 * destructive operation; admins retain member/approval management only.
 */
export async function deleteDramaLabProjectForUser(userId: string, projectId: string) {
    const group = await requireGroup(projectId);
    if (group.ownerUserId !== userId) throw new DramaLabCollaborationError("Only the project manager can delete this project", 403);
    const stored = await getDramaProjectWithOwner(projectId);
    if (!stored) throw new DramaLabCollaborationError("Drama project not found", 404);
    const { deleteDramaProjectForUser } = await import("@/lib/server/drama-project-service");
    await deleteDramaProjectForUser(stored.ownerUserId, projectId);

    // PostgreSQL cascades collaboration rows from drama_projects. The JSON
    // provider has no foreign keys, so remove the group graph explicitly to
    // prevent stale invites or approvals from surviving a deleted project.
    if (getDatabaseProvider() !== "postgres") {
        await mutateFile((state) => {
            state.groups = state.groups.filter((item) => item.id !== group.id && item.projectId !== projectId);
            state.members = state.members.filter((item) => item.groupId !== group.id);
            state.invites = state.invites.filter((item) => item.groupId !== group.id);
            state.joinRequests = state.joinRequests.filter((item) => item.groupId !== group.id);
            state.approvalConfigs = state.approvalConfigs.filter((item) => item.groupId !== group.id);
            state.approvals = state.approvals.filter((item) => item.groupId !== group.id);
        });
    }
    return { deleted: true };
}

export async function getDramaLabCollaborationForUser(userId: string, projectId: string): Promise<DramaLabCollaborationOverview> {
    const group = await ensureDramaLabProjectGroupForUser(userId, projectId);
    const membership = await getMembershipByGroup(group.id, userId);
    if (!membership) throw new DramaLabCollaborationError("你尚未加入该短剧项目", 403);
    const [members, invites, joinRequests, approvalConfigs] = await Promise.all([listMembersByGroup(group.id), listInvitesByGroup(group.id), listJoinRequestsByGroup(group.id), listConfigsByGroup(group.id)]);
    // Profiles are resolved strictly from IDs already present in this project
    // group. No platform-wide account search is performed or exposed.
    const { getPublicUsersByIds } = await import("@/lib/auth/store-actions");
    const profileIds = [...new Set([...members.map((item) => item.userId), ...joinRequests.map((item) => item.applicantUserId)])];
    const profiles = await getPublicUsersByIds(profileIds);
    const profileById = new Map(profiles.map((profile) => [profile.id, { id: profile.id, displayName: profile.displayName, username: profile.username, avatarUrl: profile.avatarUrl }]));
    const enrichedMembers = members.map((member) => ({ ...member, profile: profileById.get(member.userId) }));
    const enrichedRequests = joinRequests.map((request) => ({ ...request, applicant: profileById.get(request.applicantUserId) }));
    return { group, viewerUserId: userId, members: enrichedMembers, invites: membership.role === "member" ? [] : invites, joinRequests: membership.role === "member" ? [] : enrichedRequests, approvalConfigs };
}

export async function listDramaLabMembers(userId: string, projectId: string, keyword = "") {
    const group = await requireGroup(projectId);
    await requireActiveMember(group.id, userId);
    const needle = keyword.trim().toLowerCase();
    const members = await listMembersByGroup(group.id);
    const { getPublicUsersByIds } = await import("@/lib/auth/store-actions");
    const users = await getPublicUsersByIds(members.map((member) => member.userId));
    const byId = new Map(users.map((user) => [user.id, { id: user.id, displayName: user.displayName, username: user.username, avatarUrl: user.avatarUrl }]));
    const enriched = members.map((member) => ({ ...member, profile: byId.get(member.userId) }));
    return needle ? enriched.filter((member) => [member.userId, member.profile?.displayName, member.profile?.username].some((value) => value?.toLowerCase().includes(needle))) : enriched;
}

export async function createDramaLabInvite(userId: string, projectId: string, input: { expiresAt?: string } = {}) {
    const group = await requireGroup(projectId);
    await requireManager(group.id, userId);
    const expiresAt = normalizeExpiry(input.expiresAt);
    const token = randomBytes(32).toString("base64url");
    const now = new Date().toISOString();
    const invite: DramaLabInvite = { id: `drama-invite-${randomUUID()}`, projectId, expiresAt, createdBy: userId, createdAt: now, token };
    const tokenHash = hashInviteToken(token);
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        await postgresQuery("INSERT INTO drama_lab_project_invites (id, group_id, project_id, token_hash, expires_at, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [invite.id, group.id, projectId, tokenHash, new Date(expiresAt), userId, new Date(now)]);
    } else {
        await withJsonDataFileLock(FILE_NAME, async () => {
            const state = await readState();
            state.invites.unshift({ ...invite, groupId: group.id, tokenHash });
            await writeState(state);
        });
    }
    return invite;
}

/** Rotate an invitation atomically from the caller's perspective: revoke all active links then issue one new token. */
export async function rotateDramaLabInvite(userId: string, projectId: string, input: { expiresAt?: string } = {}) {
    const group = await requireGroup(projectId);
    await requireManager(group.id, userId);
    const now = new Date().toISOString();
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        await postgresQuery("UPDATE drama_lab_project_invites SET revoked_at=$2, updated_at=$2 WHERE group_id=$1 AND revoked_at IS NULL", [group.id, new Date(now)]);
    } else {
        await mutateFile((state) => { for (const invite of state.invites) if (invite.groupId === group.id && !invite.revokedAt) invite.revokedAt = now; });
    }
    return createDramaLabInvite(userId, projectId, input);
}

export async function revokeDramaLabInvite(userId: string, projectId: string, inviteId: string) {
    const group = await requireGroup(projectId);
    await requireManager(group.id, userId);
    const now = new Date().toISOString();
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery("UPDATE drama_lab_project_invites SET revoked_at = $3, updated_at = $3 WHERE id = $1 AND group_id = $2 AND revoked_at IS NULL RETURNING id", [inviteId, group.id, new Date(now)]);
        if (!result.rows[0]) throw new DramaLabCollaborationError("邀请不存在或已失效", 404);
    } else {
        await mutateFile((state) => {
            const invite = state.invites.find((item) => item.id === inviteId && item.groupId === group.id && !item.revokedAt);
            if (!invite) throw new DramaLabCollaborationError("邀请不存在或已失效", 404);
            invite.revokedAt = now;
        });
    }
    return { revoked: true };
}

export async function listDramaLabInvites(userId: string, projectId: string) {
    const group = await requireGroup(projectId);
    await requireManager(group.id, userId);
    return listInvitesByGroup(group.id);
}

/** Validate an invite without exposing project/member data, then create a pending request. */
export async function requestDramaLabJoin(userId: string, token: string) {
    const cleanToken = token.trim();
    if (!cleanToken || cleanToken.length > 256) throw new DramaLabCollaborationError("邀请凭证无效", 400);
    const tokenHash = hashInviteToken(cleanToken);
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        return withPostgresTransaction(async (client) => {
            const inviteResult = await client.query<DbInvite>("SELECT * FROM drama_lab_project_invites WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()", [tokenHash]);
            const invite = inviteResult.rows[0];
            if (!invite) throw new DramaLabCollaborationError("邀请凭证无效或已过期", 404);
            const existingMember = await client.query("SELECT 1 FROM drama_lab_project_members WHERE group_id = $1 AND user_id = $2 AND status = 'active'", [invite.group_id, userId]);
            if (existingMember.rows[0]) return { requestId: undefined, projectId: invite.project_id, status: "approved" as const };
            const pending = await client.query<DbJoinRequest>("SELECT * FROM drama_lab_join_requests WHERE group_id = $1 AND applicant_user_id = $2 AND status = 'pending' FOR UPDATE", [invite.group_id, userId]);
            if (pending.rows[0]) return { requestId: pending.rows[0].id, projectId: invite.project_id, status: "pending" as const };
            const now = new Date().toISOString();
            const id = `drama-join-${randomUUID()}`;
            await client.query("INSERT INTO drama_lab_join_requests (id, group_id, project_id, invite_id, applicant_user_id, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,'pending',$6,$6)", [id, invite.group_id, invite.project_id, invite.id, userId, new Date(now)]);
            return { requestId: id, projectId: invite.project_id, status: "pending" as const };
        });
    }
    return withJsonDataFileLock(FILE_NAME, async () => {
        const state = await readState();
        const invite = state.invites.find((item) => item.tokenHash === tokenHash && !item.revokedAt && Date.parse(item.expiresAt) > Date.now());
        if (!invite) throw new DramaLabCollaborationError("邀请凭证无效或已过期", 404);
        const existing = state.members.find((item) => item.groupId === invite.groupId && item.userId === userId && item.status === "active");
        if (existing) return { requestId: undefined, projectId: invite.projectId, status: "approved" as const };
        const pending = state.joinRequests.find((item) => item.groupId === invite.groupId && item.applicantUserId === userId && item.status === "pending");
        if (pending) return { requestId: pending.id, projectId: invite.projectId, status: "pending" as const };
        const now = new Date().toISOString();
        const request: DramaLabJoinRequest & { groupId: string } = { id: `drama-join-${randomUUID()}`, groupId: invite.groupId, projectId: invite.projectId, inviteId: invite.id, applicantUserId: userId, status: "pending", createdAt: now, updatedAt: now };
        state.joinRequests.unshift(request);
        await writeState(state);
        return { requestId: request.id, projectId: invite.projectId, status: "pending" as const };
    });
}

/** Return only a safe project invitation preview; never expose project contents. */
export async function getDramaLabInviteByToken(token: string) {
    const cleanToken = token.trim();
    if (!cleanToken || cleanToken.length > 256) throw new DramaLabCollaborationError("邀请凭证无效", 400);
    const tokenHash = hashInviteToken(cleanToken);
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<DbInvite & { title?: string }>("SELECT invite.*, project.title FROM drama_lab_project_invites invite JOIN drama_projects project ON project.id = invite.project_id WHERE invite.token_hash = $1 AND invite.revoked_at IS NULL AND invite.expires_at > now()", [tokenHash]);
        const row = result.rows[0];
        if (!row) throw new DramaLabCollaborationError("邀请凭证无效或已过期", 404);
        return { projectId: row.project_id, projectTitle: row.title || "", expiresAt: iso(row.expires_at)! };
    }
    const row = (await readState()).invites.find((item) => item.tokenHash === tokenHash && !item.revokedAt && Date.parse(item.expiresAt) > Date.now());
    if (!row) throw new DramaLabCollaborationError("邀请凭证无效或已过期", 404);
    return { projectId: row.projectId, projectTitle: "", expiresAt: row.expiresAt };
}

export async function listDramaLabJoinRequests(userId: string, projectId: string, keyword = "") {
    const group = await requireGroup(projectId);
    await requireManager(group.id, userId);
    const requests = await listJoinRequestsByGroup(group.id);
    const { getPublicUsersByIds } = await import("@/lib/auth/store-actions");
    const users = await getPublicUsersByIds(requests.map((item) => item.applicantUserId));
    const byId = new Map(users.map((user) => [user.id, { id: user.id, displayName: user.displayName, username: user.username, avatarUrl: user.avatarUrl }]));
    const enriched = requests.map((item) => ({ ...item, applicant: byId.get(item.applicantUserId) }));
    const needle = keyword.trim().toLowerCase();
    return needle ? enriched.filter((item) => [item.applicantUserId, item.applicant?.displayName, item.applicant?.username].some((value) => value?.toLowerCase().includes(needle))) : enriched;
}

export async function listDramaLabMyJoinRequests(userId: string, projectId: string) {
    const group = await requireGroup(projectId);
    const requests = await listJoinRequestsByGroup(group.id);
    return requests.filter((item) => item.applicantUserId === userId);
}

export async function reviewDramaLabJoinRequest(userId: string, projectId: string, requestId: string, decision: "approve" | "reject", note = "") {
    const group = await requireGroup(projectId);
    await requireManager(group.id, userId);
    const now = new Date().toISOString();
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        return withPostgresTransaction(async (client) => {
            const requestResult = await client.query<DbJoinRequest>("SELECT * FROM drama_lab_join_requests WHERE id = $1 AND group_id = $2 FOR UPDATE", [requestId, group.id]);
            const request = requestResult.rows[0];
            if (!request) throw new DramaLabCollaborationError("加入申请不存在", 404);
            if (request.status !== "pending") throw new DramaLabCollaborationError("加入申请已处理", 409);
            const status = decision === "approve" ? "approved" : "rejected";
            const updated = await client.query<DbJoinRequest>("UPDATE drama_lab_join_requests SET status = $3, reviewed_by = $4, reviewed_at = $5, note = $6, updated_at = $5 WHERE id = $1 AND status = 'pending' RETURNING *", [requestId, group.id, status, userId, new Date(now), note.slice(0, 2000)]);
            if (!updated.rows[0]) throw new DramaLabCollaborationError("加入申请已被其他管理员处理", 409);
            if (decision === "approve") await client.query("INSERT INTO drama_lab_project_members (group_id,user_id,role,status,permissions,joined_at,updated_at) VALUES ($1,$2,'member','active',$3::jsonb,$4,$4) ON CONFLICT (group_id,user_id) DO UPDATE SET status='active', updated_at=EXCLUDED.updated_at", [group.id, request.applicant_user_id, JSON.stringify({ manageMembers: false, approve: false }), new Date(now)]);
            return mapJoinRequest(updated.rows[0]);
        });
    }
    return withJsonDataFileLock(FILE_NAME, async () => {
        const state = await readState();
        const request = state.joinRequests.find((item) => item.id === requestId && item.groupId === group.id);
        if (!request) throw new DramaLabCollaborationError("加入申请不存在", 404);
        if (request.status !== "pending") throw new DramaLabCollaborationError("加入申请已处理", 409);
        request.status = decision === "approve" ? "approved" : "rejected";
        request.reviewedBy = userId;
        request.reviewedAt = now;
        request.note = note.slice(0, 2000);
        request.updatedAt = now;
        if (decision === "approve") {
            const existing = state.members.find((item) => item.groupId === group.id && item.userId === request.applicantUserId);
            if (existing) Object.assign(existing, { status: "active", updatedAt: now });
            else state.members.unshift({ groupId: group.id, userId: request.applicantUserId, role: "member", status: "active", permissions: { manageMembers: false, approve: false }, joinedAt: now, updatedAt: now });
        }
        await writeState(state);
        return stripGroupId(request);
    });
}

export async function removeDramaLabMember(userId: string, projectId: string, targetUserId: string) {
    const group = await requireGroup(projectId);
    await requireManager(group.id, userId);
    if (targetUserId === group.ownerUserId) throw new DramaLabCollaborationError("项目管理员不能被移除", 409);
    await setMemberStatus(group.id, targetUserId, "removed");
    return { removed: true };
}

export async function leaveDramaLabProject(userId: string, projectId: string) {
    const group = await requireGroup(projectId);
    if (group.ownerUserId === userId) throw new DramaLabCollaborationError("项目管理员退出前必须先转交管理权限", 409);
    const membership = await getMembershipByGroup(group.id, userId);
    if (!membership) throw new DramaLabCollaborationError("你不是该项目成员", 404);
    await setMemberStatus(group.id, userId, "left");
    return { left: true };
}

export async function setDramaLabMemberRole(userId: string, projectId: string, targetUserId: string, role: "admin" | "member") {
    const group = await requireGroup(projectId);
    if (group.ownerUserId !== userId) throw new DramaLabCollaborationError("只有项目管理员可以调整副管理员", 403);
    // Owner changes are restricted to the atomic transfer API. Allowing this
    // endpoint to rewrite the owner row would leave the group pointer and
    // member role inconsistent.
    if (targetUserId === group.ownerUserId) throw new DramaLabCollaborationError("项目管理员只能通过转接操作变更", 409);
    const target = await getMembershipByGroup(group.id, targetUserId);
    if (!target) throw new DramaLabCollaborationError("目标成员不存在", 404);
    const permissions = role === "admin" ? { manageMembers: true, approve: true } : { manageMembers: false, approve: false };
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        await postgresQuery("UPDATE drama_lab_project_members SET role = $3, permissions = $4::jsonb, updated_at = now() WHERE group_id = $1 AND user_id = $2 AND status = 'active'", [group.id, targetUserId, role, JSON.stringify(permissions)]);
    } else await mutateFile((state) => { const row = state.members.find((item) => item.groupId === group.id && item.userId === targetUserId && item.status === "active"); if (!row) throw new DramaLabCollaborationError("目标成员不存在", 404); Object.assign(row, { role, permissions, updatedAt: new Date().toISOString() }); });
    return { userId: targetUserId, role, permissions };
}

export async function transferDramaLabOwnership(userId: string, projectId: string, targetUserId: string) {
    const group = await requireGroup(projectId);
    if (group.ownerUserId !== userId) throw new DramaLabCollaborationError("只有项目管理员可以转交权限", 403);
    if (targetUserId === userId) return group;
    const now = new Date().toISOString();
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        return withPostgresTransaction(async (client) => {
            // Re-lock the group and target inside the transaction. The
            // preflight membership check is only an early UX response and is
            // not sufficient when two managers transfer concurrently.
            const lockedGroup = await client.query<DbGroup>("SELECT * FROM drama_lab_project_groups WHERE id=$1 FOR UPDATE", [group.id]);
            if (!lockedGroup.rows[0] || lockedGroup.rows[0].owner_user_id !== userId) throw new DramaLabCollaborationError("项目管理权限已变更", 409);
            const project = await client.query<{ id: string }>("SELECT id FROM drama_projects WHERE id=$1 FOR SHARE", [projectId]);
            if (!project.rows[0]) throw new DramaLabCollaborationError("短剧项目不存在", 404);
            const target = await client.query<DbMember>("SELECT * FROM drama_lab_project_members WHERE group_id=$1 AND user_id=$2 AND status='active' FOR UPDATE", [group.id, targetUserId]);
            if (!target.rows[0]) throw new DramaLabCollaborationError("目标成员不存在", 404);
            const actor = await client.query<DbMember>("SELECT * FROM drama_lab_project_members WHERE group_id=$1 AND user_id=$2 AND status='active' FOR UPDATE", [group.id, userId]);
            if (!actor.rows[0]) throw new DramaLabCollaborationError("项目管理员不在成员列表中", 409);
            await client.query("UPDATE drama_lab_project_members SET role='admin', permissions=$3::jsonb, updated_at=$4 WHERE group_id=$1 AND user_id=$2", [group.id, userId, JSON.stringify({ manageMembers: true, approve: true }), new Date(now)]);
            await client.query("UPDATE drama_lab_project_members SET role='owner', permissions=$3::jsonb, updated_at=$4 WHERE group_id=$1 AND user_id=$2", [group.id, targetUserId, JSON.stringify({ manageMembers: true, approve: true }), new Date(now)]);
            const result = await client.query<DbGroup>("UPDATE drama_lab_project_groups SET owner_user_id=$2,last_transfer_by=$3,last_transfer_at=$4,updated_at=$4 WHERE id=$1 RETURNING *", [group.id, targetUserId, userId, new Date(now)]);
            return mapGroup(result.rows[0]);
        });
    }
    return withJsonDataFileLock(FILE_NAME, async () => {
        const state = await readState();
        const stored = state.groups.find((item) => item.id === group.id);
        if (!stored) throw new DramaLabCollaborationError("项目组不存在", 404);
        if (stored.ownerUserId !== userId) throw new DramaLabCollaborationError("项目管理权限已变更", 409);
        const projects = await readJsonDataFile<{ version: 1; projects: Array<{ project: { id: string } }> }>(PROJECT_FILE_NAME, { version: 1, projects: [] });
        if (!projects.projects.some((item) => item.project.id === projectId)) throw new DramaLabCollaborationError("短剧项目不存在", 404);
        const target = state.members.find((item) => item.groupId === group.id && item.userId === targetUserId && item.status === "active");
        if (!target) throw new DramaLabCollaborationError("目标成员不存在", 404);
        const actor = state.members.find((item) => item.groupId === group.id && item.userId === userId && item.status === "active");
        if (!actor) throw new DramaLabCollaborationError("项目管理员不在成员列表中", 409);
        stored.ownerUserId = targetUserId; stored.lastTransferBy = userId; stored.lastTransferAt = now; stored.updatedAt = now;
        for (const row of state.members.filter((item) => item.groupId === group.id && item.status === "active")) {
            if (row.userId === userId) row.role = "admin";
            if (row.userId === targetUserId) row.role = "owner";
            if (row.role !== "member") row.permissions = { manageMembers: true, approve: true };
            row.updatedAt = now;
        }
        await writeState(state);
        return stored;
    });
}

export async function listDramaLabApprovalConfigs(userId: string, projectId: string) {
    const group = await requireGroup(projectId);
    await requireActiveMember(group.id, userId);
    return listConfigsByGroup(group.id);
}

export async function saveDramaLabApprovalConfigs(userId: string, projectId: string, values: unknown) {
    const group = await requireGroup(projectId);
    await requireApprover(group.id, userId);
    const configs = normalizeConfigs(values, userId);
    const activeMembers = new Set((await listMembersByGroup(group.id)).map((member) => member.userId));
    for (const config of configs) {
        if (config.reviewerUserIds.some((id) => !activeMembers.has(id))) throw new DramaLabCollaborationError("审批人必须是当前项目成员", 400);
    }
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        return withPostgresTransaction(async (client) => {
            for (const config of configs) await client.query("INSERT INTO drama_lab_approval_configs (id,group_id,project_id,stage,enabled,reviewer_scope,reviewer_user_ids,strict_mode,updated_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$10) ON CONFLICT (group_id,stage) DO UPDATE SET enabled=EXCLUDED.enabled,reviewer_scope=EXCLUDED.reviewer_scope,reviewer_user_ids=EXCLUDED.reviewer_user_ids,strict_mode=EXCLUDED.strict_mode,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at", [`drama-approval-config-${randomUUID()}`, group.id, projectId, config.stage, config.enabled, config.reviewerScope, JSON.stringify(config.reviewerUserIds), config.strictMode, userId, new Date(config.updatedAt)]);
            return configs;
        });
    }
    await mutateFile((state) => {
        for (const config of configs) {
            const existing = state.approvalConfigs.find((item) => item.groupId === group.id && item.stage === config.stage);
            if (existing) Object.assign(existing, { ...config, groupId: group.id });
            else state.approvalConfigs.push({ ...config, groupId: group.id });
        }
    });
    return configs;
}

export async function submitDramaLabApproval(userId: string, projectId: string, input: { episodeId?: string; stage: string; resourceType: string; resourceId: string; versionId?: string; versionNumber?: number; snapshot?: unknown }) {
    const group = await requireGroup(projectId);
    await requireActiveMember(group.id, userId);
    const stage = normalizeStage(input.stage);
    const config = (await listConfigsByGroup(group.id)).find((item) => item.stage === stage);
    if (!config?.enabled) throw new DramaLabCollaborationError("当前阶段未启用审批", 409);
    const resourceId = text(input.resourceId, 200);
    const resourceType = text(input.resourceType, 80);
    if (!resourceId || !resourceType) throw new DramaLabCollaborationError("审批资源定位不能为空", 400);
    await validateApprovalLocation(group, input.episodeId, resourceType, resourceId);
    if (config.strictMode) await assertStrictPredecessorsApproved(group.id, stage, input.episodeId, resourceType, resourceId);
    if (input.snapshot !== undefined && Buffer.byteLength(JSON.stringify(input.snapshot)) > MAX_SNAPSHOT_BYTES) throw new DramaLabCollaborationError("审批快照过大", 413);
    const now = new Date().toISOString();
    const base = { id: `drama-approval-${randomUUID()}`, projectId, episodeId: optionalText(input.episodeId), stage, resourceType, resourceId, versionId: optionalText(input.versionId), versionNumber: Number.isFinite(input.versionNumber) ? Number(input.versionNumber) : undefined, submittedBy: userId, submittedAt: now, snapshot: input.snapshot, status: "pending" as const, createdAt: now, updatedAt: now, location: { projectId, episodeId: optionalText(input.episodeId), stage, resourceType, resourceId } };
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<DbApproval>("INSERT INTO drama_lab_approvals (id,group_id,project_id,episode_id,stage,resource_type,resource_id,version_id,version_number,submitted_by,submitted_at,snapshot,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,'pending',$11,$11) RETURNING *", [base.id, group.id, projectId, base.episodeId || null, stage, resourceType, resourceId, base.versionId || null, base.versionNumber ?? null, userId, new Date(now), JSON.stringify(base.snapshot ?? {})]);
        return mapApproval(result.rows[0]);
    }
    await mutateFile((state) => state.approvals.unshift({ ...base, groupId: group.id }));
    return base;
}

export async function listDramaLabApprovals(userId: string, projectId: string, input: { status?: DramaLabApprovalStatus; page?: number; pageSize?: number } = {}) {
    const group = await requireGroup(projectId);
    const membership = await requireActiveMember(group.id, userId);
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(input.pageSize) || 20)));
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const values: unknown[] = [group.id, input.status || null, membership.role === "member" ? userId : null, pageSize, (page - 1) * pageSize];
        const result = await postgresQuery<DbApproval>("SELECT *, COUNT(*) OVER() AS total_count FROM drama_lab_approvals WHERE group_id=$1 AND ($2::text IS NULL OR status=$2) AND ($3::text IS NULL OR submitted_by=$3) ORDER BY created_at DESC LIMIT $4 OFFSET $5", values);
        return { items: result.rows.map(mapApproval), total: Number(result.rows[0]?.total_count) || 0, page, pageSize };
    }
    let items = (await readState()).approvals.filter((item) => item.groupId === group.id && (!input.status || item.status === input.status) && (membership.role !== "member" || item.submittedBy === userId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(stripGroupIdApproval);
    const total = items.length; items = items.slice((page - 1) * pageSize, page * pageSize);
    return { items, total, page, pageSize };
}

export async function reviewDramaLabApproval(userId: string, projectId: string, approvalId: string, decision: "approve" | "reject", comment = "") {
    const group = await requireGroup(projectId);
    await requireApprover(group.id, userId, approvalId);
    const now = new Date().toISOString();
    const status = decision === "approve" ? "approved" : "rejected";
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<DbApproval>("UPDATE drama_lab_approvals SET status=$3, reviewer_id=$4, review_comment=$5, reviewed_at=$6, updated_at=$6 WHERE id=$1 AND group_id=$2 AND status='pending' RETURNING *", [approvalId, group.id, status, userId, comment.slice(0, 4000), new Date(now)]);
        if (!result.rows[0]) throw new DramaLabCollaborationError("审批不存在或已处理", 409);
        return mapApproval(result.rows[0]);
    }
    return withJsonDataFileLock(FILE_NAME, async () => {
        const state = await readState();
        const approval = state.approvals.find((item) => item.id === approvalId && item.groupId === group.id);
        if (!approval) throw new DramaLabCollaborationError("审批不存在", 404);
        if (approval.status !== "pending") throw new DramaLabCollaborationError("审批已处理", 409);
        approval.status = status; approval.reviewerId = userId; approval.reviewComment = comment.slice(0, 4000); approval.reviewedAt = now; approval.updatedAt = now;
        await writeState(state);
        return stripGroupIdApproval(approval);
    });
}

export async function getDramaLabApproval(userId: string, projectId: string, approvalId: string) {
    const group = await requireGroup(projectId);
    const membership = await requireActiveMember(group.id, userId);
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<DbApproval>("SELECT * FROM drama_lab_approvals WHERE id=$1 AND group_id=$2 AND ($3::text IS NULL OR submitted_by=$3)", [approvalId, group.id, membership.role === "member" ? userId : null]);
        return result.rows[0] ? mapApproval(result.rows[0]) : null;
    }
    const row = (await readState()).approvals.find((item) => item.id === approvalId && item.groupId === group.id && (membership.role !== "member" || item.submittedBy === userId));
    return row ? stripGroupIdApproval(row) : null;
}

export async function assertDramaLabStageAllowed(userId: string, projectId: string, stageValue: string, target?: { episodeId?: string; resourceType?: string; resourceId?: string }) {
    const group = await getDramaLabProjectGroup(projectId);
    if (!group) return;
    const membership = await requireActiveMember(group.id, userId);
    const stage = normalizeStage(stageValue);
    const config = (await listConfigsByGroup(group.id)).find((item) => item.stage === stage);
    if (config?.strictMode && config.enabled) await assertStrictPredecessorsApproved(group.id, stage, target?.episodeId, target?.resourceType, target?.resourceId);
    return membership;
}

async function assertStrictPredecessorsApproved(groupId: string, stage: DramaLabApprovalStage, episodeIdValue?: string, resourceTypeValue?: string, resourceIdValue?: string) {
    const configs = await listConfigsByGroup(groupId);
    const index = DRAMA_LAB_APPROVAL_STAGES.indexOf(stage);
    const required = configs.filter((config) => config.enabled && config.strictMode && DRAMA_LAB_APPROVAL_STAGES.indexOf(config.stage) < index);
    if (!required.length) return;
    const episodeId = optionalText(episodeIdValue);
    const resourceType = text(resourceTypeValue, 80).toLowerCase();
    const resourceId = text(resourceIdValue, 200);
    const targetMatches = (candidate: DramaLabApprovalRecord) => {
        // Episode/shot deliveries must never satisfy a strict predecessor
        // belonging to another episode (or another shot within the episode).
        if (episodeId && candidate.episodeId && candidate.episodeId !== episodeId) return false;
        const candidateType = candidate.resourceType.toLowerCase();
        const shotTarget = resourceType === "shot" || resourceType === "storyboard" || resourceType === "storyboard_image" || resourceType === "storyboard_video";
        const candidateShot = candidateType === "shot" || candidateType === "storyboard" || candidateType === "storyboard_image" || candidateType === "storyboard_video";
        if (shotTarget && candidateShot && resourceId && candidate.resourceId !== resourceId) return false;
        return true;
    };
    const approvals = (await listApprovalsRaw(groupId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // A prior approval is not enough once a newer submission exists for the
    // same target. Select the newest matching record first, then require that
    // record itself to be approved; otherwise a rejected/pending revision
    // could accidentally be bypassed by an older approved history entry.
    const latestMatching = (requiredStage: DramaLabApprovalStage) => approvals.find((candidate) => candidate.stage === requiredStage && targetMatches(candidate));
    const missing = required.find((config) => {
        const latest = latestMatching(config.stage);
        return !latest || latest.status !== "approved";
    });
    if (missing) throw new DramaLabCollaborationError(`前置阶段「${missing.stage}」尚未通过`, 409);
}

async function validateApprovalLocation(group: DramaLabProjectGroup, episodeId: unknown, resourceType: string, resourceId: string) {
    const resolved = await getDramaProject(group.projectId, group.ownerUserId) || (await getDramaProjectWithOwner(group.projectId))?.project;
    if (!resolved) throw new DramaLabCollaborationError("短剧项目不存在", 404);
    const project = resolved;
    const episode = optionalText(episodeId);
    if (episode && !project.episodes.some((item) => item.id === episode)) throw new DramaLabCollaborationError("审批集数不存在", 400);
    const normalizedType = resourceType.toLowerCase();
    if (["episode", "script"].includes(normalizedType)) {
        // A script/episode delivery is inherently episode-scoped. Requiring
        // the explicit episode ID prevents an approval from being displayed
        // or applied to whichever episode happens to be active in the UI.
        if (!episode || !project.episodes.some((item) => item.id === episode && (normalizedType === "episode" || item.id === resourceId))) throw new DramaLabCollaborationError("审批资源与集数不匹配", 400);
        return;
    }
    if (["character", "characters"].includes(normalizedType)) { if (!project.characters.some((item) => item.id === resourceId)) throw new DramaLabCollaborationError("审批角色不存在", 400); return; }
    if (["scene", "scenes"].includes(normalizedType)) { if (!project.scenes.some((item) => item.id === resourceId)) throw new DramaLabCollaborationError("审批场景不存在", 400); return; }
    if (["prop", "props"].includes(normalizedType)) { if (!project.props.some((item) => item.id === resourceId)) throw new DramaLabCollaborationError("审批道具不存在", 400); return; }
    if (["shot", "storyboard", "storyboard_image", "storyboard_video"].includes(normalizedType)) {
        const foundEpisode = project.episodes.find((item) => item.shots.some((shot) => shot.id === resourceId));
        if (!foundEpisode) throw new DramaLabCollaborationError("审批分镜不存在", 400);
        if (!episode || foundEpisode.id !== episode) throw new DramaLabCollaborationError("审批分镜与集数不匹配", 400);
        return;
    }
    if (["project", "export", "final_export"].includes(normalizedType)) {
        if (resourceId !== project.id) throw new DramaLabCollaborationError("审批项目定位无效", 400);
        return;
    }
    if (["asset", "assets"].includes(normalizedType)) {
        const found = [...(project.sourceAssets || []), ...project.characters.flatMap((item) => item.references || []), ...project.scenes.flatMap((item) => item.references || []), ...project.props.flatMap((item) => item.references || [])].some((item) => item.id === resourceId);
        if (!found) throw new DramaLabCollaborationError("审批素材不存在", 400);
        return;
    }
    throw new DramaLabCollaborationError("审批资源类型无效", 400);
}

async function requireGroup(projectId: string) {
    const group = await getDramaLabProjectGroup(projectId);
    if (!group) throw new DramaLabCollaborationError("短剧项目协作组不存在", 404);
    return group;
}

async function requireActiveMember(groupId: string, userId: string) {
    const membership = await getMembershipByGroup(groupId, userId);
    if (!membership) throw new DramaLabCollaborationError("你不是该项目成员", 403);
    return membership;
}

async function requireManager(groupId: string, userId: string) {
    const member = await requireActiveMember(groupId, userId);
    if (member.role !== "owner" && member.role !== "admin" || !member.permissions.manageMembers) throw new DramaLabCollaborationError("没有项目管理权限", 403);
    return member;
}

async function requireApprover(groupId: string, userId: string, approvalId?: string) {
    const member = await requireActiveMember(groupId, userId);
    if (member.role === "member" || !member.permissions.approve) throw new DramaLabCollaborationError("没有审批权限", 403);
    if (approvalId) {
        const approval = await getApprovalRaw(groupId, approvalId);
        if (!approval) throw new DramaLabCollaborationError("审批不存在", 404);
        const config = (await listConfigsByGroup(groupId)).find((item) => item.stage === approval.stage);
        if (config?.reviewerScope === "owner" && member.role !== "owner") throw new DramaLabCollaborationError("当前阶段仅项目管理员可审批", 403);
        if (config?.reviewerUserIds.length && !config.reviewerUserIds.includes(userId) && member.role !== "owner") throw new DramaLabCollaborationError("不在当前阶段审批人范围内", 403);
    }
    return member;
}

async function setMemberStatus(groupId: string, userId: string, status: DramaLabMemberStatus) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery("UPDATE drama_lab_project_members SET status=$3, updated_at=now() WHERE group_id=$1 AND user_id=$2 AND status='active' RETURNING user_id", [groupId, userId, status]);
        if (!result.rows[0]) throw new DramaLabCollaborationError("项目成员不存在", 404);
        return;
    }
    await mutateFile((state) => { const member = state.members.find((item) => item.groupId === groupId && item.userId === userId && item.status === "active"); if (!member) throw new DramaLabCollaborationError("项目成员不存在", 404); member.status = status; member.updatedAt = new Date().toISOString(); });
}

async function getMembershipByGroup(groupId: string, userId: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<DbMember>("SELECT * FROM drama_lab_project_members WHERE group_id=$1 AND user_id=$2 AND status='active'", [groupId, userId]);
        return result.rows[0] ? mapMember(result.rows[0]) : null;
    }
    const row = (await readState()).members.find((item) => item.groupId === groupId && item.userId === userId && item.status === "active");
    return row ? stripGroupId(row) : null;
}

async function listMembersByGroup(groupId: string) {
    if (getDatabaseProvider() === "postgres") { await ensurePostgresSchema(); const result = await postgresQuery<DbMember>("SELECT * FROM drama_lab_project_members WHERE group_id=$1 AND status='active' ORDER BY joined_at", [groupId]); return result.rows.map(mapMember); }
    return (await readState()).members.filter((item) => item.groupId === groupId && item.status === "active").map(stripGroupId);
}

async function listInvitesByGroup(groupId: string) {
    if (getDatabaseProvider() === "postgres") { await ensurePostgresSchema(); const result = await postgresQuery<DbInvite>("SELECT * FROM drama_lab_project_invites WHERE group_id=$1 ORDER BY created_at DESC", [groupId]); return result.rows.map(mapInvite); }
    return (await readState()).invites.filter((item) => item.groupId === groupId).map(stripInviteToken);
}

async function listJoinRequestsByGroup(groupId: string, _keyword?: string) {
    if (getDatabaseProvider() === "postgres") { await ensurePostgresSchema(); const result = await postgresQuery<DbJoinRequest>("SELECT * FROM drama_lab_join_requests WHERE group_id=$1 ORDER BY created_at DESC", [groupId]); return result.rows.map(mapJoinRequest); }
    return (await readState()).joinRequests.filter((item) => item.groupId === groupId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(stripGroupId);
}

async function listConfigsByGroup(groupId: string) {
    if (getDatabaseProvider() === "postgres") { await ensurePostgresSchema(); const result = await postgresQuery<DbConfig>("SELECT * FROM drama_lab_approval_configs WHERE group_id=$1 ORDER BY created_at", [groupId]); return result.rows.map(mapConfig); }
    return (await readState()).approvalConfigs.filter((item) => item.groupId === groupId).map(stripGroupIdConfig);
}

async function listApprovalsRaw(groupId: string) {
    if (getDatabaseProvider() === "postgres") { await ensurePostgresSchema(); const result = await postgresQuery<DbApproval>("SELECT * FROM drama_lab_approvals WHERE group_id=$1", [groupId]); return result.rows.map(mapApproval); }
    return (await readState()).approvals.filter((item) => item.groupId === groupId).map(stripGroupIdApproval);
}

async function getApprovalRaw(groupId: string, approvalId: string) {
    if (getDatabaseProvider() === "postgres") { await ensurePostgresSchema(); const result = await postgresQuery<DbApproval>("SELECT * FROM drama_lab_approvals WHERE group_id=$1 AND id=$2", [groupId, approvalId]); return result.rows[0] ? mapApproval(result.rows[0]) : null; }
    const row = (await readState()).approvals.find((item) => item.groupId === groupId && item.id === approvalId); return row ? stripGroupIdApproval(row) : null;
}

function normalizeConfigs(value: unknown, updatedBy: string): Array<DramaLabApprovalConfig & { updatedAt: string }> {
    const now = new Date().toISOString();
    const values: unknown[] = Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).configs) ? ((value as Record<string, unknown>).configs as unknown[]) : [];
    return DRAMA_LAB_APPROVAL_STAGES.map((stage) => {
        const input = values.find((item) => item && typeof item === "object" && normalizeStage((item as Record<string, unknown>).stage) === stage) as Record<string, unknown> | undefined;
        const reviewerUserIds = Array.isArray(input?.reviewerUserIds) ? input!.reviewerUserIds.filter((id): id is string => typeof id === "string").slice(0, 100) : [];
        return { stage, enabled: input?.enabled === true, reviewerScope: input?.reviewerScope === "owner" ? "owner" : "admins", reviewerUserIds, strictMode: input?.strictMode !== false, updatedAt: now, updatedBy };
    });
}

function normalizeStage(value: unknown): DramaLabApprovalStage {
    const raw = typeof value === "string" ? value.trim() : "";
    const stage = STAGE_ALIASES[raw] || raw;
    if ((DRAMA_LAB_APPROVAL_STAGES as readonly string[]).includes(stage)) return stage as DramaLabApprovalStage;
    throw new DramaLabCollaborationError("审批阶段无效", 400);
}

function normalizeExpiry(value?: string) {
    const parsed = value ? Date.parse(value) : NaN;
    const timestamp = Number.isFinite(parsed) ? parsed : Date.now() + 7 * 24 * 60 * 60 * 1000;
    if (timestamp <= Date.now() || timestamp > Date.now() + 90 * 24 * 60 * 60 * 1000) throw new DramaLabCollaborationError("邀请有效期无效", 400);
    return new Date(timestamp).toISOString();
}

function hashInviteToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function optionalText(value: unknown) { const result = text(value, 200); return result || undefined; }

async function readState() { return readJsonDataFile<StoredState>(FILE_NAME, { version: 1, groups: [], members: [], invites: [], joinRequests: [], approvalConfigs: [], approvals: [] }); }
async function writeState(state: StoredState) { return writeJsonDataFile(FILE_NAME, state); }
async function mutateFile(mutator: (state: StoredState) => void) { return withJsonDataFileLock(FILE_NAME, async () => { const state = await readState(); mutator(state); await writeState(state); }); }

function stripGroupId<T extends { groupId: string }>(value: T) { const { groupId: _groupId, ...result } = value; return result; }
function stripGroupIdConfig(value: DramaLabApprovalConfig & { groupId: string }) { return stripGroupId(value); }
function stripGroupIdApproval(value: DramaLabApprovalRecord & { groupId: string }) { return stripGroupId(value); }
function stripInviteToken(value: DramaLabInvite & { groupId: string; tokenHash: string }) { const { groupId: _groupId, tokenHash: _tokenHash, token: _token, ...result } = value; return result; }

type DbGroup = { id: string; project_id: string; owner_user_id: string; created_at: Date | string; updated_at: Date | string; last_transfer_by?: string; last_transfer_at?: Date | string };
type DbMember = { group_id: string; user_id: string; role: DramaLabProjectRole; status: DramaLabMemberStatus; permissions: Record<string, boolean>; joined_at: Date | string; updated_at: Date | string };
type DbInvite = { id: string; group_id: string; project_id: string; token_hash: string; expires_at: Date | string; revoked_at?: Date | string; created_by: string; created_at: Date | string };
type DbJoinRequest = { id: string; group_id: string; project_id: string; invite_id?: string; applicant_user_id: string; status: DramaLabJoinRequestStatus; reviewed_by?: string; reviewed_at?: Date | string; note?: string; created_at: Date | string; updated_at: Date | string };
type DbConfig = { stage: DramaLabApprovalStage; enabled: boolean; reviewer_scope: DramaLabReviewerScope; reviewer_user_ids: string[] | Record<string, unknown>; strict_mode: boolean; updated_at: Date | string; updated_by: string };
type DbApproval = { id: string; project_id: string; group_id: string; episode_id?: string; stage: DramaLabApprovalStage; resource_type: string; resource_id: string; version_id?: string; version_number?: number; submitted_by: string; submitted_at: Date | string; snapshot: unknown; status: DramaLabApprovalStatus; reviewer_id?: string; review_comment?: string; reviewed_at?: Date | string; created_at: Date | string; updated_at: Date | string; total_count?: number };
function iso(value: Date | string | undefined) { return value instanceof Date ? value.toISOString() : value || undefined; }
function mapGroup(row: DbGroup): DramaLabProjectGroup { return { id: row.id, projectId: row.project_id, ownerUserId: row.owner_user_id, createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)!, ...(row.last_transfer_by ? { lastTransferBy: row.last_transfer_by } : {}), ...(iso(row.last_transfer_at) ? { lastTransferAt: iso(row.last_transfer_at) } : {}) }; }
function mapMember(row: DbMember): DramaLabProjectMember { return { userId: row.user_id, role: row.role, status: row.status, permissions: { manageMembers: Boolean(row.permissions?.manageMembers), approve: Boolean(row.permissions?.approve) }, joinedAt: iso(row.joined_at)!, updatedAt: iso(row.updated_at)! }; }
function mapInvite(row: DbInvite): DramaLabInvite { return { id: row.id, projectId: row.project_id, expiresAt: iso(row.expires_at)!, ...(iso(row.revoked_at) ? { revokedAt: iso(row.revoked_at) } : {}), createdBy: row.created_by, createdAt: iso(row.created_at)! }; }
function mapJoinRequest(row: DbJoinRequest): DramaLabJoinRequest { return { id: row.id, projectId: row.project_id, applicantUserId: row.applicant_user_id, ...(row.invite_id ? { inviteId: row.invite_id } : {}), status: row.status, ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}), ...(iso(row.reviewed_at) ? { reviewedAt: iso(row.reviewed_at) } : {}), ...(row.note ? { note: row.note } : {}), createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! }; }
function mapConfig(row: DbConfig): DramaLabApprovalConfig { const ids = Array.isArray(row.reviewer_user_ids) ? row.reviewer_user_ids : []; return { stage: row.stage, enabled: row.enabled, reviewerScope: row.reviewer_scope, reviewerUserIds: ids.filter((id): id is string => typeof id === "string"), strictMode: row.strict_mode, updatedAt: iso(row.updated_at)!, updatedBy: row.updated_by }; }
function mapApproval(row: DbApproval): DramaLabApprovalRecord { const episodeId = row.episode_id || undefined; return { id: row.id, projectId: row.project_id, ...(episodeId ? { episodeId } : {}), stage: row.stage, resourceType: row.resource_type, resourceId: row.resource_id, ...(row.version_id ? { versionId: row.version_id } : {}), ...(row.version_number === undefined || row.version_number === null ? {} : { versionNumber: Number(row.version_number) }), submittedBy: row.submitted_by, submittedAt: iso(row.submitted_at)!, snapshot: row.snapshot, status: row.status, ...(row.reviewer_id ? { reviewerId: row.reviewer_id } : {}), ...(row.review_comment ? { reviewComment: row.review_comment } : {}), ...(iso(row.reviewed_at) ? { reviewedAt: iso(row.reviewed_at) } : {}), createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)!, location: { projectId: row.project_id, ...(episodeId ? { episodeId } : {}), stage: row.stage, resourceType: row.resource_type, resourceId: row.resource_id } }; }
