import { X509Certificate } from "node:crypto";

import type { CertificateInfo } from "../common/certificates";

function getKeyType(cert: X509Certificate): string {
  const publicKey = cert.publicKey;
  const keyDetails = publicKey.asymmetricKeyDetails;

  switch (publicKey.asymmetricKeyType) {
    case "rsa":
      return `RSA${keyDetails?.modulusLength ?? "unknown"}`;
    case "ec":
      return `EC (${keyDetails?.namedCurve ?? "unknown"})`;
    case "ed25519":
      return "Ed25519";
    case "ed448":
      return "Ed448";
    default:
      return publicKey.asymmetricKeyType ?? "Unknown";
  }
}

function isSelfSigned(cert: X509Certificate): boolean {
  if (cert.issuer !== cert.subject) {
    return false;
  }

  try {
    return cert.verify(cert.publicKey);
  } catch {
    return false;
  }
}

/**
 * The metadata of one PEM certificate block, or `null` when the block is not a
 * valid X.509 certificate.
 */
export function describeCertificate(pem: string): CertificateInfo | null {
  let cert: X509Certificate;

  try {
    cert = new X509Certificate(pem);
  } catch {
    return null;
  }

  let keyType: string;

  try {
    keyType = getKeyType(cert);
  } catch {
    keyType = "Unknown";
  }

  return {
    subject: cert.subject,
    issuer: cert.issuer,
    subjectAltName: cert.subjectAltName,
    serialNumber: cert.serialNumber,
    validFrom: cert.validFrom,
    validTo: cert.validTo,
    keyType,
    selfSigned: isSelfSigned(cert),
  };
}

// A Secret holds a handful of certificates; anything far beyond that is not a
// request the renderer sends.
const MAX_CERTIFICATES = 256;

/**
 * The handler of `describeCertificatesChannel`. Its argument comes over IPC, so
 * it is checked rather than trusted.
 */
export function describeCertificates(pems: unknown): (CertificateInfo | null)[] {
  if (!Array.isArray(pems) || pems.length > MAX_CERTIFICATES || !pems.every((pem) => typeof pem === "string")) {
    throw new TypeError(`expected at most ${MAX_CERTIFICATES} PEM certificate blocks as strings`);
  }

  return pems.map(describeCertificate);
}
