// Run with the Playwright MCP browser_run_code_unsafe tool, using this filename.
// Start web with `npm run dev -- --port 5174 --strictPort` first.
// Uses an isolated context, no wallet, and no chain access or transactions.
async (page) => {
  const context = await page.context().browser().newContext();
  const results = [];
  const check = (name, condition) => {
    if (!condition) throw new Error('Acceptance regression failed: ' + name);
    results.push({ name, result: 'PASS' });
  };
  await context.route('https://test-evm-rpc-v3.portaldot.dev/**', route => route.abort());
  const p = await context.newPage();
  try {
    await p.goto('http://127.0.0.1:5174/app.html#pay');
    await p.locator('#setlora-invoice-0').fill('4401');
    await p.locator('#setlora-recipient-0').fill('0x3333333333333333333333333333333333333333');
    await p.locator('#setlora-amount-0').fill('0.1');
    await p.locator('#review').click();
    check('Disconnected review opens wallet picker', await p.locator('#wallet-picker').evaluate(e => e.open));
    check('Missing wallet is explained', (await p.locator('#wallet-choices').innerText()).includes('No EVM wallet detected'));
    check('No wallet means no approval or settlement', await p.locator('#approve').isDisabled() && await p.locator('#settle').isDisabled());
    await p.locator('#close-wallet-picker').click();

    await p.locator('#add').focus();
    await p.keyboard.press('Shift+Tab');
    check('CSV import participates in keyboard tab order', await p.locator('#import-csv').evaluate(e => e === document.activeElement));
    const [chooser] = await Promise.all([
      p.waitForEvent('filechooser'),
      p.keyboard.press('Enter'),
    ]);
    await chooser.setFiles({ name: 'valid.csv', mimeType: 'text/csv', buffer: Buffer.from('invoice,recipient,amount\n4401,0x3333333333333333333333333333333333333333,0.100001') });
    check('Keyboard CSV import populates exact amount', await p.locator('#setlora-amount-0').inputValue() === '0.100001');
    for (const [name, csv] of [
      ['Ambiguous quotes rejected without replacing entries', 'invoice,recipient,amount\n4401,alice,0".1"'],
      ['Duplicate columns rejected without replacing recipient', 'invoice,recipient,recipient,amount\n4401,alice,bob,0.2'],
    ]) {
      await p.locator('#csvfile').setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      check(name, await p.locator('#prepare-feedback').evaluate(e => e.classList.contains('danger'))
        && await p.locator('#setlora-recipient-0').inputValue() === '0x3333333333333333333333333333333333333333'
        && await p.locator('#setlora-amount-0').inputValue() === '0.100001');
    }
    return results;
  } finally {
    await context.close();
  }
}
