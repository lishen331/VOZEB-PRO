import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresRepositories } from "./repositories";
import { initializePostgresSchema, postgresQuery } from "./postgres";
import type { IpUsageCreateInput } from "./repository-types";

const postgresIt = process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1" ? it : it.skip;
const suffix = randomUUID();
const ids = {
    admin: `ip-admin-${suffix}`,
    user: `ip-user-${suffix}`,
    schoolAUser: `ip-school-a-user-${suffix}`,
    schoolBUser: `ip-school-b-user-${suffix}`,
    schoolA: `ip-school-a-${suffix}`,
    schoolB: `ip-school-b-${suffix}`,
    membershipA: `ip-membership-a-${suffix}`,
    membershipB: `ip-membership-b-${suffix}`,
};
const packageIds: string[] = [];

function packageInput(name: string, visibility: "public" | "school", authorizationMode: "multi_school" | "exclusive" = "multi_school") {
    const id = `ip-${name}-${suffix}`;
    packageIds.push(id);
    return {
        id,
        title: `${name} IP`,
        slug: `${name}-${suffix}`,
        summary: `${name} summary`,
        visibility,
        authorizationMode,
        status: "draft" as const,
        createdByUserId: ids.admin,
    };
}

function versionInput(ipId: string, name: string) {
    return {
        id: `${ipId}-version-${name}`,
        title: `${name} version`,
        summary: `${name} summary`,
        createdByUserId: ids.admin,
        items: [
            { id: `${ipId}-text-${name}`, kind: "text" as const, category: "story_summary" as const, title: "故事简介", summary: "", textContent: "故事正文", sortOrder: 0 },
            { id: `${ipId}-image-${name}`, kind: "image" as const, category: "character" as const, title: "角色图", summary: "", assetId: `asset-${name}`, sortOrder: 1 },
        ],
    };
}

describe("IpLibraryRepository PostgreSQL", () => {
    beforeAll(async () => {
        if (process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION !== "1") return;
        if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL must point to a dedicated PostgreSQL test database");
        await initializePostgresSchema();
        await postgresQuery(
            `INSERT INTO users (id, username, display_name, password_hash, role, status)
             VALUES ($1, $2, $2, 'test', 'admin', 'active'), ($3, $4, $4, 'test', 'user', 'active'), ($5, $6, $6, 'test', 'user', 'active'), ($7, $8, $8, 'test', 'user', 'active')`,
            [ids.admin, `ip-admin-${suffix}`, ids.user, `ip-user-${suffix}`, ids.schoolAUser, `ip-school-a-user-${suffix}`, ids.schoolBUser, `ip-school-b-user-${suffix}`],
        );
        await postgresQuery("INSERT INTO schools (id, name, status) VALUES ($1, 'IP 学校 A', 'active'), ($2, 'IP 学校 B', 'active')", [ids.schoolA, ids.schoolB]);
        await postgresQuery(
            `INSERT INTO school_memberships (id, school_id, user_id, role, permissions, status, join_source)
             VALUES ($1, $2, $3, 'teacher', '[]'::jsonb, 'active', 'admin'), ($4, $5, $6, 'student', '[]'::jsonb, 'active', 'admin')`,
            [ids.membershipA, ids.schoolA, ids.schoolAUser, ids.membershipB, ids.schoolB, ids.schoolBUser],
        );
    });

    afterAll(async () => {
        if (process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION !== "1") return;
        await postgresQuery("DELETE FROM ip_usage_records WHERE ip_id = ANY($1::text[])", [packageIds]);
        await postgresQuery("DELETE FROM ip_school_grants WHERE ip_id = ANY($1::text[])", [packageIds]);
        await postgresQuery("ALTER TABLE ip_versions DISABLE TRIGGER ip_versions_immutable");
        await postgresQuery("ALTER TABLE ip_items DISABLE TRIGGER ip_items_immutable");
        try {
            await postgresQuery("DELETE FROM ip_packages WHERE id = ANY($1::text[])", [packageIds]);
        } finally {
            await postgresQuery("ALTER TABLE ip_items ENABLE TRIGGER ip_items_immutable");
            await postgresQuery("ALTER TABLE ip_versions ENABLE TRIGGER ip_versions_immutable");
        }
        await postgresQuery("DELETE FROM school_memberships WHERE id = ANY($1::text[])", [[ids.membershipA, ids.membershipB]]);
        await postgresQuery("DELETE FROM schools WHERE id = ANY($1::text[])", [[ids.schoolA, ids.schoolB]]);
        await postgresQuery("DELETE FROM users WHERE id = ANY($1::text[])", [[ids.admin, ids.user, ids.schoolAUser, ids.schoolBUser]]);
    });

    postgresIt("round-trips a published IP with immutable version items", async () => {
        const repository = createPostgresRepositories().ipLibrary;
        const created = await repository.createIpPackage(packageInput("public", "public"));
        const draft = await repository.createIpDraftVersion(created.id, versionInput(created.id, "v1"));

        expect(draft.versionNumber).toBe(1);
        expect(draft.items).toHaveLength(2);

        const published = await repository.publishIpVersion(created.id, draft.id);
        const detail = await repository.getVisibleIp({ userId: ids.user, ipId: created.id });

        expect(published).toMatchObject({ id: draft.id, status: "published" });
        expect(detail).toMatchObject({ id: created.id, currentVersionId: draft.id, version: { id: draft.id, items: [{ kind: "text" }, { kind: "image" }] } });
        await expect(postgresQuery("UPDATE ip_versions SET title = '覆盖发布版本' WHERE id = $1", [draft.id])).rejects.toBeTruthy();
        await expect(postgresQuery("UPDATE ip_items SET title = '覆盖内容项' WHERE version_id = $1", [draft.id])).rejects.toBeTruthy();
    });

    postgresIt("lists public IPs when optional school and content filters are empty", async () => {
        const repository = createPostgresRepositories().ipLibrary;
        const created = await repository.createIpPackage(packageInput("public-list", "public"));
        const draft = await repository.createIpDraftVersion(created.id, versionInput(created.id, "v1"));
        await repository.publishIpVersion(created.id, draft.id);

        await expect(repository.listVisibleIps({ userId: ids.user, scope: "public", page: 1, pageSize: 20 })).resolves.toMatchObject({
            items: expect.arrayContaining([expect.objectContaining({ id: created.id, versionNumber: 1, itemCount: 2 })]),
        });
    });

    postgresIt("requires an active same-school grant for school IP reads", async () => {
        const repository = createPostgresRepositories().ipLibrary;
        const created = await repository.createIpPackage(packageInput("school", "school"));
        const version = await repository.createIpDraftVersion(created.id, versionInput(created.id, "v1"));
        await repository.publishIpVersion(created.id, version.id);
        await repository.createSchoolGrant({
            id: `${created.id}-grant-a`,
            ipId: created.id,
            schoolId: ids.schoolA,
            mode: "multi_school",
            status: "active",
            startsAt: "2026-08-01T00:00:00.000Z",
            endsAt: "2026-09-01T00:00:00.000Z",
            note: "学校 A 授权",
            createdByUserId: ids.admin,
        });

        await expect(repository.getIpPackage(created.id)).resolves.toMatchObject({ id: created.id, visibility: "school" });
        await expect(repository.getVisibleIp({ userId: ids.schoolAUser, schoolId: ids.schoolA, ipId: created.id, at: "2026-08-19T00:00:00.000Z" })).resolves.toMatchObject({ id: created.id });
        await expect(repository.getVisibleIp({ userId: ids.schoolBUser, schoolId: ids.schoolB, ipId: created.id, at: "2026-08-19T00:00:00.000Z" })).resolves.toBeNull();
        await expect(repository.getVisibleIp({ userId: ids.user, ipId: created.id, at: "2026-08-19T00:00:00.000Z" })).resolves.toBeNull();
        await repository.updateSchoolGrant(created.id, `${created.id}-grant-a`, { status: "revoked", updatedAt: "2026-08-19T01:00:00.000Z" });
        await expect(repository.getVisibleIp({ userId: ids.schoolAUser, schoolId: ids.schoolA, ipId: created.id, at: "2026-08-19T02:00:00.000Z" })).resolves.toBeNull();
    });

    postgresIt("allows multi-school grants and rejects conflicting exclusive grants", async () => {
        const repository = createPostgresRepositories().ipLibrary;
        const multi = await repository.createIpPackage(packageInput("multi", "school"));
        const multiVersion = await repository.createIpDraftVersion(multi.id, versionInput(multi.id, "v1"));
        await repository.publishIpVersion(multi.id, multiVersion.id);
        await repository.createSchoolGrant({
            id: `${multi.id}-grant-a`,
            ipId: multi.id,
            schoolId: ids.schoolA,
            mode: "multi_school",
            status: "active",
            startsAt: "2026-08-01T00:00:00.000Z",
            endsAt: "2026-09-01T00:00:00.000Z",
            note: "",
            createdByUserId: ids.admin,
        });
        await expect(
            repository.createSchoolGrant({
                id: `${multi.id}-grant-b`,
                ipId: multi.id,
                schoolId: ids.schoolB,
                mode: "multi_school",
                status: "active",
                startsAt: "2026-08-01T00:00:00.000Z",
                endsAt: "2026-09-01T00:00:00.000Z",
                note: "",
                createdByUserId: ids.admin,
            }),
        ).resolves.toMatchObject({ schoolId: ids.schoolB });

        const exclusive = await repository.createIpPackage(packageInput("exclusive", "school", "exclusive"));
        const exclusiveVersion = await repository.createIpDraftVersion(exclusive.id, versionInput(exclusive.id, "v1"));
        await repository.publishIpVersion(exclusive.id, exclusiveVersion.id);
        await repository.createSchoolGrant({
            id: `${exclusive.id}-grant-a`,
            ipId: exclusive.id,
            schoolId: ids.schoolA,
            mode: "exclusive",
            status: "active",
            startsAt: "2026-08-01T00:00:00.000Z",
            endsAt: "2026-09-01T00:00:00.000Z",
            note: "",
            createdByUserId: ids.admin,
        });
        await expect(
            repository.createSchoolGrant({
                id: `${exclusive.id}-grant-b`,
                ipId: exclusive.id,
                schoolId: ids.schoolB,
                mode: "exclusive",
                status: "active",
                startsAt: "2026-08-15T00:00:00.000Z",
                endsAt: "2026-09-15T00:00:00.000Z",
                note: "",
                createdByUserId: ids.admin,
            }),
        ).rejects.toBeTruthy();
    });

    postgresIt("records and pages usage by user and school without broad reads", async () => {
        const repository = createPostgresRepositories().ipLibrary;
        const created = await repository.createIpPackage(packageInput("usage", "public"));
        const version = await repository.createIpDraftVersion(created.id, versionInput(created.id, "v1"));
        await repository.publishIpVersion(created.id, version.id);
        const referenceUsage: IpUsageCreateInput = {
            id: `${created.id}-usage-1`,
            ipId: created.id,
            versionId: version.id,
            itemIds: [version.items[0]!.id],
            userId: ids.schoolAUser,
            schoolId: ids.schoolA,
            action: "reference",
            targetType: "canvas",
            targetId: "canvas-a",
        };
        await repository.recordIpUsage(referenceUsage);
        await expect(repository.recordIpUsage(referenceUsage)).resolves.toMatchObject({ id: referenceUsage.id });
        await repository.recordIpUsage({ id: `${created.id}-usage-2`, ipId: created.id, versionId: version.id, itemIds: [], userId: ids.schoolAUser, schoolId: ids.schoolA, action: "download_package", targetType: "download", targetId: created.id });

        await expect(
            repository.recordIpUsages([
                { id: `${created.id}-usage-3`, ipId: created.id, versionId: version.id, itemIds: [], userId: ids.schoolAUser, schoolId: ids.schoolA, action: "reference", targetType: "canvas", targetId: "canvas-b" },
                { id: `${created.id}-usage-invalid`, ipId: created.id, versionId: `${created.id}-missing`, itemIds: [], userId: ids.schoolAUser, schoolId: ids.schoolA, action: "reference", targetType: "canvas", targetId: "canvas-b" },
            ]),
        ).rejects.toBeTruthy();

        const page = await repository.listIpUsage({ userId: ids.schoolAUser, schoolId: ids.schoolA, page: 1, pageSize: 1 });
        expect(page).toMatchObject({ total: 2, page: 1, pageSize: 1 });
        expect(page.items).toHaveLength(1);
        expect(page.items[0]).toMatchObject({ userId: ids.schoolAUser, schoolId: ids.schoolA, ipId: created.id });
    });

    postgresIt("pages management records and protects grant-bound authorization settings", async () => {
        const repository = createPostgresRepositories().ipLibrary;
        const created = await repository.createIpPackage({ ...packageInput("admin-page", "school"), coverAssetId: "cover-before" });
        const version = await repository.createIpDraftVersion(created.id, versionInput(created.id, "v1"));
        await repository.publishIpVersion(created.id, version.id);
        const grant = await repository.createSchoolGrant({
            id: `${created.id}-grant-a`,
            ipId: created.id,
            schoolId: ids.schoolA,
            mode: "multi_school",
            status: "active",
            startsAt: "2026-08-01T00:00:00.000Z",
            endsAt: "2026-09-01T00:00:00.000Z",
            note: "管理端授权",
            createdByUserId: ids.admin,
        });

        await expect(repository.listIpPackages({ keyword: "admin-page", page: 1, pageSize: 1 })).resolves.toMatchObject({ total: 1, items: [{ id: created.id, versionNumber: 1, itemCount: 2 }] });
        await expect(repository.listIpVersions(created.id, { page: 1, pageSize: 1 })).resolves.toMatchObject({ total: 1, items: [{ id: version.id, items: [{}, {}] }] });
        await expect(repository.listSchoolGrants({ ipId: created.id, page: 1, pageSize: 1 })).resolves.toMatchObject({ total: 1, items: [{ id: grant.id, schoolId: ids.schoolA }] });
        const updated = await repository.updateIpPackage(created.id, { title: "管理端新名称", coverAssetId: null });
        expect(updated).toMatchObject({ title: "管理端新名称" });
        expect(updated).toHaveProperty("coverAssetId", undefined);
        await expect(repository.updateIpPackage(created.id, { authorizationMode: "exclusive" })).resolves.toBeNull();
    });
});
