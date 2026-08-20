import { createHash, createVerify, X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";

import { BillingInputError } from "@/lib/server/billing-errors";
import { getPaymentRuntimeEnv, type PaymentRuntimeConfig } from "@/lib/server/payment-config-store";

export function verifyRsaSha256(content: string, signature: string, publicKey: string) {
    try {
        return createVerify("RSA-SHA256").update(content, "utf8").verify(publicKey, signature, "base64");
    } catch {
        return false;
    }
}

export type AlipaySignatureMode = "public_key" | "certificate";

export type AlipayCredentials = {
    signatureMode: AlipaySignatureMode;
    privateKey: string;
    publicKey: string;
    appCertSn?: string;
    rootCertSn?: string;
};

export function loadAlipayCredentials(paymentConfig: PaymentRuntimeConfig): AlipayCredentials {
    const signatureMode = getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_ALIPAY_SIGNATURE_MODE") === "certificate" ? "certificate" : "public_key";
    const privateKey = loadRequiredKey(paymentConfig, "VOZEB_PRO_ALIPAY_PRIVATE_KEY", "VOZEB_PRO_ALIPAY_PRIVATE_KEY_PATH", "支付宝私钥");
    if (signatureMode === "public_key") {
        const publicKeyConfigured = getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_ALIPAY_PUBLIC_KEY") || getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_ALIPAY_PUBLIC_KEY_PATH");
        return {
            signatureMode,
            privateKey,
            publicKey: publicKeyConfigured ? loadPaymentPublicKey(paymentConfig, "VOZEB_PRO_ALIPAY_PUBLIC_KEY", "VOZEB_PRO_ALIPAY_PUBLIC_KEY_PATH") : "",
        };
    }

    const appCertificate = loadCertificate(paymentConfig, "VOZEB_PRO_ALIPAY_APP_CERT", "VOZEB_PRO_ALIPAY_APP_CERT_PATH", "应用公钥证书");
    const alipayCertificate = loadCertificate(paymentConfig, "VOZEB_PRO_ALIPAY_ALIPAY_CERT", "VOZEB_PRO_ALIPAY_ALIPAY_CERT_PATH", "支付宝公钥证书");
    const rootCertificate = loadCertificate(paymentConfig, "VOZEB_PRO_ALIPAY_ROOT_CERT", "VOZEB_PRO_ALIPAY_ROOT_CERT_PATH", "支付宝根证书", true);
    const publicKey = normalizePublicKey(alipayCertificate.publicKey.export({ type: "spki", format: "pem" }).toString());
    return {
        signatureMode,
        privateKey,
        publicKey,
        appCertSn: certificateSerialNumber(appCertificate),
        rootCertSn: certificateSerialNumber(rootCertificate),
    };
}

export function loadAlipayVerificationKey(paymentConfig: PaymentRuntimeConfig) {
    if (getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_ALIPAY_SIGNATURE_MODE") !== "certificate") return loadPaymentPublicKey(paymentConfig, "VOZEB_PRO_ALIPAY_PUBLIC_KEY", "VOZEB_PRO_ALIPAY_PUBLIC_KEY_PATH");
    const certificate = loadCertificate(paymentConfig, "VOZEB_PRO_ALIPAY_ALIPAY_CERT", "VOZEB_PRO_ALIPAY_ALIPAY_CERT_PATH", "支付宝公钥证书");
    return normalizePublicKey(certificate.publicKey.export({ type: "spki", format: "pem" }).toString());
}

export function addAlipayCertificateParams(params: Record<string, string>, credentials: AlipayCredentials) {
    if (credentials.signatureMode !== "certificate") return params;
    if (!credentials.appCertSn || !credentials.rootCertSn) throw new BillingInputError("支付宝证书序列号缺失", 500);
    params.app_cert_sn = credentials.appCertSn;
    params.alipay_root_cert_sn = credentials.rootCertSn;
    return params;
}

export function loadPaymentPublicKey(paymentConfig: PaymentRuntimeConfig, valueEnv: string, pathEnv: string, certificateEnv?: string, certificatePathEnv?: string) {
    const direct = getPaymentRuntimeEnv(paymentConfig, valueEnv) || (certificateEnv ? getPaymentRuntimeEnv(paymentConfig, certificateEnv) : "");
    if (direct) return normalizePublicKey(direct);
    const path = getPaymentRuntimeEnv(paymentConfig, pathEnv) || (certificatePathEnv ? getPaymentRuntimeEnv(paymentConfig, certificatePathEnv) : "");
    if (path) return normalizePublicKey(readFileSync(path, "utf8"));
    throw new BillingInputError(`缺少支付公钥配置：${valueEnv}`, 500);
}

function normalizePublicKey(value: string) {
    const text = value.replace(/\\n/g, "\n").trim();
    if (text.includes("-----BEGIN")) return text;
    return `-----BEGIN PUBLIC KEY-----\n${text.match(/.{1,64}/g)?.join("\n") || text}\n-----END PUBLIC KEY-----`;
}

function loadRequiredKey(paymentConfig: PaymentRuntimeConfig, valueName: string, pathName: string, label: string) {
    const value = getPaymentRuntimeEnv(paymentConfig, valueName);
    const source = value || (getPaymentRuntimeEnv(paymentConfig, pathName) ? readFileSync(getPaymentRuntimeEnv(paymentConfig, pathName), "utf8") : "");
    if (!source.trim()) throw new BillingInputError(`缺少支付宝${label}配置`, 500);
    const normalized = source.replace(/\\n/g, "\n").trim();
    if (normalized.includes("-----BEGIN")) return normalized;
    return `-----BEGIN PRIVATE KEY-----\n${normalized.match(/.{1,64}/g)?.join("\n") || normalized}\n-----END PRIVATE KEY-----`;
}

function loadCertificate(paymentConfig: PaymentRuntimeConfig, valueName: string, pathName: string, label: string, allowBundle = false) {
    const direct = getPaymentRuntimeEnv(paymentConfig, valueName);
    const source = direct || (getPaymentRuntimeEnv(paymentConfig, pathName) ? readFileSync(getPaymentRuntimeEnv(paymentConfig, pathName), "utf8") : "");
    if (!source.trim()) throw new BillingInputError(`缺少支付宝${label}配置`, 500);
    const certificates = [...source.replace(/\\n/g, "\n").matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)].map((match) => match[0]);
    if (!certificates.length) throw new BillingInputError(`支付宝${label}格式无效`, 500);
    for (const pem of allowBundle ? certificates : certificates.slice(0, 1)) {
        try {
            const certificate = new X509Certificate(pem);
            if (certificate.publicKey.asymmetricKeyType === "rsa") return certificate;
        } catch {
            continue;
        }
    }
    throw new BillingInputError(`支付宝${label}格式无效`, 500);
}

function certificateSerialNumber(certificate: X509Certificate) {
    return createHash("md5").update(`${certificate.issuer}${certificate.serialNumber}`, "utf8").digest("hex");
}
