import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://setlora.pages.dev',
  base: '/docs',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Setlora Docs',
      description: 'Guides for invoice-linked testnet batch payments and verifiable receipts',
      sidebar: [
        { label: '← Back to Setlora', link: 'https://setlora.pages.dev/' },
        { label: 'Getting started', items: [
          { slug: 'index' },
          { slug: 'getting-started' },
          { slug: 'how-to-test' },
        ] },
        { label: 'Use Setlora', items: [
          { slug: 'send-payments' },
          { slug: 'verify-payment' },
          { slug: 'check-recipient' },
          { slug: 'wallets-and-testnet' },
        ] },
        { label: 'Reference', items: [
          { slug: 'troubleshooting' },
          { slug: 'security-and-limitations' },
        ] },
      ],
      customCss: ['./src/styles/custom.css'],
      editLink: {
        baseUrl: 'https://github.com/Alike001/setlora/edit/main/docs-site/',
      },
    }),
  ],
});
