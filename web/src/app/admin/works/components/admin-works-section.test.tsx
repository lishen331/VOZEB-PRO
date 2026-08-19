import { App } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { AdminWorksSection } from "./admin-works-section";

describe("admin works table layout", () => {
    it("uses compact filters, a desktop table and no removed comment governance entry", () => {
        const markup = renderToStaticMarkup(
            <App>
                <AdminWorksSection />
            </App>,
        );

        expect(markup).toContain('data-testid="admin-work-filters"');
        expect(markup).toContain("grid-cols-2");
        expect(markup).toContain("md:grid-cols-[minmax(180px,1fr)");
        expect(markup.match(/>全部</g)).toHaveLength(2);
        expect(markup).toContain("admin-work-table");
        expect(markup).toContain("作品审核");
        expect(markup).toContain("举报申诉");
        expect(markup).not.toContain("评论治理");
    });

    it("exposes version-bound pull-film status and controls without coupling them to featured state", () => {
        const source = readFileSync(new URL("./admin-works-section.tsx", import.meta.url), "utf8");

        expect(source).toContain("setAdminWorkPullFilm");
        expect(source).toContain("拉片项目");
        expect(source).toContain("设为拉片");
        expect(source).toContain("取消拉片");
        expect(source).toContain("publishedVersion?.pullFilmEnabled");
        expect(source).toContain("work.isFeatured");
    });
});
