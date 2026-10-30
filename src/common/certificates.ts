// Shared by both entry points: the renderer extracts the certificate blocks
// from a Secret and the main process parses them, because X.509 parsing needs
// `node:crypto`, which renderer code does not get in Freelens 2.

// The RPC that parses PEM certificate blocks in the main process. Its argument
// is a `string[]` of PEM blocks, its result one `CertificateInfo | null` per
// block, `null` for a block that is not a valid certificate.
export const describeCertificatesChannel = "describe-certificates";

export type CertificateInfo = {
  subject: string;
  issuer: string;
  subjectAltName: string | undefined;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  keyType: string;
  selfSigned: boolean;
};

const PEM_CERTIFICATE_HEADER = "-----BEGIN CERTIFICATE-----";
const PEM_CERTIFICATE_FOOTER = "-----END CERTIFICATE-----";

// Base64 of "-----BEGIN", the start of every PEM document.
export const BASE64_PEM_PREFIX = "LS0tLS1CRUdJTi";

/**
 * The `CERTIFICATE` blocks of a PEM document, header and footer included. Other
 * blocks, such as a private key in the same document, are left out, so they
 * never leave the renderer.
 */
export function extractCertificatesFromPEM(pemString: string): string[] {
  const certificates: string[] = [];
  let startIndex = 0;

  while (true) {
    const headerIndex = pemString.indexOf(PEM_CERTIFICATE_HEADER, startIndex);
    if (headerIndex === -1) break;

    const footerIndex = pemString.indexOf(PEM_CERTIFICATE_FOOTER, headerIndex);
    if (footerIndex === -1) break;

    certificates.push(pemString.substring(headerIndex, footerIndex + PEM_CERTIFICATE_FOOTER.length));
    startIndex = footerIndex + PEM_CERTIFICATE_FOOTER.length;
  }

  return certificates;
}
