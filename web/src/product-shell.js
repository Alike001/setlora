// Application structure only. No signing or payment logic.
(() => {
  const main = document.querySelector('#app > main');
  if (!main) return;

  const parts = {
    intro: main.querySelector('.page-intro'),
    network: main.querySelector('.preview-note'),
    steps: main.querySelector('.steps-nav'),
    payment: main.querySelector('.workspace'),
    evidence: main.querySelector('#verification'),
    history: main.querySelector('#payment-history'),
    assurance: main.querySelector('.assurance'),
    footer: main.querySelector('footer')
  };

  if (Object.values(parts).some(node => !node)) {
    console.error('Existing application structure changed.');
    return;
  }

  const shell = document.createElement('div');
  shell.className = 'product-shell';

  shell.innerHTML = `
    <aside class="product-sidebar" aria-label="Workspace navigation">
      <div class="sidebar-brand">setlora
        <span>PAYMENT WORKSPACE</span>
      </div>

      <div class="sidebar-label">PAYMENTS</div>
      <nav class="sidebar-nav">
        <a href="#overview" data-view="overview">Overview</a>
        <a href="#pay" data-view="pay">New payment</a>
        <a href="#history" data-view="history">Payment history</a>
      </nav>

      <div class="sidebar-label">TOOLS</div>
      <nav class="sidebar-nav">
        <a href="/proof.html">Verify a payment</a>
        <a href="/native.html">Check a recipient</a>
        <a href="/docs/">Documentation</a>
      </nav>

      <div class="sidebar-bottom">
        <span class="sidebar-dot"></span>
        Portaldot V3 Testnet
        <small>Testnet only · Unaudited</small>
      </div>
    </aside>

    <nav class="mobile-workspace-nav" aria-label="Mobile workspace navigation">
      <a href="#overview" data-view="overview">Overview</a>
      <a href="#pay" data-view="pay">New payment</a>
      <a href="#history" data-view="history">History</a>
      <a href="/proof.html">Verify payment</a>
      <a href="/native.html">Check recipient</a>
      <a href="/docs/">Docs</a>
    </nav>
    <div class="product-content">
      <div class="product-topline">
        <span>Workspace / <strong id="active-section">Overview</strong></span>
        <span class="product-context">Self-custodial payments · <a href="/docs/how-to-test/">How to test</a></span>
      </div>

      <div id="product-network"></div>

      <section class="product-pane overview-pane"
        data-pane="overview">
        <div class="overview-heading">
          <div class="eyebrow">YOUR WORKSPACE</div>
          <h1>Your payments, in one place.</h1>
          <p>Manage invoice-linked payouts, review settlement
          evidence and revisit previous payments.</p>
        </div>

        <div class="overview-actions">
          <a href="#pay" data-view="pay"
            class="overview-action primary-action">
            <span>01 / PAYMENTS</span>
            <strong>Send payments</strong>
            <small>Create a batch, check recipients and authorize
            payment using your wallet.</small>
            <b aria-hidden="true">↗</b>
          </a>

          <a href="/proof.html" class="overview-action">
            <span>02 / VERIFICATION</span>
            <strong>Verify a payment</strong>
            <small>Examine a real transaction without
            connecting a wallet.</small>
            <b aria-hidden="true">↗</b>
          </a>

          <a href="/native.html" class="overview-action">
            <span>03 / RECIPIENTS</span>
            <strong>Check a recipient</strong>
            <small>Inspect native pUSD account information
            before paying.</small>
            <b aria-hidden="true">↗</b>
          </a>
        </div>

        <div class="overview-bottom">
          <article>
            <div class="eyebrow">VERIFIED TESTNET EXAMPLE</div>
            <h2>0.45 pUSD · 3 recipients</h2>
            <p>Explore the recorded settlement using its
            blockchain receipt and invoice events.</p>
            <a href="/proof.html?tx=0x0ea4730fc73f3842a80f3015ee682ffa2bc0c5312fccf272d9899ee3ec1e3c16">
              View verified example ↗
            </a>
          </article>
          <article>
            <div class="eyebrow">YOUR ACTIVITY</div>
            <h2>Payment history</h2>
            <p>Recheck payments recorded for your connected
            wallet, network and browser.</p>
            <a href="#history" data-view="history">
              Open payment history ↗
            </a>
          </article>
        </div>
        <div id="overview-assurance"></div>
      </section>

      <section class="product-pane" data-pane="pay" hidden>
        <div id="payment-flow"></div>
        <div id="prepare-feedback" class="message muted" role="status" aria-live="polite"></div>
        <p class="product-guide-link"><a href="/docs/send-payments/">How to prepare and send payments ↗</a></p>
      </section>

      <section class="product-pane payment-review-pane" data-pane="review" hidden>
        <div class="review-page-heading">
          <div class="eyebrow">STEP 02 / REVIEW & AUTHORIZE</div>
          <h1>Review your payment.</h1>
          <p>Check every recipient, the total, and wallet requirements before authorizing a transaction.</p>
        </div>
        <div id="review-panel"></div>
        <p class="product-guide-link"><a href="/docs/send-payments/">Understand approval and settlement ↗</a></p>
        <div class="review-return-actions">
          <a href="#pay" data-view="pay" class="button subtle">← Edit batch</a>
          <a href="#details" data-view="details" class="review-evidence-link">Check previous payment evidence ↗</a>
        </div>
      </section>

      <section class="product-pane" data-pane="history" hidden>
        <div class="view-heading">
          <div class="eyebrow">YOUR RECORDS</div>
          <h1>Payment history</h1>
          <p>Review saved payment records and recheck their
          blockchain evidence.</p>
        </div>
        <div id="history-view"></div>
      </section>

      <section class="product-pane" data-pane="details" hidden>
        <div class="view-heading">
          <div class="eyebrow">ON-CHAIN EVIDENCE</div>
          <h1>Payment details</h1>
          <p>Inspect settlement evidence or verify a previous
          payment without sending another transaction.</p>
        </div>
        <div id="details-view"></div>
      </section>

      <div id="product-footer"></div>
    </div>
  `;

  shell.querySelector('#product-network').append(parts.network);
  shell.querySelector('#payment-flow').append(
    parts.intro, parts.steps, parts.payment
  );
  // Move the existing summary, including the real approval and settlement buttons.
  // DOM elements retain their IDs and existing event listeners.
  const actualSummary = parts.payment.querySelector('.summary');
  if (!actualSummary) throw new Error('Setlora summary not found.');
  shell.querySelector('#review-panel').append(actualSummary);
  shell.querySelector('#history-view').append(parts.history);
  shell.querySelector('#details-view').append(parts.evidence);
  // These contextual cards make the records screens useful even when the
  // browser has no saved payments. They never claim or synthesize activity.
  const recordPanel = shell.querySelector('#history-view #payment-history');
  recordPanel.removeAttribute('aria-labelledby');
  recordPanel.setAttribute('aria-label', 'Wallet-scoped payment records');
  const historyGuide = document.createElement('aside');
  historyGuide.className = 'records-guide';
  historyGuide.setAttribute('aria-label', 'Payment history guidance');
  historyGuide.innerHTML = `
    <div class="records-guide-icon" aria-hidden="true">↗</div>
    <div class="records-guide-kicker">NEED AN OLDER PAYMENT?</div>
    <h2>Verify without a wallet</h2>
    <p>History is saved for the connected payer on this website and device. Records from another browser or local address do not automatically appear here. Use a transaction hash to verify them.</p>
    <a class="records-guide-link" href="/proof.html">Open payment verifier <span aria-hidden="true">↗</span></a>
    <div class="records-guide-separator"></div>
    <div class="records-guide-kicker">REAL TESTNET EVIDENCE</div>
    <p>Explore the verified 0.45 pUSD, three-invoice example without signing or transferring funds.</p>
    <a class="records-guide-text-link" href="/proof.html?tx=0x0ea4730fc73f3842a80f3015ee682ffa2bc0c5312fccf272d9899ee3ec1e3c16">View recorded example ↗</a>
  `;
  shell.querySelector('#history-view').append(historyGuide);
  const detailsGuide = document.createElement('aside');
  detailsGuide.className = 'records-guide';
  detailsGuide.setAttribute('aria-label', 'Verification guidance');
  detailsGuide.innerHTML = `
    <div class="records-guide-icon" aria-hidden="true">✓</div>
    <div class="records-guide-kicker">HOW VERIFICATION WORKS</div>
    <h2>Evidence, not screenshots</h2>
    <p>Setlora checks the blockchain receipt, the exact invoice events, batch total and payer-specific settlement flags before marking a payment confirmed.</p>
    <div class="records-guide-separator"></div>
    <div class="records-guide-kicker">VERIFY ANOTHER PAYMENT</div>
    <p>Your wallet is used for payer-specific recovery here. The public verifier lets anyone check a Setlora transaction hash without connecting a wallet.</p>
    <a class="records-guide-link" href="/proof.html">Verify by transaction hash <span aria-hidden="true">↗</span></a>
  `;
  shell.querySelector('#details-view').append(detailsGuide);
  shell.querySelector('#overview-assurance').append(parts.assurance);
  shell.querySelector('#product-footer').append(parts.footer);

  main.replaceChildren(shell);
  document.body.classList.add('product-redesign');

  const names = {
    overview: 'Overview',
    pay: 'New payment',
    review: 'Review payment',
    history: 'Payment history',
    details: 'Payment details'
  };

  function showView() {
    const hash = location.hash.slice(1);
    const view = Object.hasOwn(names, hash) ? hash : 'overview';

    shell.querySelectorAll('[data-pane]').forEach(section => {
      section.hidden = section.dataset.pane !== view;
    });

    shell.querySelectorAll('a[data-view]').forEach(link => {
      if (link.dataset.view === view || (view === 'review' && link.dataset.view === 'pay')) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    shell.querySelector('#active-section').textContent = names[view];
    document.title = names[view] + ' · Setlora';
  }

  shell.addEventListener('click', event => {
    const link = event.target.closest('a[data-view]');
    if (!link) return;
    if (location.hash === '#' + link.dataset.view) showView();
    window.scrollTo(0, 0);
  });

  window.addEventListener('hashchange', showView);
  showView();
})();
