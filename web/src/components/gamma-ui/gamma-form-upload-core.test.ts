import { describe, expect, it } from "vitest";

import { validateAll, validateField, visibleError } from "@/components/gamma-ui/gamma-form-core";
import { acceptsFile, checkFiles, describeAccept, formatBytes } from "@/components/gamma-ui/gamma-upload-core";

type Values = { title: string; tags: readonly string[]; minutes: number; email: string; confirm: string };
const values: Values = { title: "", tags: [], minutes: 200, email: "x", confirm: "a" };

describe("表单校验内核", () => {
    it("必填：空字符串 / 空数组 / 纯空格都算空；可自定义文案", () => {
        expect(validateField("  ", { required: true }, values, "课程名")).toBe("请填写课程名");
        expect(validateField([], { required: "至少选一个标签" }, values)).toBe("至少选一个标签");
        expect(validateField("", {}, values)).toBeUndefined();
    });

    it("长度按字符（中文算 1 个），数组按项", () => {
        expect(validateField("室内", { minLength: 3 }, values, "课程名")).toBe("课程名至少 3 个字");
        expect(validateField(["a", "b", "c"], { maxLength: 2 }, values, "标签")).toBe("标签最多 2 项");
    });

    it("数值区间、正则、联动校验", () => {
        expect(validateField(200, { max: 180 }, values, "时长")).toBe("时长不能大于 180");
        expect(validateField("x", { pattern: { test: /@/, message: "邮箱格式不对" } }, values)).toBe("邮箱格式不对");
        expect(validateField("b", { validate: (value, all) => (value === all.confirm ? undefined : "两次不一致") }, values)).toBe("两次不一致");
    });

    it("validateAll 只返回有错的字段", () => {
        const errors = validateAll(values, { title: { required: true }, minutes: { max: 180 }, tags: {} }, { title: "课程名", minutes: "时长" });
        expect(errors).toEqual({ title: "请填写课程名", minutes: "时长不能大于 180" });
    });

    it("报错时机：没碰过且没提交不显示；碰过或提交后显示", () => {
        const errors = { title: "请填写课程名" };
        expect(visibleError<Values>(errors, "title", {}, false)).toBeUndefined();
        expect(visibleError<Values>(errors, "title", { title: true }, false)).toBe("请填写课程名");
        expect(visibleError<Values>(errors, "title", {}, true)).toBe("请填写课程名");
    });
});

const file = (name: string, size: number, type: string) => ({ name, size, type });

describe("上传校验", () => {
    it("按扩展名、MIME 通配、精确 MIME 匹配", () => {
        expect(acceptsFile(file("a.PNG", 1, "image/png"), ["image/*"])).toBe(true);
        expect(acceptsFile(file("课件.pptx", 1, ""), [".pptx"])).toBe(true);
        expect(acceptsFile(file("a.mp4", 1, "video/mp4"), ["image/*", ".pdf"])).toBe(false);
        expect(acceptsFile(file("a.mp4", 1, "video/mp4"), undefined)).toBe(true);
    });

    it("格式 / 大小 / 数量逐个给出原因，已有数量计入上限", () => {
        const { accepted, rejected } = checkFiles(
            [file("a.png", 10, "image/png"), file("b.gif", 3 * 1024 * 1024, "image/gif"), file("c.exe", 10, "application/x"), file("d.png", 10, "image/png")],
            { accept: ["image/*"], maxSize: 2 * 1024 * 1024, maxFiles: 2 },
            1,
        );
        expect(accepted.map((item) => item.name)).toEqual(["a.png"]);
        expect(rejected.map((item) => item.reason)).toEqual(["超过 2.0 MB（当前 3.0 MB）", "格式不支持，仅支持 图片", "最多上传 2 个"]);
    });

    it("文件大小与格式说明的文案", () => {
        expect(formatBytes(512)).toBe("512 B");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
        expect(describeAccept(["image/*", ".pdf"])).toBe("图片 / PDF");
    });
});
