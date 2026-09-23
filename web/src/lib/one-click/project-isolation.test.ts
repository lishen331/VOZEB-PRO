import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 商单版与教学版的隔离守卫。
 *
 * 规范 §9.1/§9.2：一键成片与创作工坊同级独立，不得互相影响。
 * 实际发生过的问题：创建一键成片项目时调 ensureDramaLabProjectGroup，
 * 把每个商单项目写进创作工坊协作组表，导致教学版的成员校验与阶段审批
 * 真实拦住商单生产链路。这里锁死该耦合不再回来。
 */
const apiRoot = resolve(process.cwd(), "src/app/api/one-click-film");

async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walk(full)));
        else if (entry.name.endsWith(".ts")) out.push(full);
    }
    return out;
}

/** 教学版专属的协作/闸门符号，商单路由不得调用。 */
const FORBIDDEN = ["ensureDramaLabProjectGroup", "assertDramaLabStageAllowed", "requireFeatureModuleEnabled"];

describe("one-click-film stays isolated from the teaching workshop", () => {
    it("never calls drama-lab collaboration or stage-gate helpers", async () => {
        const files = (await walk(apiRoot)).filter((file) => !file.endsWith(".test.ts"));
        expect(files.length).toBeGreaterThan(0);

        const offenders: string[] = [];
        for (const file of files) {
            const text = await readFile(file, "utf8");
            // 只看真实代码行，注释里的历史说明不算违规。
            const code = text
                .split(/\r?\n/)
                .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
                .join("\n");
            for (const symbol of FORBIDDEN) {
                if (code.includes(symbol)) offenders.push(`${file.slice(apiRoot.length).replace(/\\/g, "/")} → ${symbol}`);
            }
        }

        expect(offenders, `一键成片路由不得依赖教学版协作/闸门：\n${offenders.join("\n")}`).toEqual([]);
    });

    it("scopes every project read to the one-click-film prefix", async () => {
        const files = (await walk(apiRoot)).filter((file) => !file.endsWith(".test.ts"));
        const missing: string[] = [];
        for (const file of files) {
            const text = await readFile(file, "utf8");
            // 读取了项目却不校验前缀，就可能操作到创作工坊/普通短剧的项目。
            if (text.includes("getDramaProjectForUser") && !text.includes('startsWith("one-click-film:')) {
                missing.push(file.slice(apiRoot.length).replace(/\\/g, "/"));
            }
        }
        expect(missing, `以下路由读取项目但未校验 one-click-film 归属：\n${missing.join("\n")}`).toEqual([]);
    });
});
