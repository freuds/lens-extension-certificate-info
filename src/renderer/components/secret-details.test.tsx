// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeCertificates as describeInMain } from "../../main/describe-certificate";
import { formatExpireDate, formatIssuer, formatNotBefore, formatSAN, SecretDetails } from "./secret-details";

import type { Renderer } from "@freelensapp/extensions";

import type { DescribeCertificates } from "../certificate-ipc";

const fixtureSecret = readFileSync(join(process.cwd(), "examples/test/secret.yaml"), "utf8");
const fixtureCertificate = fixtureSecret.match(/tls\.crt: ([A-Za-z0-9+/=]+)/)?.[1];

if (!fixtureCertificate) {
  throw new Error("examples/test/secret.yaml does not contain tls.crt fixture data");
}

const fixtureCertificatePem = Buffer.from(fixtureCertificate, "base64").toString("ascii");

// The main-process handler, called directly instead of over IPC.
const describeCertificates = vi.fn<DescribeCertificates>(async (pems) => describeInMain(pems));

function createSecret(data: Record<string, string>) {
  return {
    data,
    getKeys: () => Object.keys(data),
  } as unknown as Renderer.K8sApi.Secret;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SecretDetails", () => {
  it("renders certificate details from PEM data stored in a secret", async () => {
    render(
      <SecretDetails
        object={createSecret({ "tls.crt": fixtureCertificate })}
        describeCertificates={describeCertificates}
      />,
    );

    expect(await screen.findByText("Certificate Info - tls.crt (1)")).toBeDefined();
    expect(screen.getByText("Subject")).toBeDefined();
    expect(screen.getByText(/CN=CommonNameOrHostname/)).toBeDefined();
    expect(screen.getByText("Key Type")).toBeDefined();
    expect(screen.getByText("RSA4096")).toBeDefined();
    expect(screen.getByText("Serial Number")).toBeDefined();
    expect(screen.getByText("4256758DDFF38243E3FB180234AB9CB98135A117")).toBeDefined();
    expect(screen.getByText("Issuer")).toBeDefined();
    expect(screen.getByText("CommonNameOrHostname")).toBeDefined();
    expect(screen.getByText("(self-signed)")).toBeDefined();
    expect(screen.getByText("Not before")).toBeDefined();
    expect(screen.getByText("Aug 9 07:48:47 2025 GMT")).toBeDefined();
    expect(screen.getByText("Expires")).toBeDefined();
    expect(screen.getByText(/Aug 7 07:48:47 2035 GMT/)).toBeDefined();
    expect(screen.getByText(/\(Expires in \d+ days\)/)).toBeDefined();
  });

  it("renders multiple certificate blocks from one secret key", async () => {
    const certificateChain = Buffer.from(`${fixtureCertificatePem}\n${fixtureCertificatePem}`, "ascii").toString(
      "base64",
    );

    render(
      <SecretDetails
        object={createSecret({ "tls.crt": certificateChain })}
        describeCertificates={describeCertificates}
      />,
    );

    expect(await screen.findByText("Certificate Info - tls.crt (2)")).toBeDefined();
    expect(screen.getByText("Certificate Info - tls.crt (1)")).toBeDefined();
    expect(screen.getAllByText("RSA4096")).toHaveLength(2);
  });

  it("skips malformed PEM blocks without rendering certificate details", async () => {
    const malformedCertificate = Buffer.from(
      "-----BEGIN CERTIFICATE-----\nnot a certificate\n-----END CERTIFICATE-----\n",
      "ascii",
    ).toString("base64");

    const { container } = render(
      <SecretDetails
        object={createSecret({ "tls.crt": malformedCertificate })}
        describeCertificates={describeCertificates}
      />,
    );

    await waitFor(() => expect(describeCertificates).toHaveBeenCalledTimes(1));
    expect(container.textContent).toBe("");
  });

  it("sends only certificate blocks to the main process, never a private key", async () => {
    const pem = `-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n${fixtureCertificatePem}`;

    render(
      <SecretDetails
        object={createSecret({ "tls.pem": Buffer.from(pem, "ascii").toString("base64") })}
        describeCertificates={describeCertificates}
      />,
    );

    expect(await screen.findByText("Certificate Info - tls.pem (1)")).toBeDefined();
    expect(describeCertificates).toHaveBeenCalledWith([fixtureCertificatePem.trim()]);
  });

  it("does not call the main process when the secret does not contain certificate data", () => {
    const { container } = render(
      <SecretDetails
        object={createSecret({
          "tls.key": "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t",
          token: "not-base64-certificate-data",
        })}
        describeCertificates={describeCertificates}
      />,
    );

    expect(container.textContent).toBe("");
    expect(describeCertificates).not.toHaveBeenCalled();
  });

  it("does not render anything without a secret object", () => {
    const { container } = render(
      <SecretDetails
        object={undefined as unknown as Renderer.K8sApi.Secret}
        describeCertificates={describeCertificates}
      />,
    );

    expect(container.textContent).toBe("");
    expect(describeCertificates).not.toHaveBeenCalled();
  });
});

describe("formatting", () => {
  it("formats multiple SAN entries on separate lines", () => {
    const { container } = render(<>{formatSAN("DNS:example.com, IP Address:127.0.0.1")}</>);

    expect(container.textContent).toContain("DNS:example.com");
    expect(container.textContent).toContain("IP Address:127.0.0.1");
    expect(container.querySelectorAll("br")).toHaveLength(2);
  });

  it("does not infer self-signed status from matching common names alone", () => {
    const { container } = render(<>{formatIssuer("CN=Example CA", false)}</>);

    expect(container.textContent).toBe("Example CA");
  });

  it("uses explicit validity labels for expired and future certificates", () => {
    const expired = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toUTCString();
    const notBefore = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toUTCString();

    const { rerender } = render(<>{formatExpireDate(expired)}</>);
    expect(screen.getByText(/\(Expired \d+ days ago\)/)).toBeDefined();

    rerender(<>{formatNotBefore(notBefore)}</>);
    expect(screen.getByText(/\(Not valid yet, starts in \d+ days\)/)).toBeDefined();
  });
});
