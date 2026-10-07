try {
    const value = JSON.parse(localStorage.getItem("vozeb-pro:theme_store") || "{}");
    const isCanvas = /^\/(?:canvas|drama-canvas)\/[^/]+/.test(location.pathname);
    const theme = isCanvas ? (value?.state?.canvasThemeOverride === "light" ? "light" : "dark") : value?.state?.theme === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
} catch {}
