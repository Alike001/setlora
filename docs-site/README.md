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

Before changing Cloudflare Pages build settings, inspect the **actual Astro output tree** after `npm run build` and the existing Pages build command/root directory. Combine the generated docs with the existing Vite output in the same final publication directory, ensuring Astro-generated assets retain their `/docs/` paths. Test both `/app` and `/docs/` through a Cloudflare preview deployment.

**Do not simply change the existing Cloudflare output directory to `docs-site/dist`**—that would remove the payment app from the published site.

The documentation is source-only here; it has not been built on the user's machine. No payment logic has been modified.

## Add links to the main site after verification

- Landing header: **Docs** linking to `/docs/`.
- New payment: help link to `/docs/send-payments/`.
- Public verifier: help link to `/docs/verify-payment/`.
- Recipient checker: help link to `/docs/check-recipient/`.
- README: **Documentation** linking to `https://setlora.pages.dev/docs/` once deployed.

Keep `README.md`'s `How to test` section at the top. If it still says public verification is only planned, update that outdated line after checking the deployed verifier.
