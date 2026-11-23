/**
 * 3D 导演台运行时配置。
 *
 * 原仓库是 Vite 项目，用构建期常量 `__LOCAL_GUO_ASSETS_AVAILABLE__` 等和
 * `import.meta.env.BASE_URL` 判断内置资源是否可用、资源从哪个前缀加载。
 * Next.js 没有这套机制，这里改成普通常量 + 可配置的资源前缀。
 *
 * 换 CDN 或对象存储时只需要设置 `NEXT_PUBLIC_DIRECTOR_DESK_ASSET_BASE`，
 * 不需要改任何组件代码。
 */

/** 静态资源前缀，末尾带 `/`。默认走站内 public 目录。 */
export const DIRECTOR_DESK_ASSET_BASE = `${(process.env.NEXT_PUBLIC_DIRECTOR_DESK_ASSET_BASE || "/local-assets").replace(/\/+$/, "")}/`;

/** 站内公开模型目录（UE4 人偶等），固定在 public/models 下。 */
export const DIRECTOR_DESK_PUBLIC_BASE = "/";

/**
 * 内置 GUO 资源包（guo-3d-assets）随仓库分发时开启；
 * 删掉 `public/local-assets/guo-3d-assets` 就自动回到空模型库，不会报错。
 */
export const LOCAL_GUO_ASSETS_AVAILABLE = true;

/** Mixamo 兼容人物（camille / xbot / soldier / robot-expressive）。 */
export const LOCAL_MIXAMO_CHARACTER_AVAILABLE = true;

/** Mixamo 动作剪辑（walk / run / jump 等）。 */
export const LOCAL_MIXAMO_ANIMATIONS_AVAILABLE = true;

/** 展示用版本号，与上游 README 的 v0.3.x 保持一致。 */
export const DIRECTOR_DESK_APP_VERSION = "0.3.1";
