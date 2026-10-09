export const GENERATION_BUSY_MESSAGE = "网络异常，请点击重试";
export const GENERATION_UNAVAILABLE_MESSAGE = "当前模型暂时不可用，请切换模型后重试";
export const GENERATION_POLICY_MESSAGE = "内容未通过安全审核，请修改描述或更换参考图后重试";
export const GENERATION_POINTS_MESSAGE = "积分不足，请充值后重试";
export const GENERATION_REAL_FACE_MESSAGE = "参考图包含真人人脸，请更换图片后重试";

const REAL_FACE_PATTERN = /人脸|真人|肖像|real[\s_-]?person|human[\s_-]?face|\bfaces?\b|portrait|likeness|celebrit/i;
const POLICY_PATTERN =
    /\b451\b|色情|裸露|低俗|涉黄|暴力|血腥|涉政|政治敏感|敏感|违规|违禁|审核未通过|未通过.{0,6}审核|安全策略|内容安全|sexual|nsfw|nudity|porn|violen|gore|politic|sensitive|moderation|content[\s_-]?(policy|filter|safety)|safety[\s_-]?(system|filter|check)|prohibited|inappropriate/i;
const UNAVAILABLE_PATTERN =
    /模型暂时不可用|模型暂不可用|没有可用.{0,6}(渠道|模型)|无可用.{0,6}渠道|模型.{0,6}(不存在|已下线|未启用|不支持)|渠道.{0,6}(繁忙|已满|满载)|鉴权失败|参数不被模型支持|model[\s_-]?not[\s_-]?found|no available channel|quota is not enough|insufficient[\s_-]?quota|unauthorized|forbidden|invalid api key/i;
// 前端自己生成、用户能据此操作的文案，展示时原样保留。
const PASSTHROUGH_MESSAGES = /^(?:参考图片已丢失，无法继续重试|背景补全蒙版已丢失，无法继续重试)$/;
const USER_FACING_MESSAGES = new Set([GENERATION_BUSY_MESSAGE, GENERATION_UNAVAILABLE_MESSAGE, GENERATION_POLICY_MESSAGE, GENERATION_POINTS_MESSAGE, GENERATION_REAL_FACE_MESSAGE]);

/** 任意生成失败文本 → 给用户看的文案。纯函数，可在渲染时调用；原始错误只留在后台。 */
export function generationUserMessage(raw: string | undefined | null) {
    const text = raw?.trim() || "";
    if (!text) return GENERATION_BUSY_MESSAGE;
    if (USER_FACING_MESSAGES.has(text) || PASSTHROUGH_MESSAGES.test(text)) return text;
    if (/积分不足|余额不足|insufficient[\s_-]?points/i.test(text)) return GENERATION_POINTS_MESSAGE;
    if (REAL_FACE_PATTERN.test(text)) return GENERATION_REAL_FACE_MESSAGE;
    if (POLICY_PATTERN.test(text)) return GENERATION_POLICY_MESSAGE;
    return UNAVAILABLE_PATTERN.test(text) ? GENERATION_UNAVAILABLE_MESSAGE : GENERATION_BUSY_MESSAGE;
}
