import { Renderer } from "@freelensapp/extensions";
import { describeCertificatesChannel } from "../common/certificates";

import type { CertificateInfo } from "../common/certificates";

export class CertificateIpc extends Renderer.Ipc {}

export type DescribeCertificates = (pems: string[]) => Promise<(CertificateInfo | null)[]>;

/**
 * Parses PEM certificate blocks in the main process, which has `node:crypto`.
 * `CertificateIpc` is created in the renderer extension's `onActivate`.
 */
export const describeCertificates: DescribeCertificates = (pems) =>
  CertificateIpc.getInstance().invoke(describeCertificatesChannel, pems);
