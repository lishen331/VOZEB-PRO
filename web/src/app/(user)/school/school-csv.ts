import Papa from "papaparse";

import { CSV_ENCODING_ERROR, decodeCsvBytes } from "@/lib/csv-encoding";
import type { SchoolMemberCreateInput, SchoolMemberRole } from "@/lib/school-domain";

export const SCHOOL_MEMBER_IMPORT_COLUMNS = ["username", "displayName", "password", "role"] as const;

const EXAMPLE_ROWS = [
    ["teacher_demo", "张老师", "Example!T01", "teacher"],
    ["student_demo01", "李同学", "Example!S01", "student"],
    ["student_demo02", "王同学", "Example!S02", "student"],
];
const GUIDE_LABEL = "填写说明";

export const SCHOOL_MEMBER_CSV_TEMPLATE =
    "\uFEFF" +
    Papa.unparse([
        [...SCHOOL_MEMBER_IMPORT_COLUMNS],
        ...EXAMPLE_ROWS,
        [GUIDE_LABEL, "上传前删除下方所有说明行（包括本行），并替换或删除上面的示例行。请保留第一行字段名。", "", ""],
        [GUIDE_LABEL, "username", "用户名必填且不可重复。使用 3–32 位字母、数字、下划线、点或短横线。", ""],
        [GUIDE_LABEL, "displayName", "显示姓名选填，留空时使用用户名。建议不超过 40 个字符。", ""],
        [GUIDE_LABEL, "password", "初始密码必填，长度为 8–128 位。请按文本填写，以保留前导零。", ""],
        [GUIDE_LABEL, "role", "身份必填。teacher 表示老师，student 表示学生。", ""],
    ]) +
    "\r\n";

export type SchoolMemberCsvResult = { ok: true; rows: SchoolMemberCreateInput[] } | { ok: false; message: string };

export function parseSchoolMemberCsvBytes(buffer: ArrayBuffer): SchoolMemberCsvResult {
    const text = decodeCsvBytes(buffer);
    return text === null ? { ok: false, message: CSV_ENCODING_ERROR } : parseSchoolMemberCsv(text);
}

export function parseSchoolMemberCsv(source: string): SchoolMemberCsvResult {
    const result = Papa.parse<Record<string, string> & { __parsed_extra?: string[] }>(source, { header: true, skipEmptyLines: true });
    const fields = result.meta.fields || [];
    if (fields.length !== SCHOOL_MEMBER_IMPORT_COLUMNS.length || SCHOOL_MEMBER_IMPORT_COLUMNS.some((column, index) => fields[index] !== column)) {
        return { ok: false, message: "CSV 列必须依次为 username、displayName、password、role" };
    }
    if (result.errors.length || result.data.some((row) => row.__parsed_extra?.length)) return { ok: false, message: "CSV 存在格式错误或额外列" };
    if (result.data.some((row) => row.username?.trim() === GUIDE_LABEL)) return { ok: false, message: "请先删除说明行，保留表头和需要导入的成员信息" };
    if (result.data.some((row) => EXAMPLE_ROWS.some((example) => SCHOOL_MEMBER_IMPORT_COLUMNS.every((column, index) => row[column]?.trim() === example[index])))) {
        return { ok: false, message: "请替换或删除模板中的示例行后再上传" };
    }
    if (!result.data.length) return { ok: false, message: "CSV 中没有可导入的成员" };
    return {
        ok: true,
        rows: result.data.map((row) => ({ username: row.username || "", displayName: row.displayName || "", password: row.password || "", role: row.role as SchoolMemberRole })),
    };
}
