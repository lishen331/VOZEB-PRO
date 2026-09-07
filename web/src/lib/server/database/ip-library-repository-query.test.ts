import { describe, expect, it, vi } from "vitest";

import { IpLibraryRepository } from "./ip-library-repository";

describe("IP library PostgreSQL repository", () => {
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
});
