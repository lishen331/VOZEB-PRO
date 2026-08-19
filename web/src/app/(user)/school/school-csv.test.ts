import { describe, expect, it } from "vitest";

import { parseSchoolMemberCsv } from "./school-csv";

describe("school member CSV", () => {
    it("parses the fixed columns without doing semantic role validation", () => {
        expect(parseSchoolMemberCsv("username,displayName,password,role\nteacher_a,甲老师,password123,teacher")).toEqual({
            ok: true,
            rows: [{ username: "teacher_a", displayName: "甲老师", password: "password123", role: "teacher" }],
        });
    });

    it("rejects extra columns and row-level parser errors", () => {
        expect(parseSchoolMemberCsv("username,displayName,password,role\nstudent_a,甲学生,password123,student,extra")).toMatchObject({ ok: false });
        expect(parseSchoolMemberCsv('username,displayName,password,role\nstudent_a,"未闭合,password123,student')).toMatchObject({ ok: false });
    });
});
