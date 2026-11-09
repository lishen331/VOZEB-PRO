import { describe, expect, it } from "vitest";

import { VISIBLE_SCHOOL_ADMIN_TABS } from "./school-admin-tabs";

describe("school management navigation", () => {
    it("only exposes profile, members, classes and courses", () => {
        expect(VISIBLE_SCHOOL_ADMIN_TABS).toEqual(["profile", "members", "classes", "courses"]);
    });
});
