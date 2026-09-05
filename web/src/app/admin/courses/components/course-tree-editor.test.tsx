import { describe, expect, it } from "vitest";

import { nodeClass } from "./course-tree-editor";

describe("course tree selection styles", () => {
    it("keeps the selected node readable in light and dark themes", () => {
        const selected = nodeClass(true);

        expect(selected).toContain("bg-zinc-50");
        expect(selected).toContain("text-zinc-950");
        expect(selected).toContain("border-zinc-300");
        expect(selected).toContain("dark:bg-zinc-800");
        expect(selected).toContain("dark:text-zinc-100");
        expect(selected).not.toContain("bg-zinc-950 text-white");
    });
});
