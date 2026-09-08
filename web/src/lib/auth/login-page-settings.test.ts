import { describe, expect, it } from "vitest";

import { DEFAULT_SITE_SETTINGS } from "./store-foundation";
import { normalizeSiteSettings } from "./store-normalizers";

describe("login page site settings", () => {
    it("ships deployable education login defaults", () => {
        expect(DEFAULT_SITE_SETTINGS.loginPage).toEqual({
            heroVideoUrl: "/login/hero.mp4",
            heroPosterUrl: "/login/hero-poster.webp",
            jointBrandUrl: "/login/joint-brand.webp",
            slogan: "以热爱，燃未来",
            platformName: "AIGC 智能影像教学平台",
            footerOrganization: "",
            servicePhone: "",
            serviceHours: "",
        });
    });

    it("normalizes login copy and only accepts same-site or HTTPS media", () => {
        const settings = normalizeSiteSettings({
            loginPage: {
                heroVideoUrl: "C:\\Users\\admin\\Desktop\\hero.mp4",
                heroPosterUrl: "javascript:alert(1)",
                jointBrandUrl: "https://cdn.example.com/brand.webp",
                slogan: "  教育新未来  ",
                platformName: "  影像教学平台  ",
                footerOrganization: "  蓝色伽马  ",
                servicePhone: "  400-0000  ",
                serviceHours: "  工作日 09:00-18:00  ",
            },
        });

        expect(normalizeSiteSettings({ loginPage: { ...DEFAULT_SITE_SETTINGS.loginPage, footerOrganization: "", servicePhone: "", serviceHours: "" } }).loginPage).toMatchObject({ footerOrganization: "", servicePhone: "", serviceHours: "" });
        expect(settings.loginPage).toMatchObject({
            heroVideoUrl: DEFAULT_SITE_SETTINGS.loginPage.heroVideoUrl,
            heroPosterUrl: DEFAULT_SITE_SETTINGS.loginPage.heroPosterUrl,
            jointBrandUrl: "https://cdn.example.com/brand.webp",
            slogan: "教育新未来",
            platformName: "影像教学平台",
            footerOrganization: "蓝色伽马",
            servicePhone: "400-0000",
            serviceHours: "工作日 09:00-18:00",
        });
    });
});
