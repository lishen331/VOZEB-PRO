import { describe, expect, it } from "vitest";

import { getAntThemeConfig } from "./app-theme";

describe("app Select theme", () => {
    it.each([false, true])("keeps selected items neutral and hover-driven (dark=%s)", (dark) => {
        const config = getAntThemeConfig(dark);
        const select = config.components?.Select;

        expect(select?.optionSelectedBg).toBe("transparent");
        expect(select?.optionSelectedFontWeight).toBe(400);
        expect(select?.controlItemBgActiveHover).toBe(select?.optionSelectedBg);
        expect(select?.activeBorderColor).not.toBe(dark ? "#fafafa" : "#171717");
    });
});

describe("BlueGamma brand theme", () => {
    it.each([false, true])("uses Gamma Blue as primary only when brand is on (dark=%s)", (dark) => {
        expect(getAntThemeConfig(dark, { brand: true }).token?.colorPrimary).toBe("#0050f5");
        expect(getAntThemeConfig(dark).token?.colorPrimary).toBe(dark ? "#fafafa" : "#171717");
    });

    it("keeps the canvas editor (brand off) on its own css-var namespace", () => {
        expect(getAntThemeConfig(true).cssVar).toEqual({ key: "vozeb-pro-dark" });
        expect(getAntThemeConfig(true, { brand: true }).cssVar).toEqual({ key: "bluegamma-dark" });
    });
});
