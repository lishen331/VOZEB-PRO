import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AppProviders } from "@/components/layout/app-providers";
import { absoluteSiteUrl, browserIconHref, getPublicSiteSettings, siteMetadataBase } from "@/lib/server/site-metadata";
import { buildWebsiteStructuredData, serializeStructuredData } from "@/lib/structured-data";
import "antd/dist/reset.css";
import "./globals.css";
import React from "react";

// The pre-hydration theme script lives in /public/theme-bootstrap.js and is
// loaded via <script src>. It must run before hydration to avoid a theme
// flash, and cannot import app code. React 19 only hoists/executes external
// (src) scripts — inline script content (dangerouslySetInnerHTML or Script
// children) is never executed on client render, so it must stay a src file.
// Keep it in sync with the canvas-editor-route + effective-theme logic in
// app-providers.tsx (CANVAS_EDITOR_ROUTE / useCanvasColorTheme) and the
// storage prefix in storage-keys.ts (appStorageKey("theme_store")).

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#ffffff" },
        { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    ],
};

export async function generateMetadata(): Promise<Metadata> {
    const site = await getPublicSiteSettings();
    const base = siteMetadataBase();
    const logoUrl = absoluteSiteUrl(site.logoUrl || "/logo.svg", base);
    const title = site.seoTitle || site.title;
    return {
        metadataBase: base,
        title,
        description: site.seoDescription,
        alternates: { canonical: "/" },
        keywords: site.seoKeywords
            .split(/[,，]/)
            .map((keyword) => keyword.trim())
            .filter(Boolean),
        openGraph: {
            type: "website",
            title,
            description: site.seoDescription,
            siteName: site.title,
            images: logoUrl ? [{ url: logoUrl }] : undefined,
            locale: "zh_CN",
        },
        twitter: {
            card: "summary",
            title,
            description: site.seoDescription,
            images: logoUrl ? [logoUrl] : undefined,
        },
    };
}

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const [site, requestHeaders] = await Promise.all([getPublicSiteSettings(), headers()]);
    const nonce = requestHeaders.get("x-nonce") || undefined;
    const base = siteMetadataBase();
    const iconHref = browserIconHref(site);
    const websiteUrl = absoluteSiteUrl("/", base);
    const websiteStructuredData = buildWebsiteStructuredData({
        name: site.title,
        description: site.seoDescription,
        url: websiteUrl,
        logoUrl: absoluteSiteUrl(site.logoUrl || "/logo.svg", base),
    });

    return (
        <html lang="zh-CN" suppressHydrationWarning className="font-sans">
            <head>
                <script id="theme-bootstrap" src="/theme-bootstrap.js" async nonce={nonce} />
                <link rel="icon" href={iconHref} />
                <link rel="shortcut icon" href={iconHref} />
                <link rel="apple-touch-icon" href={iconHref} />
            </head>
            <body
                className="bg-background text-foreground antialiased"
                style={{
                    fontFamily: '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif',
                }}
            >
                <script id="website-json-ld" nonce={nonce} type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: serializeStructuredData(websiteStructuredData) }} />
                <AntdRegistry>
                    <AppProviders>{children}</AppProviders>
                </AntdRegistry>
            </body>
        </html>
    );
}
