import { createHash, X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { PaymentRuntimeConfig } from "./payment-config-store";
import { addAlipayCertificateParams, loadAlipayCredentials } from "./payment-signature-utils";

const certificate = readFileSync(new URL("./fixtures/alipay-test-certificate.pem", import.meta.url), "utf8");
const privateKey = readFileSync(new URL("./fixtures/alipay-test-private-key.pem", import.meta.url), "utf8");

describe("Alipay signature credentials", () => {
    it("keeps historical configurations on public-key mode", () => {
        const config = runtime({ VOZEB_PRO_ALIPAY_PRIVATE_KEY: privateKey, VOZEB_PRO_ALIPAY_PUBLIC_KEY: new X509Certificate(certificate).publicKey.export({ type: "spki", format: "pem" }).toString() });

        expect(loadAlipayCredentials(config)).toMatchObject({ signatureMode: "public_key", privateKey: privateKey.trim(), publicKey: expect.stringContaining("BEGIN PUBLIC KEY") });
        expect(loadAlipayCredentials(config)).not.toHaveProperty("appCertSn");
    });

    it("extracts the certificate public key and Alipay certificate serials", () => {
        const config = runtime({
            VOZEB_PRO_ALIPAY_SIGNATURE_MODE: "certificate",
            VOZEB_PRO_ALIPAY_PRIVATE_KEY: privateKey,
            VOZEB_PRO_ALIPAY_APP_CERT: certificate,
            VOZEB_PRO_ALIPAY_ALIPAY_CERT: certificate,
            VOZEB_PRO_ALIPAY_ROOT_CERT: certificate,
        });
        const parsed = new X509Certificate(certificate);
        const expectedSerial = createHash("md5").update(`${parsed.issuer}${parsed.serialNumber}`, "utf8").digest("hex");

        expect(loadAlipayCredentials(config)).toMatchObject({ signatureMode: "certificate", privateKey: privateKey.trim(), publicKey: expect.stringContaining("BEGIN PUBLIC KEY"), appCertSn: expectedSerial, rootCertSn: expectedSerial });
    });

    it("rejects an incomplete certificate configuration instead of falling back", () => {
        const config = runtime({ VOZEB_PRO_ALIPAY_SIGNATURE_MODE: "certificate", VOZEB_PRO_ALIPAY_PRIVATE_KEY: privateKey, VOZEB_PRO_ALIPAY_PUBLIC_KEY: "ordinary-key" });

        expect(() => loadAlipayCredentials(config)).toThrow("缺少支付宝应用公钥证书配置");
    });

    it("reads certificate and private key from configured server paths", () => {
        const config = runtime({
            VOZEB_PRO_ALIPAY_SIGNATURE_MODE: "certificate",
            VOZEB_PRO_ALIPAY_PRIVATE_KEY_PATH: fileURLToPath(new URL("./fixtures/alipay-test-private-key.pem", import.meta.url)),
            VOZEB_PRO_ALIPAY_APP_CERT_PATH: fileURLToPath(new URL("./fixtures/alipay-test-certificate.pem", import.meta.url)),
            VOZEB_PRO_ALIPAY_ALIPAY_CERT_PATH: fileURLToPath(new URL("./fixtures/alipay-test-certificate.pem", import.meta.url)),
            VOZEB_PRO_ALIPAY_ROOT_CERT_PATH: fileURLToPath(new URL("./fixtures/alipay-test-certificate.pem", import.meta.url)),
        });

        expect(loadAlipayCredentials(config).signatureMode).toBe("certificate");
    });

    it("adds certificate serial parameters only for certificate mode", () => {
        const config = runtime({
            VOZEB_PRO_ALIPAY_SIGNATURE_MODE: "certificate",
            VOZEB_PRO_ALIPAY_PRIVATE_KEY: privateKey,
            VOZEB_PRO_ALIPAY_APP_CERT: certificate,
            VOZEB_PRO_ALIPAY_ALIPAY_CERT: certificate,
            VOZEB_PRO_ALIPAY_ROOT_CERT: certificate,
        });
        const credentials = loadAlipayCredentials(config);
        expect(addAlipayCertificateParams({ app_id: "app" }, credentials)).toMatchObject({ app_cert_sn: credentials.appCertSn, alipay_root_cert_sn: credentials.rootCertSn });
        expect(addAlipayCertificateParams({ app_id: "app" }, { ...credentials, signatureMode: "public_key" })).toEqual({ app_id: "app" });
    });
});

function runtime(valuesByEnvName: Record<string, string>): PaymentRuntimeConfig {
    return { saved: { providers: {} }, providers: {}, valuesByEnvName };
}
