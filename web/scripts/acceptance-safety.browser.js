// Playwright MCP browser_run_code_unsafe filename entry point.
// Start the configured local Vite app on port 5174. All financial boundaries are
// replaced in an isolated context: no actual wallet prompt or chain write occurs.
async (page) => {
  const context = await page.context().browser().newContext();
  const results = [];
  const check = (name, ok) => {
    if (!ok) throw new Error('Safety acceptance failed: ' + name);
    results.push({ name, result: 'PASS' });
  };
  await context.addInitScript(() => {
    window.__safety = { account: '0x1111111111111111111111111111111111111111', chain: '0x190f1ca9', approvals: 0, settlements: 0, balance: '10000000', allowance: '0', mode: 'delayed', verification: 'unknown', calls: [] };
    const listeners = {};
    window.ethereum = {
      isMetaMask: true,
      request: async ({ method }) => {
        window.__safety.calls.push(method);
        if (method === 'eth_chainId') return window.__safety.chain;
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [window.__safety.account];
        throw new Error('No signing or sending is permitted: ' + method);
      },
      on: (event, fn) => (listeners[event] ??= []).push(fn),
      removeListener: (event, fn) => { listeners[event] = (listeners[event] || []).filter(f => f !== fn); },
    };
    window.__emitSafety = (event, value) => (listeners[event] || []).slice().forEach(fn => fn(value));
  });
  await context.route('https://test-evm-rpc-v3.portaldot.dev/**', route => route.abort());
  await context.route('**/src/chain.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    const s = () => window.__safety;
    export const batchRead = {};
    export const read = {};
    export async function connect(provider) { return { wallet: {}, provider, address: (await provider.request({ method: 'eth_requestAccounts' }))[0] }; }
    export async function restoreWallet(provider, address) { return {wallet:{},provider,address}; }
    export async function assertActiveWallet(wallet, expected, provider) {
      const [current] = await provider.request({ method: 'eth_accounts' });
      if (current !== expected || await provider.request({ method: 'eth_chainId' }) !== '0x190f1ca9') throw new Error('Wallet changed');
    }
    export async function readWallet() {
      if (s().delayBalance) await new Promise(resolve => { window.__resolveMockBalance = resolve; });
      return { configured: true, balance: BigInt(s().balance), allowance: BigInt(s().allowance) };
    }
    export async function checkAlreadySettled() { return []; }
    export async function preflightRecipients(payer, items) { return { ready: true, checks: items.map(i => ({ invoice: String(i.invoice), recipient: i.recipient, status: 'ready' })) }; }
    export async function preflightWholeBatch() { return 100000n; }
    export async function approveExactAmount(wallet, total) {
      s().approvals++;
      return { hash: '0x'+'b'.repeat(64), wait: async () => { s().allowance=String(total); return {status:1}; } };
    }
    export async function sendBatch() {
      s().settlements++;
      if(s().mode==='timeout') throw new Error('Mock wallet timeout, broadcast unknown');
      if(s().mode==='reject') throw Object.assign(new Error('Mock user rejected'),{code:4001});
      return await new Promise(resolve => { window.__resolveMockSettlement = resolve; });
    }
    export async function verifySettlement() { return { status: s().verification, reason: 'Synthetic acceptance evidence: '+s().verification }; }
    export async function recoverHistoricalSettlement() { throw new Error('Not used in this boundary test'); }
  ` }));
  const p = await context.newPage();
  const hash = '0x' + 'a'.repeat(64);
  const prepare = async () => {
    // A real document navigation resets in-memory state between fixtures.
    await p.goto('about:blank');
    await p.goto('http://127.0.0.1:5174/app.html#pay');
    await p.waitForFunction(() => !document.querySelector('#review').disabled);
    if (await p.locator('#connect').isVisible()) {
      await p.locator('#connect').click();
      await p.getByRole('button', { name: 'MetaMask (browser)', exact: true }).click();
      await p.waitForFunction(() => !document.querySelector('#wallet-menu').hidden);
    }
    await p.locator('#setlora-invoice-0').fill('4501');
    await p.locator('#setlora-recipient-0').fill('0x3333333333333333333333333333333333333333');
    await p.locator('#setlora-amount-0').fill('0.45');
    await p.locator('#review').click();
    await p.waitForFunction(() => !document.querySelector('#review').disabled);
  };
  try {
    await prepare();
    await p.locator('#approve').click();
    await p.waitForFunction(() => !document.querySelector('#review').disabled);
    check('Approval boundary is separate from settlement', await p.evaluate(() => window.__safety.approvals === 1 && window.__safety.settlements === 0));
    check('Approval alone creates no paid record', await p.evaluate(() => localStorage.getItem('setlora:pending:v2') === null));
    check('Approval enables a separate explicit settlement action', !await p.locator('#settle').isDisabled());
    await p.locator('#settle').evaluate(button => { button.click(); button.click(); });
    await p.waitForFunction(() => !!window.__resolveMockSettlement);
    check('Signing snapshot persisted before boundary returns', await p.evaluate(() => JSON.parse(localStorage.getItem('setlora:pending:v2')).status === 'signing'));
    check('Rapid duplicate clicks call settlement boundary once', await p.evaluate(() => window.__safety.settlements === 1));
    check('Pending boundary disables approval and settlement', await p.locator('#settle').isDisabled() && await p.locator('#approve').isDisabled());
    await p.evaluate(hash => window.__resolveMockSettlement({ hash }), hash);
    await p.waitForFunction(() => !document.querySelector('#review').disabled);
    check('Unverified broadcast stays unknown', await p.evaluate(() => JSON.parse(localStorage.getItem('setlora:pending:v2')).status === 'unknown'));
    check('Unknown cannot export a verified receipt', await p.locator('#export-receipt').isDisabled());
    await p.reload();
    await p.waitForFunction(() => !document.querySelector('#review').disabled);
    check('Unknown survives refresh and blocks settlement', await p.evaluate(() => JSON.parse(localStorage.getItem('setlora:pending:v2')).status === 'unknown') && await p.locator('#settle').isDisabled());
    check('Recovery/reload never invokes a replacement settlement', await p.evaluate(() => window.__safety.settlements === 0));

    await p.evaluate(() => { location.hash = '#details'; window.__safety.verification = 'failed'; });
    await p.locator('#check-tx').click();
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('setlora:pending:v2')).status === 'failed');
    check('Failed verification never offers a successful receipt', await p.locator('#export-receipt').isDisabled());
    await p.evaluate(() => window.__safety.verification = 'mismatch');
    await p.locator('#check-tx').click();
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('setlora:pending:v2')).status === 'mismatch');
    check('Mismatched verification blocks further settlement', await p.locator('#settle').isDisabled() && await p.locator('#export-receipt').isDisabled());

    // Clear only this isolated test fixture, then exercise a hashless timeout.
    await p.evaluate(() => localStorage.removeItem('setlora:pending:v2'));
    await prepare();
    await p.locator('#approve').click();
    await p.waitForFunction(() => !document.querySelector('#review').disabled);
    await p.evaluate(() => window.__safety.mode = 'timeout');
    await p.locator('#settle').click();
    await p.waitForFunction(() => !document.querySelector('#review').disabled);
    check('Wallet timeout persists hashless unknown state', await p.evaluate(() => { const r=JSON.parse(localStorage.getItem('setlora:pending:v2')); return r.status==='unknown' && r.hash===null; }));
    check('Hashless unknown blocks resubmission', await p.locator('#settle').isDisabled());

    await p.evaluate(() => localStorage.removeItem('setlora:pending:v2'));
    await prepare();
    await p.locator('#approve').click();
    await p.waitForFunction(() => !document.querySelector('#review').disabled);
    await p.evaluate(() => window.__safety.mode = 'reject');
    await p.locator('#settle').click();
    await p.waitForFunction(() => !document.querySelector('#review').disabled);
    check('Explicit rejection creates no fake successful/pending record', await p.evaluate(() => localStorage.getItem('setlora:pending:v2')===null));
    check('Rejected batch must be reviewed again', await p.locator('#settle').isDisabled() && await p.locator('#approve').isDisabled());
    for (const event of ['accountsChanged', 'chainChanged']) {
      await prepare();
      await p.evaluate(() => { location.hash = '#pay'; window.__safety.delayBalance = true; });
      await p.locator('#review').click();
      await p.waitForFunction(() => !!window.__resolveMockBalance);
      await p.evaluate(event => {
        if (event === 'accountsChanged') {
          window.__safety.account = '0x2222222222222222222222222222222222222222';
          window.__emitSafety(event, [window.__safety.account]);
        } else {
          window.__safety.chain = '0x1';
          window.__emitSafety(event, '0x1');
        }
        window.__safety.delayBalance = false;
        window.__resolveMockBalance();
      }, event);
      await p.waitForFunction(() => !document.querySelector('#review').disabled);
      check(event + ' during delayed review invalidates authorization', await p.locator('#settle').isDisabled() && await p.locator('#approve').isDisabled() && await p.locator('#wallet-menu').isHidden());
      check(event + ' cannot restore stale balances', await p.locator('#balance').innerText() === '—');
    }
    check('No real signing or send methods requested', await p.evaluate(() => !window.__safety.calls.some(m => /sign|send/i.test(m))));
    return results;
  } finally {
    await context.close();
  }
}
