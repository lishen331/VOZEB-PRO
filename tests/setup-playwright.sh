#!/bin/bash
# Playwright 自动化测试环境搭建脚本

echo "🚀 开始安装 Playwright 测试环境..."

# 1. 安装 Playwright
npm install -D @playwright/test

# 2. 安装浏览器驱动
npx playwright install

# 3. 安装 Playwright 扩展
npm install -D @playwright/test-results-reporter

# 4. 安装 AI 辅助工具 (可选)
npm install -D openai dotenv

# 5. 创建测试配置
cat > playwright.config.ts << 'EOF'
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'test-results.xml' }]
  ],

  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3002',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
EOF

# 6. 创建测试目录结构
mkdir -p tests/e2e/{drama-lab,admin,common}
mkdir -p tests/fixtures
mkdir -p tests/utils

echo "✅ Playwright 环境安装完成!"
echo "📝 运行 'npm run test:e2e' 开始测试"
