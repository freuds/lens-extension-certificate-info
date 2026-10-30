import { Renderer } from "@freelensapp/extensions";
import { CertificateIpc, describeCertificates } from "./certificate-ipc";
import { withDetailsErrorBoundary } from "./components/error-boundary";
import { SecretDetails } from "./components/secret-details";

export default class CertificateInfoExtensionRenderer extends Renderer.LensExtension {
  onActivate() {
    CertificateIpc.createInstance(this);
  }

  // The details panel renders inside an error boundary: the host has none
  // around the details drawer, so an error would replace the whole cluster view.
  kubeObjectDetailItems: Renderer.LensExtension["kubeObjectDetailItems"] = [
    Renderer.K8sApi.detailsFor(Renderer.K8sApi.Secret, {
      priority: 10,
      Details: (props) => <SecretDetails {...props} describeCertificates={describeCertificates} />,
    }),
  ].map((registration) => withDetailsErrorBoundary(this, registration));
}
