import { describe, expect, it, vi } from "vitest";

import { IpLibraryRepository } from "./ip-library-repository";

describe("IP library PostgreSQL repository", () => {
    it("does not queue or delete a package that has a school grant", async () => {
        const query = vi
            .fn()
            .mockResolvedValueOnce({ rows: [{ id: "ip-one" }] })
            .mockResolvedValueOnce({ rows: [{ id: "ip-one" }] })
            .mockResolvedValueOnce({ rows: [{ id: "grant-one" }] });
        const repository = new IpLibraryRepository({ query });

        await expect(repository.deleteIpPackage("ip-one")).resolves.toBe("has-school-grants");
        expect(query).toHaveBeenNthCalledWith(1, "SELECT id FROM ip_packages WHERE id = $1 FOR UPDATE", ["ip-one"]);
        expect(query).toHaveBeenNthCalledWith(2, "SELECT id FROM ip_packages WHERE id = $1", ["ip-one"]);
        expect(query).toHaveBeenNthCalledWith(3, "SELECT id FROM ip_school_grants WHERE ip_id = $1 LIMIT 1 FOR UPDATE", ["ip-one"]);
        expect(query).toHaveBeenCalledTimes(3);
    });

    it("filters download records by type and result", async () => {
        const query = vi
            .fn()
            .mockResolvedValueOnce({ rows: [{ count: "0" }] })
            .mockResolvedValueOnce({ rows: [] });
        const repository = new IpLibraryRepository({ query });

        await expect(repository.listIpDownloads({ ipId: "ip-one", subIpId: "sub-one", schoolId: "school-one", userId: "user-one", downloadType: "package", result: "failed" })).resolves.toMatchObject({ items: [], total: 0 });

        expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("download_type = $5"), ["ip-one", "sub-one", "school-one", "user-one", "package", "failed"]);
        expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("result = $6"), ["ip-one", "sub-one", "school-one", "user-one", "package", "failed", 20, 0]);
    });

    it("persists a null end date when restoring a long-term grant", async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });
        const repository = new IpLibraryRepository({ query });

        await repository.updateSchoolGrant("ip-one", "grant-one", { endsAt: null, updatedAt: "2026-09-07T00:00:00.000Z" });

        expect(query).toHaveBeenCalledWith(expect.stringContaining("ends_at = CASE WHEN $4 THEN $5::timestamptz ELSE ends_at END"), ["ip-one", "grant-one", null, true, null, null, "2026-09-07T00:00:00.000Z"]);
    });

    it("replaces a package cover before deleting the child that owns it", async () => {
        const query = vi
            .fn()
            .mockResolvedValueOnce({ rows: [{ id: "ip-one" }] })
            .mockResolvedValueOnce({ rows: [{ id: "child-one" }] })
            .mockResolvedValueOnce({ rows: [{ id: "child-two" }] })
            .mockResolvedValueOnce({
                rows: [{ id: "cover-one", ip_id: "ip-one", sub_ip_id: "child-one", kind: "image", original_name: "cover.png", extension: ".png", mime_type: "image/png", byte_size: 1, sha256: "hash", storage_provider: "local", storage_key: "cover" }],
            })
            .mockResolvedValue({ rows: [] });
        const repository = new IpLibraryRepository({ query });

        await repository.deleteIpSubIp("ip-one", "child-one");

        expect(query).toHaveBeenCalledWith(expect.stringContaining("SET cover_file_id ="), ["ip-one", "child-one"]);
        expect(query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM ip_sub_ips"), ["ip-one", "child-one"]);
    });
});
