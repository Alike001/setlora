# Setlora Documentation (MDX / Starlight)

This is a standalone Astro Starlight docs project for Setlora. It **does not replace** the Vite payment app and should not be deployed over the main website until its links/build are verified.

## Preview locally

From the Setlora repository root (after copying in `docs-site/`):

```sh
cd docs-site
npm install
npm run check:content
npm run dev
```

Open `http://127.0.0.1:4321/docs/`.

To build: `npm run build` (output: `docs-site/dist/`).

## Hosting alongside the existing Vite site

Astro is configured with `base: '/docs'` and `site: 'https://setlora.pages.dev'`.
Keep the existing Vite site at `/` and the docs at `/docs/`.

A combined site build is available from `web/` via `npm run build:site`. It installs locked Astro dependencies, builds the MDX docs with the `/docs/` base, builds the Vite web app, and copies the generated docs into `web/dist/docs/`. Both products share one publication directory while keeping the existing application entrypoints.

For the existing Cloudflare Pages project with root directory `web`, use build command `npm run build:site` and output directory `dist` (or `web/dist` if paths are repo-root relative). Confirm the actual root and build configuration before changing it. Preserve the current `VITE_SETLORA_CONTRACT_ADDRESS` environment setting. Test `/`, `/app`, `/proof`, `/native`, `/docs/`, and `/docs/how-to-test/` on a preview deployment before making the change live.

**Do not simply change the existing Cloudflare output directory to `docs-site/dist`**—that would remove the payment app from the published site.

The docs are not public until the combined build is deployed on Cloudflare Pages. No wallet, transaction or contract logic is modified by this change.

## Navigation links to documentation

- Landing header and footer: **Docs** linking to `/docs/`.
- New payment and payment review: help links to `/docs/send-payments/`.
- Public verifier: help link to `/docs/verify-payment/`.
- Recipient checker: help link to `/docs/check-recipient/`.
- README: **Documentation** linking to `https://setlora.pages.dev/docs/` once deployed.

Keep `README.md`'s `How to test` section at the top. If it still says public verification is only planned, update that outdated line after checking the deployed verifier.
