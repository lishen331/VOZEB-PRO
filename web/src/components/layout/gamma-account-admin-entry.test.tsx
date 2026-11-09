import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LocalUser } from "@/stores/use-user-store";
import type { GammaMenuItem } from "@/components/gamma-ui/gamma-overlays";
const captured = vi.hoisted(() => ({ items: [] as GammaMenuItem[] }));
vi.mock("@/components/layout/announcement-notification-center", () => ({ AnnouncementNotificationCenter: () => null }));
vi.mock("@/components/gamma-ui/gamma-overlays", () => ({
    GammaMenu: ({ items }: { items: GammaMenuItem[] }) => {
        captured.items = items;
        return (
            <div>
                {items.map((item) => (
                    <span key={item.key}>{item.label}</span>
                ))}
            </div>
        );
    },
}));
import { GammaAccountActions } from "./gamma-account-actions";
const user = { username: "admin-fixture", displayName: "Admin fixture", accountId: "0001", pointsBalance: 10, role: "admin" } as LocalUser;
const props = { ready: true, dark: false, onToggleTheme: vi.fn(), onLogin: vi.fn(), onLogout: vi.fn() };
describe("administrator management entry", () => {
    it.each([false, true])("keeps the admin entry when collapsed=%s and routes to /admin", (collapsed) => {
        const onOpen = vi.fn();
        const html = renderToStaticMarkup(<GammaAccountActions {...props} collapsed={collapsed} user={user} onOpen={onOpen} />);
        expect(html).toContain("进入管理中心");
        expect(html).not.toContain("套餐与积分");
        captured.items.find((item) => item.key === "admin")?.onSelect();
        expect(onOpen).toHaveBeenCalledWith("/admin");
    });
    it("does not expose the admin entry to a normal user", () => {
        const html = renderToStaticMarkup(<GammaAccountActions {...props} collapsed={false} user={{ ...user, role: "user" }} onOpen={vi.fn()} />);
        expect(html).not.toContain("进入管理中心");
        expect(captured.items.some((item) => item.key === "admin")).toBe(false);
    });
});
