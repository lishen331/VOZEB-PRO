/** Wrap a free-form user draft in the L-compatible envelope at submit time. */
export function normalizeDramaLabUniversalVideoPrompt(prompt: string, duration: number) {
    const value = prompt.trim();
    if (!value) return value;
    const lines = value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines[0]?.startsWith("画面风格和类型") && /^生成一个由以下[1-8]个分镜组成的视频[。.]?$/.test(lines[1] || "")) return value;
    const references = Array.from(value.matchAll(/@图片\d+/g), (match) => match[0])
        .filter((item, index, all) => all.indexOf(item) === index)
        .join("、");
    return [`画面风格和类型：保持用户草稿指定的视觉风格。`, `生成一个由以下1个分镜组成的视频`, `环境与参考图说明：${references || "本镜头不使用额外参考图"}。`, `分镜1：${duration}秒：${value}`].join("\n");
}
/** Production L multi-beat structure; validate rather than silently rewriting user prompts. */
export function validateDramaLabUniversalVideoPrompt(prompt: string, duration: number, referenceCount: number) {
    const lines = prompt
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const count = lines[1]?.match(/^生成一个由以下([1-8])个分镜组成的视频[。.]?$/);
    if (!lines[0]?.startsWith("画面风格和类型") || !count || lines.length !== Number(count[1]) + 3) throw new Error("全能提示词须包含风格、子分镜数量、参考说明及每行一个子分镜（1–8个）");
    let total = 0;
    for (const [index, line] of lines.slice(3).entries()) {
        const beat = line.match(/^分镜(\d+)[：:]\s*(\d+(?:\.\d+)?)秒[：:]\s*(.+)$/);
        if (!beat || Number(beat[1]) !== index + 1 || !Number.isFinite(Number(beat[2])) || Number(beat[2]) <= 0) throw new Error("全能提示词子分镜编号须连续、时长须为正数且内容不能为空");
        total += Number(beat[2]);
    }
    if (!Number.isFinite(duration) || duration <= 0 || Math.abs(total - duration) > Number.EPSILON * Math.max(total, duration) * lines.length) throw new Error(`全能提示词子分镜时长合计 ${total} 秒，与当前镜头 ${duration} 秒不一致`);
    if (/@人物\d+/.test(prompt)) throw new Error("全能提示词参考图必须使用 @图片N，不使用 @人物N");
    for (const match of prompt.matchAll(/@图片(\d+)/g)) {
        const slot = Number(match[1]);
        if (!Number.isSafeInteger(slot) || slot < 1 || slot > referenceCount) throw new Error(`全能提示词引用了不存在的参考图 @图片${match[1]}（当前 ${referenceCount} 张）`);
    }
}
