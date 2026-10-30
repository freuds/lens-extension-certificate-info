import { Main } from "@freelensapp/extensions";
import { describeCertificatesChannel } from "../common/certificates";
import { describeCertificates } from "./describe-certificate";

class CertificateIpc extends Main.Ipc {}

export default class CertificateInfoMainExtension extends Main.LensExtension {
  onActivate() {
    // The host removes the handler when the extension is disabled or reloaded.
    CertificateIpc.createInstance(this).handle(describeCertificatesChannel, (_event, pems: unknown) =>
      describeCertificates(pems),
    );
  }
}
