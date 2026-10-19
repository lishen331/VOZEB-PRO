import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isFullscreenWorkspacePath } from "./app-workspace-path";

describe("workspace sidebar", () => {
    it("uses the shared BlueGamma sidebar instead of the old header bar", async () => {
        const [shell, sidebar] = await Promise.all([readFile(resolve(process.cwd(), "src/components/layout/app-workspace-shell.tsx"), "utf8"), readFile(resolve(process.cwd(), "src/components/layout/gamma-app-sidebar.tsx"), "utf8")]);

        expect(shell).toContain("<GammaAppSidebar");
        expect(shell).toContain("useGammaSidebarState()");
        expect(shell).not.toContain("UserStatusActions");
        expect(shell).not.toContain("pageTitle");
        expect(sidebar).toContain("workspaceNavItems(");
        expect(sidebar).toContain("isHelpCenterVisible(");
        expect(sidebar).not.toContain("window.location.host");
    });

    it("opens Canvas and drama project details as full-screen workspaces only", () => {
        expect(isFullscreenWorkspacePath("/canvas/canvas-one")).toBe(true);
        expect(isFullscreenWorkspacePath("/canvas/canvas-one/history")).toBe(true);
        expect(isFullscreenWorkspacePath("/drama/drama-one")).toBe(true);
        expect(isFullscreenWorkspacePath("/drama/drama-one/episode")).toBe(true);
        expect(isFullscreenWorkspacePath("/drama-lab/drama-one")).toBe(true);
        expect(isFullscreenWorkspacePath("/canvas")).toBe(false);
        expect(isFullscreenWorkspacePath("/drama")).toBe(false);
    });
});
