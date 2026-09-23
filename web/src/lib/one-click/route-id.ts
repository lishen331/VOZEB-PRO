/**
 * 把 Next 路由参数还原成真实的项目 id。
 *
 * `useParams()` 返回的是**未解码**的原始路径段：一键成片的项目 id 形如
 * `drama-one-click-film:<uuid>`，冒号在 URL 里是 `%3A`，于是拿到的是
 * `drama-one-click-film%3A<uuid>`。若直接再 `encodeURIComponent` 去请求接口，
 * 就变成 `%253A`，服务端解码一次后得到字面量 `%3A`，按 id 查库必然落空 ——
 * 表现为"短剧项目不存在"，但项目其实好好地在库里。
 *
 * 只有一键成片踩到这个坑：其他项目 id（`drama-lab-...` / `drama-xxx`）不含冒号，
 * 编码前后一模一样，所以同样的写法在别处看不出问题。
 *
 * 这里做**幂等**解码：已经是明文冒号的输入原样返回，不会被二次破坏。
 */
export function decodeOneClickRouteId(value: unknown): string {
    const raw = typeof value === "string" ? value : "";
    if (!raw) return "";
    if (!raw.includes("%")) return raw;
    try {
        return decodeURIComponent(raw);
    } catch {
        // 含孤立的 % 时 decodeURIComponent 会抛，此时保留原值比崩掉页面好。
        return raw;
    }
}
