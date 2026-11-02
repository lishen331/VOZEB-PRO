import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { LocalUser } from "@/stores/use-user-store";

vi.mock("@/components/layout/announcement-notification-center", () => ({
    AnnouncementNotificationCenter: () => <button type="button" aria-label="通知" />,
}));

import { GammaAccountActions, type GammaAccountActionsProps } from "./gamma-account-actions";

const noop = () => undefined;
const base: GammaAccountActionsProps = {
    collapsed: false,
    user: null,
    ready: true,
    dark: false,
    showHelp: true,
    onToggleTheme: noop,
    onLogin: noop,
    onPlans: noop,
    onOpen: noop,
    onLogout: noop,
};
const user = { username: "lin", displayName: "林汐", accountId: "10001", pointsBalance: 2680, planName: "免费版", role: "user" } as unknown as LocalUser;

describe("GammaAccountActions 版式（对齐 /bluegamma/home）", () => {
    it("已登录展开：积分卡 → 图标行 → 账户行，且不出现签到", () => {
        const html = renderToStaticMarkup(<GammaAccountActions {...base} user={user} />);
        const points = html.indexOf("2,680");
        const icons = html.indexOf('aria-label="通知"');
        const account = html.indexOf("林汐");
        expect(points).toBeGreaterThan(-1);
        expect(points).toBeLessThan(icons);
        expect(icons).toBeLessThan(account);
        expect(html).toContain("justify-between");
        expect(html).not.toContain("签到");
    });

    it("未登录展开：登录卡在上，帮助 / 主题图标在下", () => {
        const html = renderToStaticMarkup(<GammaAccountActions {...base} />);
        expect(html.indexOf("登录后开始创作")).toBeLessThan(html.indexOf('aria-label="帮助中心"'));
    });
});
