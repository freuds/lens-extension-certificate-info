import { describe, expect, it } from "vitest";
import { extractCertificatesFromPEM } from "./certificates";

const certificate = (body: string) => `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`;

describe("extractCertificatesFromPEM", () => {
  it("returns every certificate block of a chain", () => {
    expect(extractCertificatesFromPEM(`${certificate("one")}\n${certificate("two")}\n`)).toEqual([
      certificate("one"),
      certificate("two"),
    ]);
  });

  it("leaves out other blocks, such as a private key", () => {
    const pem = `-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n${certificate("one")}`;

    expect(extractCertificatesFromPEM(pem)).toEqual([certificate("one")]);
  });

  it("ignores a block without a footer", () => {
    expect(extractCertificatesFromPEM("-----BEGIN CERTIFICATE-----\ntruncated")).toEqual([]);
  });
});
