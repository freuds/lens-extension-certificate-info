import { Common, Renderer } from "@freelensapp/extensions";
import React from "react";
import { BASE64_PEM_PREFIX, extractCertificatesFromPEM } from "../../common/certificates";

import type { CertificateInfo } from "../../common/certificates";
import type { DescribeCertificates } from "../certificate-ipc";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysBetween(date: Date, now = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY);
}

export function formatExpireDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const color = now > date ? "red" : undefined;
  const diffInDays = daysBetween(date, now);
  const validityText = diffInDays < 0 ? `Expired ${Math.abs(diffInDays)} days ago` : `Expires in ${diffInDays} days`;

  return (
    <span style={{ color }}>
      {dateString} <i>({validityText})</i>
    </span>
  );
}

export function formatNotBefore(dateString: string) {
  const diffInDays = daysBetween(new Date(dateString));

  if (diffInDays <= 0) {
    return dateString;
  }

  return (
    <span style={{ color: "red" }}>
      {dateString} <i>(Not valid yet, starts in {diffInDays} days)</i>
    </span>
  );
}

export function formatSAN(subjectAltName: string | undefined) {
  return subjectAltName?.split(/, /).map((s, i) => (
    <React.Fragment key={`${s}-${i}`}>
      {s}
      <br />
    </React.Fragment>
  ));
}

function extractCN(distinguishedName: string | undefined): string | undefined {
  if (distinguishedName === undefined) {
    return undefined;
  }

  const cnMatch = distinguishedName.match(/CN=([^,\n]+)/);
  return cnMatch ? cnMatch[1].trim() : distinguishedName;
}

export function formatIssuer(issuer: string | undefined, selfSigned: boolean) {
  const issuerCN = extractCN(issuer);

  if (issuerCN === undefined) {
    return <i>No issuer</i>;
  }

  if (selfSigned) {
    return (
      <>
        {issuerCN} <i>(self-signed)</i>
      </>
    );
  }

  return <>{issuerCN}</>;
}

// Secret values are base64. A PEM document is ASCII, so the binary string of
// `atob` is the text itself; `Buffer` is not available in the renderer.
function decodeBase64(value: string): string | undefined {
  try {
    return atob(value);
  } catch {
    return undefined;
  }
}

type CertificateBlock = { key: string; index: number };
type DescribedCertificate = CertificateBlock & { info: CertificateInfo };

/** The certificate blocks of every key of the Secret that holds a PEM document. */
function findCertificates(data: Partial<Record<string, string>>, keys: string[]) {
  const blocks: CertificateBlock[] = [];
  const pems: string[] = [];

  for (const key of keys) {
    const value = data[key];

    if (!value?.startsWith(BASE64_PEM_PREFIX)) {
      continue;
    }

    const decoded = decodeBase64(value);

    if (decoded === undefined) {
      continue;
    }

    extractCertificatesFromPEM(decoded).forEach((pem, index) => {
      blocks.push({ key, index });
      pems.push(pem);
    });
  }

  return { blocks, pems };
}

export interface SecretDetailsProps extends Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.Secret> {
  describeCertificates: DescribeCertificates;
}

export function SecretDetails({ object, describeCertificates }: SecretDetailsProps) {
  const [certificates, setCertificates] = React.useState<DescribedCertificate[]>([]);

  React.useEffect(() => {
    // Set when the object changes or the panel closes before main answers.
    let stale = false;
    const { blocks, pems } = object?.data ? findCertificates(object.data, object.getKeys()) : { blocks: [], pems: [] };

    setCertificates([]);

    if (pems.length === 0) {
      return;
    }

    describeCertificates(pems)
      .then((infos) => {
        if (stale) return;

        setCertificates(
          blocks.flatMap((block, i) => {
            const info = infos[i];
            return info ? [{ ...block, info }] : [];
          }),
        );
      })
      .catch((error: unknown) => {
        // The error names no certificate content, only what failed.
        Common.logger.error(`[lens-certificate-info]: cannot describe certificates: ${error}`);
      });

    return () => {
      stale = true;
    };
  }, [object, describeCertificates]);

  if (certificates.length === 0) {
    return null;
  }

  return (
    <div>
      {certificates.map(({ key, index, info: cert }) => (
        <div key={`${key}-${index}`}>
          <Renderer.Component.DrawerTitle>
            Certificate Info - {key} ({index + 1})
          </Renderer.Component.DrawerTitle>
          <Renderer.Component.DrawerItem name="Subject">{cert.subject}</Renderer.Component.DrawerItem>
          <Renderer.Component.DrawerItem name="SAN">{formatSAN(cert.subjectAltName)}</Renderer.Component.DrawerItem>
          <Renderer.Component.DrawerItem name="Key Type">{cert.keyType}</Renderer.Component.DrawerItem>
          <Renderer.Component.DrawerItem name="Serial Number">{cert.serialNumber}</Renderer.Component.DrawerItem>
          <Renderer.Component.DrawerItem name="Issuer">
            {formatIssuer(cert.issuer, cert.selfSigned)}
          </Renderer.Component.DrawerItem>
          <Renderer.Component.DrawerItem name="Not before">
            {formatNotBefore(cert.validFrom)}
          </Renderer.Component.DrawerItem>
          <Renderer.Component.DrawerItem name="Expires">{formatExpireDate(cert.validTo)}</Renderer.Component.DrawerItem>
        </div>
      ))}
    </div>
  );
}
