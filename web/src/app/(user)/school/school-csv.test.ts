import Papa from "papaparse";
import { describe, expect, it } from "vitest";

import { parseSchoolMemberCsv, parseSchoolMemberCsvBytes, SCHOOL_MEMBER_CSV_TEMPLATE } from "./school-csv";

describe("school member CSV", () => {
    it("puts the header first, then examples and field instructions with a removal reminder", () => {
        const { data, errors } = Papa.parse<string[]>(SCHOOL_MEMBER_CSV_TEMPLATE, { skipEmptyLines: true });
        expect(errors).toEqual([]);
        expect(SCHOOL_MEMBER_CSV_TEMPLATE.charCodeAt(0)).toBe(0xfeff);
        expect(data[0]).toEqual(["username", "displayName", "password", "role"]);
        expect(data.slice(1, 4).map((row) => row[3])).toEqual(["teacher", "student", "student"]);
        expect(data[4].join(" ")).toContain("上传前删除下方所有说明行");
        expect(data.slice(5).map((row) => row[1])).toEqual(data[0]);
        expect(data.every((row) => row.length === 4)).toBe(true);
        expect(parseSchoolMemberCsv(SCHOOL_MEMBER_CSV_TEMPLATE)).toMatchObject({ ok: false, message: expect.stringContaining("删除说明行") });
        expect(parseSchoolMemberCsv(Papa.unparse(data.slice(0, 4)))).toMatchObject({ ok: false, message: expect.stringContaining("示例行") });
    });

    it("parses the fixed columns without doing semantic role validation", () => {
        expect(parseSchoolMemberCsv("username,displayName,password,role\nteacher_a,甲老师,password123,teacher")).toEqual({
            ok: true,
            rows: [{ username: "teacher_a", displayName: "甲老师", password: "password123", role: "teacher" }],
        });
    });

    it.each(["", "\uFEFF"])("preserves UTF-8 Chinese names with optional BOM %j", (bom) => {
        const source = new TextEncoder().encode(bom + "username,displayName,password,role\r\nstudent_a,中文姓名,password123,student\r\n");
        expect(parseSchoolMemberCsvBytes(source.buffer)).toMatchObject({ ok: true, rows: [{ displayName: "中文姓名" }] });
    });

    it("reads Chinese names saved in GBK", () => {
        const source = Buffer.concat([Buffer.from("username,displayName,password,role\r\nstudent_a,"), Buffer.from("d6d0cec4d0d5c3fb", "hex"), Buffer.from(",password123,student\r\n")]);
        expect(parseSchoolMemberCsvBytes(Uint8Array.from(source).buffer)).toMatchObject({ ok: true, rows: [{ displayName: "中文姓名" }] });
    });

    it("blocks invalid UTF-8 with a BOM and text already saved with a replacement character", () => {
        const header = "\uFEFFusername,displayName,password,role\r\nstudent_a,";
        const tail = ",password123,student\r\n";
        const invalid = Buffer.concat([Buffer.from(header), Buffer.from("d6d0", "hex"), Buffer.from(tail)]);
        const replaced = new TextEncoder().encode(header + "姓名\uFFFD" + tail);
        for (const bytes of [Uint8Array.from(invalid).buffer, replaced.buffer]) {
            expect(parseSchoolMemberCsvBytes(bytes)).toMatchObject({ ok: false, message: expect.stringContaining("CSV UTF-8") });
        }
    });

    it("rejects extra columns and row-level parser errors", () => {
        expect(parseSchoolMemberCsv("username,displayName,password,role\nstudent_a,甲学生,password123,student,extra")).toMatchObject({ ok: false });
        expect(parseSchoolMemberCsv('username,displayName,password,role\nstudent_a,"未闭合,password123,student')).toMatchObject({ ok: false });
    });
});
