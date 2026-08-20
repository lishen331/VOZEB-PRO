# 支付宝证书签名方式实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为支付宝同时支持普通公钥和证书签名两种加签方式，并让官方支付、当面付、退款、交易查询和异步回调共用正确的证书凭据。

**Architecture:** 在 `payment-signature-utils.ts` 增加共享支付宝凭据解析器，负责读取 PEM/文件、计算 `app_cert_sn` 与 `alipay_root_cert_sn`、提取支付宝公钥。支付业务模块只消费解析后的签名参数和验签公钥；配置定义、状态摘要和后台表单按 `mode` 与 `signatureMode` 两个独立字段动态计算。

**Tech Stack:** Next.js App Router、TypeScript、Node `crypto`/`fs`、Ant Design、Vitest、Playwright、现有文件 Provider/PostgreSQL settings。

## Global Constraints

- 历史支付宝配置没有 `signatureMode` 时按 `public_key` 解释。
- 证书模式不得回退到普通公钥，普通公钥模式不得发送证书序列号参数。
- 证书、私钥、签名原文和派生公钥不进入日志、审计 metadata、订单 metadata 或公开 DTO。
- 后台保存值继续加密；环境变量路径只能由服务端读取。
- 支付宝官方支付和当面付都必须覆盖两种加签方式。
- 每次修改必须运行相关 Vitest、TypeScript 检查；收尾运行 `pnpm check:release` 和支付宝页面浏览器验收。

---

### Task 1: 共享证书凭据解析器

**Files:**
- Modify: `web/src/lib/server/payment-signature-utils.ts`
- Test: `web/src/lib/server/payment-signature-utils.test.ts`

**Interfaces:**
- Produces `loadAlipayCredentials(config): { signatureMode: "public_key" | "certificate"; privateKey: string; publicKey: string; appCertSn?: string; rootCertSn?: string }`。
- `public_key` 读取现有 `VOZEB_PRO_ALIPAY_PUBLIC_KEY`/`_PATH`；`certificate` 读取 `VOZEB_PRO_ALIPAY_APP_CERT`、`VOZEB_PRO_ALIPAY_ALIPAY_CERT`、`VOZEB_PRO_ALIPAY_ROOT_CERT` 及对应路径变量。

- [ ] **Step 1: Write the failing tests**

  使用 Node `generateKeyPairSync` 和临时 PEM 证书夹具，断言历史配置默认 `public_key`；证书模式返回支付宝证书公钥、两个小写 MD5 序列号；根证书 bundle 选择 RSA 根证书；缺字段、非 PEM、非 RSA 证书抛出 `BillingInputError`。

- [ ] **Step 2: Run the focused tests and confirm RED**

  Run: `pnpm exec vitest run src/lib/server/payment-signature-utils.test.ts`

  Expected: FAIL because `loadAlipayCredentials` and certificate environment fields do not exist.

- [ ] **Step 3: Implement the minimal parser**

  使用 `X509Certificate` 解析 PEM；从应用证书和 RSA 根证书按 `MD5(issuer + serialNumber)` 计算序列号；从支付宝公钥证书提取 `publicKey`；统一读取后台 runtime value、环境变量 value 和路径文件，并对证书模式禁止普通公钥回退。

- [ ] **Step 4: Run tests and formatting**

  Run: `pnpm exec vitest run src/lib/server/payment-signature-utils.test.ts && pnpm exec prettier --check src/lib/server/payment-signature-utils.ts src/lib/server/payment-signature-utils.test.ts`

  Expected: all focused tests pass and Prettier passes.

- [ ] **Step 5: Commit**

  `git add web/src/lib/server/payment-signature-utils.ts web/src/lib/server/payment-signature-utils.test.ts && git commit -m "feat: add Alipay certificate credentials"`

### Task 2: 配置契约、状态和后台表单

**Files:**
- Modify: `web/src/lib/payment-config-types.ts`
- Modify: `web/src/lib/server/payment-config-store.ts`
- Modify: `web/src/lib/server/payment-config-status.ts`
- Modify: `web/src/app/admin/billing/components/billing-operation-elements.tsx`
- Test: `web/src/lib/payment-config-types.test.ts`
- Test: `web/src/lib/server/payment-config-save.test.ts`
- Test: `web/src/lib/server/payment-config-status.test.ts`
- Test: `web/src/app/admin/billing/components/billing-operation-elements.test.tsx`

**Interfaces:**
- Adds `AlipaySignatureMode = "public_key" | "certificate"`, default `public_key`, selector presentations, and fields `signatureMode`, `appCert`, `alipayCert`, `rootCert`.
- `checkoutFieldKeys` and `webhookFieldKeys` are selected by the saved/runtime `signatureMode`; certificate readiness requires all four certificate-mode secrets, ordinary readiness requires `publicKey`.

- [ ] **Step 1: Add RED contract tests**

  Assert certificate selector options, historical default, certificate field environment names, save partial-update retention, and status readiness switching between ordinary and certificate requirements.

- [ ] **Step 2: Run RED**

  Run: `pnpm exec vitest run src/lib/payment-config-types.test.ts src/lib/server/payment-config-save.test.ts src/lib/server/payment-config-status.test.ts src/app/admin/billing/components/billing-operation-elements.test.tsx`

  Expected: certificate option and dynamic readiness assertions fail.

- [ ] **Step 3: Implement config and UI**

  Add the selector independently from `mode`; show `publicKey` only for ordinary mode and app/private/app-cert/Alipay-cert/root-cert fields for certificate mode; keep server-path notes, secret blank-preserves-value behavior, and no secret echo. Update summary descriptions and requirement cards.

- [ ] **Step 4: Run focused tests, typecheck, and UI lint**

  Run: `pnpm exec vitest run src/lib/payment-config-types.test.ts src/lib/server/payment-config-save.test.ts src/lib/server/payment-config-status.test.ts src/app/admin/billing/components/billing-operation-elements.test.tsx && pnpm typecheck && pnpm exec eslint src/lib/payment-config-types.ts src/lib/server/payment-config-store.ts src/lib/server/payment-config-status.ts src/app/admin/billing/components/billing-operation-elements.tsx`

- [ ] **Step 5: Commit**

  `git add web/src/lib/payment-config-types.ts web/src/lib/server/payment-config-store.ts web/src/lib/server/payment-config-status.ts web/src/app/admin/billing/components/billing-operation-elements.tsx web/src/lib/payment-config-types.test.ts web/src/lib/server/payment-config-save.test.ts web/src/lib/server/payment-config-status.test.ts web/src/app/admin/billing/components/billing-operation-elements.test.tsx && git commit -m "feat: configure Alipay signing modes"`

### Task 3: 官方支付与当面付下单

**Files:**
- Modify: `web/src/lib/server/payment-checkout-providers.ts`
- Test: `web/src/lib/server/payment-checkout-providers.test.ts`
- Test: `web/src/lib/server/payment-provider-live.test.ts`

**Interfaces:**
- `createAlipayCheckout` consumes `loadAlipayCredentials`; certificate mode appends `app_cert_sn` and `alipay_root_cert_sn` before signing and verifies precreate responses with the certificate public key.

- [ ] **Step 1: Add RED tests**

  Add official certificate checkout and face-to-face certificate checkout tests; assert both certificate parameters participate in RSA2 signing, ordinary mode omits them, and face-to-face response signed by the configured Alipay certificate is accepted while a mismatched certificate is rejected.

- [ ] **Step 2: Run RED**

  Run: `pnpm exec vitest run src/lib/server/payment-checkout-providers.test.ts src/lib/server/payment-provider-live.test.ts`

- [ ] **Step 3: Implement checkout integration**

  Replace local Alipay private/public-key loading with shared credentials; preserve existing product methods, form/QR result shapes, amount/order checks, and outbound URL behavior.

- [ ] **Step 4: Run focused tests and typecheck**

  Run: `pnpm exec vitest run src/lib/server/payment-checkout-providers.test.ts src/lib/server/payment-provider-live.test.ts && pnpm typecheck`

- [ ] **Step 5: Commit**

  `git add web/src/lib/server/payment-checkout-providers.ts web/src/lib/server/payment-checkout-providers.test.ts web/src/lib/server/payment-provider-live.test.ts && git commit -m "feat: use Alipay certificates for checkout"`

### Task 4: 退款、交易查询和异步回调

**Files:**
- Modify: `web/src/lib/server/payment-refund-service.ts`
- Modify: `web/src/lib/server/payment-transaction-verification.ts`
- Modify: `web/src/lib/server/payment-webhook-adapters.ts`
- Test: `web/src/lib/server/payment-refund-service.test.ts`
- Test: `web/src/lib/server/payment-webhook-adapters.test.ts`
- Test: `web/src/lib/server/payment-transaction-verification.test.ts`

**Interfaces:**
- All Alipay signing and verification paths consume the same `loadAlipayCredentials` result.

- [ ] **Step 1: Add RED tests**

  Assert certificate serial params on refund/query, response verification with Alipay certificate public key, webhook verification with certificate mode, and rejection of signatures made by a different public key.

- [ ] **Step 2: Run RED**

  Run: `pnpm exec vitest run src/lib/server/payment-refund-service.test.ts src/lib/server/payment-webhook-adapters.test.ts src/lib/server/payment-transaction-verification.test.ts`

- [ ] **Step 3: Implement shared credential usage**

  Keep ordinary mode behavior byte-compatible; certificate mode adds serial params to signed requests and selects the Alipay certificate key for response/webhook verification. Do not alter order, amount, event id or status mapping.

- [ ] **Step 4: Run focused tests and integration checks**

  Run: `pnpm exec vitest run src/lib/server/payment-refund-service.test.ts src/lib/server/payment-webhook-adapters.test.ts src/lib/server/payment-transaction-verification.test.ts src/app/api/billing/webhooks/[provider]/route.test.ts && pnpm typecheck`

- [ ] **Step 5: Commit**

  `git add web/src/lib/server/payment-refund-service.ts web/src/lib/server/payment-transaction-verification.ts web/src/lib/server/payment-webhook-adapters.ts web/src/lib/server/payment-refund-service.test.ts web/src/lib/server/payment-webhook-adapters.test.ts web/src/lib/server/payment-transaction-verification.test.ts && git commit -m "feat: verify Alipay certificate callbacks"`

### Task 5: 发布验收、推送和合并 main

**Files:**
- Modify only if needed: `web/e2e/` payment configuration coverage and existing release docs.

- [ ] **Step 1: Run all payment tests**

  Run: `pnpm exec vitest run src/lib/payment-config-types.test.ts src/lib/server/payment-signature-utils.test.ts src/lib/server/payment-config-save.test.ts src/lib/server/payment-config-status.test.ts src/lib/server/payment-checkout-providers.test.ts src/lib/server/payment-refund-service.test.ts src/lib/server/payment-transaction-verification.test.ts src/lib/server/payment-webhook-adapters.test.ts src/app/admin/billing/components/billing-operation-elements.test.tsx --no-file-parallelism`

- [ ] **Step 2: Run release gates**

  Run: `pnpm check:release`

  Expected: audit, lint, formatting, Vitest, TypeScript, production build and static asset checks pass.

- [ ] **Step 3: Run browser acceptance**

  Run the existing payment/admin Playwright coverage in Chromium, 390px and 430px; verify selector switching, certificate fields, no horizontal overflow, no secret values in DOM or network response, and immediate post-save readiness refresh.

- [ ] **Step 4: Push and fast-forward merge**

  `git push origin codex/alipay-certificate-signing`

  After `origin/main` is refreshed and confirmed an ancestor: `git push origin origin/codex/alipay-certificate-signing:main`.

- [ ] **Step 5: Verify remote and Docker**

  Confirm `origin/main` and the feature branch point to the same commit, rebuild with `docker compose -f docker-compose.local.yml up -d --build app generation-worker`, and verify `/api/health/live` and `/api/health/ready`.

