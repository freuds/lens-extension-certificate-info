# AGENTS.md

## Project Overview

This repository contains `lens-certificate-info`, a Freelens extension that adds certificate metadata to Kubernetes Secret detail views.

When a user opens a `Secret` in Freelens, the renderer extension scans the Secret data keys for base64-encoded PEM documents, decodes them and extracts their `CERTIFICATE` blocks. The main extension parses each block with Node.js `crypto.X509Certificate`, and the renderer renders details such as subject, SANs, issuer, serial number, public key type, validity start, and expiry. Expired certificates are highlighted in red, and self-signed certificates are detected by verifying the certificate with its own public key.

The current implementation supports PEM certificate blocks stored in Secret data. The README notes that other formats, such as Java Keystore or PKCS#12, are not supported yet.

This project targets the Freelens 2 extension API (`engines.freelens: ^2.0.0`). The reference for it is `docs/extensions/migrating-from-v1.md` and `docs/extensions/api.md` in freelensapp/freelens, and the template freelensapp/freelens-example-extension, whose tooling this repository follows. Older OpenLens/Lens compatibility may appear in repository history or package metadata, but do not assume current Lens compatibility. Freelens is a fork and is no longer API-compatible with Lens.

## Repository Layout

- `src/common/certificates.ts` holds what both processes share: the `CertificateInfo` type, the IPC channel name and the extraction of `CERTIFICATE` blocks from a PEM document.
- `src/main/index.ts` defines the main-process extension class, which answers the `describe-certificates` IPC call.
- `src/main/describe-certificate.ts` parses certificate blocks with `node:crypto`.
- `src/renderer/index.tsx` registers renderer-side extension contributions.
- `src/renderer/certificate-ipc.ts` is the renderer side of the IPC call.
- `src/renderer/components/secret-details.tsx` decodes the Secret, formats the certificate metadata and renders the drawer content.
- `src/renderer/components/error-boundary.tsx` and `error-page.tsx` come from the template and keep a rendering error inside the details panel.
- `test/freelens-extensions.ts` is a Vitest stub for the host-provided `@freelensapp/extensions` runtime API.
- `examples/test/secret.yaml` is the test fixture used by unit tests.
- `vite.config.mjs` builds the renderer (`vite build`) and the main entry (`vite build --mode main`) into `dist/`.
- `environment-tests/` proves that each tsconfig rejects the APIs its runtime does not have.

## Freelens Extension API

Freelens extensions are packaged Node/Electron modules. This package declares two compiled entrypoints in `package.json`:

- `main`: `dist/main.js`, an ES module run by Node in the main process
- `renderer`: `dist/renderer.js`, an ES module loaded by URL in a browser page, with `dist/renderer.css` next to it

The Freelens host loads these entrypoints and expects each one to export a class derived from the appropriate extension base class from `@freelensapp/extensions`.

There is no separate `extension.json` manifest. Extension metadata, entrypoints, compatible `engines.freelens`, compatible Node.js version, scripts, and dependencies are handled through `package.json`.

All package dependencies for this extension should be declared in `devDependencies`. Freelens extensions are built and bundled ahead of time and do not load their own `node_modules` at runtime. Modules externalized by the Vite config are provided by the Freelens application, must remain external, and should use versions compatible with the Freelens app.

### Main Extension

`src/main/index.ts` exports:

a class extending `Main.LensExtension`. Its `onActivate` registers the `describe-certificates` handler on a `Main.Ipc` subclass; the host removes it when the extension is disabled or reloaded. The handler validates its argument, since it comes over IPC, and returns one `CertificateInfo | null` per PEM block.

### Renderer Extension

`src/renderer/index.tsx` exports a class extending `Renderer.LensExtension`.

Renderer extensions contribute UI to the Freelens renderer process. In this project, the extension contributes a Kubernetes object detail item:

```tsx
kubeObjectDetailItems: Renderer.LensExtension["kubeObjectDetailItems"] = [
  Renderer.K8sApi.detailsFor(Renderer.K8sApi.Secret, {
    priority: 10,
    Details: (props) => <SecretDetails {...props} describeCertificates={describeCertificates} />,
  }),
].map((registration) => withDetailsErrorBoundary(this, registration));
```

`Renderer.K8sApi.detailsFor` takes `kind` and `apiVersions` from the model class and types `Details` for it. Every registration goes through `withDetailsErrorBoundary`, because the host has no error boundary around the details drawer. The renderer's `onActivate` creates the `Renderer.Ipc` instance that `describeCertificates` uses; the component receives the function as a prop, so tests pass the main-process parser directly.

The `Details` component receives `Renderer.Component.KubeObjectDetailsProps<T>`. Here `T` is `Renderer.K8sApi.Secret`, so `props.object` is the Secret object supplied by Freelens. The current component uses `object.data` for base64 Secret values and `object.getKeys()` to iterate Secret keys.

Use `Renderer.Component.DrawerTitle` and `Renderer.Component.DrawerItem` for content inside the object details drawer so the UI stays consistent with Freelens.

Renderer code gets no Node and no Electron in Freelens 2: no builtin import, no `Buffer`, no `process`, no `require()`. The renderer build fails on a builtin import, `src/renderer/tsconfig.json` has no Node types, and Biome's `noNodejsModules` flags imports in `src/renderer/` and `src/common/`. Node work, such as X.509 parsing, goes to main behind `Ipc`. Only `CERTIFICATE` blocks are sent to main, never the rest of a Secret, which may hold a private key.

Main-process code runs in the Node/Electron main context. Put main-process behavior in `src/main/` and keep JSX/UI imports out of main modules.

## Runtime Module Boundary

`@freelensapp/extensions` is a thin shim that reads `globalThis.FreelensExtensionApi`, which the host sets in each process; the bundle inlines it. Unit tests cannot import it, because there is no host, so `vitest.config.ts` aliases it to `test/freelens-extensions.ts`.

React, React DOM, `react/jsx-runtime`, MobX and mobx-react are the host's instances: `build/vite-plugin-host-modules.mjs` rewrites their imports to properties of `globalThis.FreelensExtensionApi` (main gets mobx only). Keep them as `devDependencies` pinned to the versions the host runs; a second copy of React throws "invalid hook call", a second copy of mobx fails silently.

If new assets are needed by the extension, import them from TypeScript/TSX so Vite includes them in `dist/main.js` or `dist/renderer.js`. Do not rely on loading loose files from the installed package at runtime.

Prefer CSS Modules for new styles. If global CSS is unavoidable, use extension-specific class prefixes to avoid collisions with Freelens or other extensions. Do not add Windtail/Tailwind runtime styling to the extension.

## Build And Test Commands

Use pnpm, at the version of `packageManager` in `package.json`, and the Node version of `.nvmrc` (`mise.toml` pins both Node and the other tools).

- `pnpm type:check`: type-check main, renderer, tests, tooling and the environment tests, one program each.
- `pnpm test:unit`: run Vitest unit tests.
- `pnpm lint:check`: run Biome checks.
- `pnpm build`: build `dist/renderer.js`, `dist/renderer.css` and `dist/main.js`.
- `pnpm dev`: rebuild both entry points in watch mode; Freelens reloads an extension installed from this directory.
- `pnpm knip:check`: check dependency and file usage (run `pnpm build` first).
- `pnpm update-example-configs`: pull the shared tooling files from freelensapp/freelens-example-extension (`--dry-run` to preview).

For normal code changes, prefer at least:

```sh
pnpm type:check
pnpm test:unit
pnpm lint:check
```

## Development Notes For Agents

- Keep renderer UI additions inside `src/renderer/`; keep main-process behavior inside `src/main/`.
- Keep both entry points ESM; `main` must stay ESM for the development reload to work.
- Keep the host-provided modules mapped by `hostModules`, and never bundle a copy of React or mobx.
- Do not use current Lens API documentation as a source for Freelens extension behavior. Prefer the Freelens extension wiki, the installed `@freelensapp/extensions` types/source, the Freelens example extension, and this repository's working code. If consulting old Lens API docs, treat them only as historical Lens 5.5.4 reference material where Freelens documentation explicitly points there.
- When adding new Extension API surface to tests, extend `test/freelens-extensions.ts` only with the minimal host API required by the test.
- Secret values are base64-encoded Kubernetes data. Decode before parsing certificate content.
- Avoid logging Secret contents or decoded certificate payloads. Certificate metadata is acceptable, but Secret data may contain private keys or tokens.
- Existing formatting uses Biome with 2-space indentation, double quotes, semicolons, and 120-column line width.
- Do not modify generated build output unless the task specifically requires it.
- After enabling or installing the extension locally, check both the Freelens main-process terminal output and the renderer developer console for startup errors.
