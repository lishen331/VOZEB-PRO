import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    hasAnyAdminPermission: vi.fn(),
    getDatabaseProvider: vi.fn(),
    ensurePostgresSchema: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/admin-permissions", () => ({ hasAnyAdminPermission: mocks.hasAnyAdminPermission }));
vi.mock("@/lib/server/database", () => ({ getDatabaseProvider: mocks.getDatabaseProvider, ensurePostgresSchema: mocks.ensurePostgresSchema }));
vi.mock("@/lib/server/data-dir", () => ({ getServerDataDir: vi.fn(() => "/tmp/vozeb-pro") }));

import { POST as postAiConfig } from "./ai-configs/route";
import { DELETE as deleteAiConfig, PUT as putAiConfig } from "./ai-configs/[id]/route";
import { POST as postBusinessScenario } from "./business-scenarios/route";
import { DELETE as deleteBusinessScenario, PUT as putBusinessScenario } from "./business-scenarios/[id]/route";
import { POST as postSd2Asset } from "./sd2-assets/route";
import { DELETE as deleteSd2Asset, PUT as putSd2Asset } from "./sd2-assets/[id]/route";
import { POST as uploadSd2Asset } from "./sd2-assets/upload/route";
import { POST as postPromptTemplate } from "./prompt-templates/route";
import { NextRequest } from "next/server";

describe("Drama Lab legacy configuration mutations", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.hasAnyAdminPermission.mockReturnValue(true);
        mocks.getDatabaseProvider.mockReturnValue("postgres");
        mocks.ensurePostgresSchema.mockResolvedValue(undefined);
    });

    it("rejects writes to compatibility tables instead of returning a false success", async () => {
        const handlers: Array<() => Promise<Response | undefined>> = [
            postAiConfig,
            putAiConfig,
            deleteAiConfig,
            postBusinessScenario,
            putBusinessScenario,
            deleteBusinessScenario,
            postSd2Asset,
            putSd2Asset,
            deleteSd2Asset,
            uploadSd2Asset,
            () => postPromptTemplate(new NextRequest("http://localhost/api/admin/drama-lab/prompt-templates", { method: "POST" })),
        ];

        for (const handler of handlers) {
            const response = requireResponse(await handler());
            expect(response.status).toBe(410);
            expect(await response.json()).toMatchObject({ code: 410, data: null });
        }
    });
});

function requireResponse(response: Response | undefined): Response {
    if (!response) throw new Error("legacy mutation handler did not return a response");
    return response;
}
