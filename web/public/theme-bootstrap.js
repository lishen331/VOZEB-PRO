try {
    const value = JSON.parse(localStorage.getItem("vozeb-pro:theme_store") || "{}");
    const isCanvas = /^\/(?:canvas|drama-canvas)\/[^/]+/.test(location.pathname);
    const theme = isCanvas ? (value?.state?.canvasThemeOverride === "light" ? "light" : "dark") : value?.state?.theme === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
    // 布鲁伽马换肤：非画布编辑器路由挂 gm-app（同步 app-providers.tsx）
    document.documentElement.classList.toggle("gm-app", !isCanvas);
    document.documentElement.style.colorScheme = theme;
} catch {}
