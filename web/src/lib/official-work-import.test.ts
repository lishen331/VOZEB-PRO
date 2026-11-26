import { describe, expect, it } from "vitest";

import { matchOfficialWorkImportFiles, parseOfficialWorkImportCsv, parseOfficialWorkImportCsvBytes } from "./official-work-import";

describe("official work bulk import manifest", () => {
    const header = "title,description,publicPrompt,category,tags,authorName,authorDisplay,coverFile,mediaFiles";
    const chineseRow = "山海新作,,,插画,,,custom,封面.png,封面.png|片段.mp4";

    it("preserves GBK titles and matches media by the original Chinese filenames", () => {
        const gbkRow = Buffer.from("c9bdbaa3d0c2d7f72c2c2cb2e5bbad2c2c2c637573746f6d2cb7e2c3e62e706e672cb7e2c3e62e706e677cc6acb6ce2e6d7034", "hex");
        const manifest = Uint8Array.from(Buffer.concat([Buffer.from(`${header}\r\n`), gbkRow]));
        const parsed = parseOfficialWorkImportCsvBytes(manifest.buffer);
        expect(parsed).toEqual(parseOfficialWorkImportCsv(`${header}\r\n${chineseRow}`));
        if (!parsed.ok) throw new Error(parsed.message);
        const files = [new File(["i"], "封面.png", { type: "image/png" }), new File(["v"], "片段.mp4", { type: "video/mp4" })];
        expect(matchOfficialWorkImportFiles(parsed.rows, files)).toMatchObject({ ok: true, rows: [{ coverFileObject: files[0], mediaFileObjects: files }] });
    });

    it.each(["", "\uFEFF"])("preserves UTF-8 text with or without a BOM (%j)", (bom) => {
        const source = `${header}\r\n${chineseRow}`;
        expect(parseOfficialWorkImportCsvBytes(new TextEncoder().encode(bom + source).buffer)).toEqual(parseOfficialWorkImportCsv(source));
    });

    it("distinguishes invalid encoding from invalid headers and extra columns", () => {
        const encode = (source: string) => new TextEncoder().encode(source);
        for (const bytes of [Uint8Array.of(0xff), Uint8Array.of(0xef, 0xbb, 0xbf, 0xb7, 0xe2), encode(`${header}\n${chineseRow}\0`), encode(`${header}\n${chineseRow}\uFFFD`)]) {
            expect(parseOfficialWorkImportCsvBytes(bytes.buffer)).toMatchObject({ ok: false, message: expect.stringContaining("编码有误") });
        }
        expect(parseOfficialWorkImportCsvBytes(encode(`wrong,${header}\n${chineseRow}`).buffer)).toMatchObject({ ok: false, row: 1, message: expect.stringContaining("CSV 列必须") });
        expect(parseOfficialWorkImportCsvBytes(encode(`${header}\n${chineseRow},多余`).buffer)).toMatchObject({ ok: false, message: expect.stringContaining("额外列") });
    });

    it("parses quoted Chinese metadata and maps media by exact filename", () => {
        const parsed = parseOfficialWorkImportCsv(`${header}\r\n"山海新作","作品, 简介","公开提示词","插画","国风|海报","项目组","custom","封面.png","封面.png|过程.mp4"`);
        expect(parsed).toMatchObject({ ok: true, rows: [{ title: "山海新作", description: "作品, 简介", tags: ["国风", "海报"] }] });
        if (!parsed.ok) throw new Error(parsed.message);
        const files = [new File(["i"], "封面.png", { type: "image/png" }), new File(["v"], "过程.mp4", { type: "video/mp4" })];
        expect(matchOfficialWorkImportFiles(parsed.rows, files)).toMatchObject({ ok: true, rows: [{ coverFileObject: files[0], mediaFileObjects: files }] });
    });
    it("rejects missing titles, wrong columns, duplicate rows, missing files and ambiguous filenames", () => {
        expect(parseOfficialWorkImportCsv(`${header},extra\n作品,简介,,插画,,官方,custom,封面.png,封面.png,多余`)).toMatchObject({ ok: false, row: 1 });
        expect(parseOfficialWorkImportCsv(`${header}\n,简介,,插画,,官方,custom,封面.png,封面.png`)).toMatchObject({ ok: false, row: 2 });
        expect(parseOfficialWorkImportCsv(`${header}\n作品,简介,,插画,,官方,custom,封面.png,封面.png\n作品,简介,,插画,,官方,custom,封面.png,封面.png`)).toMatchObject({ ok: false, row: 3, message: expect.stringContaining("重复") });
        const parsed = parseOfficialWorkImportCsv(`${header}\n作品,简介,,视频,,官方,custom,封面.png,封面.png|片段.mp4`);
        if (!parsed.ok) throw new Error(parsed.message);
        expect(matchOfficialWorkImportFiles(parsed.rows, [new File(["i"], "封面.png", { type: "image/png" })])).toMatchObject({ ok: false, row: 2, message: expect.stringContaining("片段.mp4") });
        expect(matchOfficialWorkImportFiles(parsed.rows, [new File(["i"], "封面.png", { type: "image/png" }), new File(["i"], "封面.png", { type: "image/png" }), new File(["v"], "片段.mp4", { type: "video/mp4" })])).toMatchObject({
            ok: false,
            message: expect.stringContaining("重名"),
        });
    });
    it("requires an image cover and rejects audio", () => {
        const parsed = parseOfficialWorkImportCsv(`${header}\n作品,简介,,视频,,官方,custom,封面.png,封面.png|片段.mp4`);
        if (!parsed.ok) throw new Error(parsed.message);
        const cover = new File(["i"], "封面.png", { type: "image/png" });
        const video = new File(["v"], "片段.mp4", { type: "video/mp4" });
        expect(matchOfficialWorkImportFiles([{ ...parsed.rows[0], coverFile: "片段.mp4" }], [cover, video])).toMatchObject({ ok: false, message: expect.stringContaining("必须是图片") });
        expect(matchOfficialWorkImportFiles([{ ...parsed.rows[0], mediaFiles: [...parsed.rows[0].mediaFiles, "旁白.wav"] }], [cover, video, new File(["a"], "旁白.wav", { type: "audio/wav" })])).toMatchObject({
            ok: false,
            message: expect.stringContaining("音频"),
        });
    });
});
