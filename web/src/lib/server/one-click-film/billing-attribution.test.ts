import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { featureModuleForGenerationContext } from "@/lib/server/feature-module-access";

/**
 * 一键成片的计费归属守卫。
 *
 * 背景：商单（一键成片）与教学版（创作工坊）共用底层生成链路，靠上游 context 的
 * `featureModule` 区分用量归属。若这个字段在服务端被丢掉或被判成 drama-lab，
 * 商单的钱就记到教学版账上 —— 这是审查里代价最高的一类错误，所以单独锁死。
 */
describe("one-click-film billing attribution", () => {
    it("resolves one-click-film context to its own module, not drama-lab", () => {
        // 这是核心断言：不能回落成 drama-lab，也不能回落成通用 drama。
        expect(featureModuleForGenerationContext({ surface: "drama", featureModule: "one-click-film", projectId: "one-click-film:p1" })).toBe("one-click-film");
    });

    it("still resolves drama-lab context to drama-lab", () => {
        // 教学版不能被这次改动带偏。
        expect(featureModuleForGenerationContext({ surface: "drama", featureModule: "drama-lab" })).toBe("drama-lab");
        expect(featureModuleForGenerationContext({ surface: "drama", projectId: "drama-lab:p1" })).toBe("drama-lab");
    });

    it("does not let a one-click-film project id be mistaken for drama-lab", () => {
        // projectId 前缀推断分支必须认得 one-click-film，否则同样记错账。
        expect(featureModuleForGenerationContext({ surface: "drama", projectId: "one-click-film:p1" })).toBe("one-click-film");
    });

    it("keeps featureModule in the persisted context type", async () => {
        const types = await readFile(resolve(process.cwd(), "src/lib/server/generation-task-types.ts"), "utf8");
        // 类型只允许 drama-lab 时，one-click-film 会被静默丢弃。
        expect(types).toContain('"one-click-film"');
    });

    it("does not narrow featureModule to drama-lab when persisting or rehydrating", async () => {
        const store = await readFile(resolve(process.cwd(), "src/lib/server/generation-task-store.ts"), "utf8");
        // 早期写法是 `context.featureModule === "drama-lab" ? "drama-lab" : undefined`，
        // 它会把 one-click-film 直接抹成 undefined，归属随之回落。
        expect(store).not.toContain('context.featureModule === "drama-lab" ? "drama-lab" : undefined');
        expect(store).not.toContain('nested.featureModule === "drama-lab" || payload.featureModule === "drama-lab" ? "drama-lab" : undefined');
    });

    it("sends one-click-film on the media routes that spend money", async () => {
        for (const kind of ["generate-image", "generate-video"]) {
            const source = await readFile(resolve(process.cwd(), `src/app/api/one-click-film/projects/[id]/shots/[shotId]/${kind}/route.ts`), "utf8");
            expect(source).toContain('featureModule: "one-click-film"');
            expect(source).not.toContain('featureModule: "drama-lab"');
        }
    });
});
