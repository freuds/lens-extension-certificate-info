import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeCertificate, describeCertificates } from "./describe-certificate";

const fixtureSecret = readFileSync(join(process.cwd(), "examples/test/secret.yaml"), "utf8");
const fixtureCertificate = fixtureSecret.match(/tls\.crt: ([A-Za-z0-9+/=]+)/)?.[1];

if (!fixtureCertificate) {
  throw new Error("examples/test/secret.yaml does not contain tls.crt fixture data");
}

const fixturePem = Buffer.from(fixtureCertificate, "base64").toString("ascii");

describe("describeCertificate", () => {
  it("describes a self-signed certificate", () => {
    expect(describeCertificate(fixturePem)).toEqual({
      subject: expect.stringContaining("CN=CommonNameOrHostname"),
      issuer: expect.stringContaining("CN=CommonNameOrHostname"),
      subjectAltName: undefined,
      serialNumber: "4256758DDFF38243E3FB180234AB9CB98135A117",
      validFrom: "Aug  9 07:48:47 2025 GMT",
      validTo: "Aug  7 07:48:47 2035 GMT",
      keyType: "RSA4096",
      selfSigned: true,
    });
  });

  it("returns null for a block that is not a certificate", () => {
    expect(describeCertificate("-----BEGIN CERTIFICATE-----\nnot a certificate\n-----END CERTIFICATE-----")).toBeNull();
  });
});

describe("describeCertificates", () => {
  it("describes every block, with null for an invalid one", () => {
    const result = describeCertificates([fixturePem, "garbage"]);

    expect(result).toHaveLength(2);
    expect(result[0]?.keyType).toBe("RSA4096");
    expect(result[1]).toBeNull();
  });

  it.each([["not an array"], [[42]], [Array.from({ length: 257 }, () => fixturePem)]])(
    "rejects an argument that is not a short list of strings: %#",
    (argument) => {
      expect(() => describeCertificates(argument)).toThrow(TypeError);
    },
  );
});
