import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getAuthSettings: vi.fn(),
    getCurrentUser: vi.fn(),
    getInstallStatus: vi.fn(),
    serializeCurrentUser: vi.fn(),
    serializePublicSettings: vi.fn(),
    serializePublicIdentitySettings: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({
    DEFAULT_SITE_SETTINGS: { title: "VOZEB PRO", logoUrl: "/logo.svg" },
    getAuthSettings: mocks.getAuthSettings,
}));

vi.mock("@/lib/auth/session", () => ({
    getCurrentUser: mocks.getCurrentUser,
    serializeCurrentUser: mocks.serializeCurrentUser,
    serializePublicSettings: mocks.serializePublicSettings,
    serializePublicIdentitySettings: mocks.serializePublicIdentitySettings,
}));

vi.mock("@/lib/server/install-status", () => ({
    getInstallStatus: mocks.getInstallStatus,
}));

import { GET } from "./route";

describe("public session route before installation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getInstallStatus.mockResolvedValue({
            ready: false,
            firstAdminRequired: false,
            database: { configured: true, healthy: true, schemaReady: false },
        });
    });

    it("returns installation defaults without reading missing business tables", async () => {
        const response = await GET();

        await expect(response.json()).resolves.toMatchObject({
            user: null,
            settings: { site: { title: "VOZEB PRO" } },
            install: { database: { healthy: true, schemaReady: false } },
        });
        expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
        expect(mocks.getAuthSettings).not.toHaveBeenCalled();
    });

    it("skips installation status for an authenticated user", async () => {
        const user = { id: "user-one", role: "user" };
        mocks.getCurrentUser.mockResolvedValue(user);
        mocks.getAuthSettings.mockResolvedValue({ site: { title: "站点" } });
        mocks.serializeCurrentUser.mockReturnValue(user);
        // A1: 登录分支也只下发身份侧，目录侧走 GET /api/model-catalog。
        mocks.serializePublicIdentitySettings.mockReturnValue({ site: { title: "站点" }, featureModules: {} });

        const response = await GET();

        await expect(response.json()).resolves.toMatchObject({ user, settings: { site: { title: "站点" } }, install: { ready: true, database: { healthy: true } } });
        expect(mocks.getInstallStatus).not.toHaveBeenCalled();
        expect(mocks.getAuthSettings).toHaveBeenCalledTimes(1);
    });

    it("keeps the heavy catalog out of the authenticated session response", async () => {
        const user = { id: "user-one", role: "user" };
        mocks.getCurrentUser.mockResolvedValue(user);
        mocks.getAuthSettings.mockResolvedValue({ site: { title: "站点" } });
        mocks.serializeCurrentUser.mockReturnValue(user);
        mocks.serializePublicIdentitySettings.mockReturnValue({ site: { title: "站点" }, featureModules: {} });

        const body = await (await GET()).json();

        // A1 防回归：压测里 437KB 几乎全是这两棵树，且 points.ts 每次生成后都会重拉
        // 本接口。它们必须留在可缓存的 catalog 接口里。
        expect(body.settings).not.toHaveProperty("logicalModels");
        expect(body.settings).not.toHaveProperty("systemChannels");
        expect(mocks.serializePublicSettings).not.toHaveBeenCalled();
        expect(mocks.serializePublicIdentitySettings).toHaveBeenCalledTimes(1);
    });

    it("checks installation before loading settings for an anonymous installed session", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        mocks.getInstallStatus.mockResolvedValue({ ready: true, firstAdminRequired: false, database: { configured: true, healthy: true, schemaReady: true } });
        mocks.getAuthSettings.mockResolvedValue({ site: { title: "站点" } });
        // A1-b: 未登录分支必须走身份序列化器（只含 site/featureModules），不得下发
        // logicalModels/systemChannels 等重配置。
        mocks.serializePublicIdentitySettings.mockReturnValue({ site: { title: "站点" }, featureModules: {} });

        const response = await GET();

        const body = await response.json();
        expect(body).toMatchObject({ user: null, settings: { site: { title: "站点" } }, install: { ready: true } });
        expect(body.settings).not.toHaveProperty("logicalModels");
        expect(body.settings).not.toHaveProperty("systemChannels");
        expect(mocks.serializePublicIdentitySettings).toHaveBeenCalledTimes(1);
        expect(mocks.serializePublicSettings).not.toHaveBeenCalled();
        expect(mocks.getInstallStatus).toHaveBeenCalledTimes(1);
        expect(mocks.getAuthSettings).toHaveBeenCalledTimes(1);
    });
});
