// Playwright MCP function entry point. Start the configured Vite app on 5174.
// Uses the actual chain/network/session modules, synthetic EIP-1193 identities,
// controlled read responses, and read-only HTTP fixtures. Every write is blocked.
async (page) => {
  const context = await page.context().browser().newContext();
  const results = [];
  const check = (name, condition) => {
    if (!condition) throw new Error('Network acceptance failed: ' + name);
    results.push({name, result:'PASS'});
  };
  await context.addInitScript(() => {
    const n = window.__network = { chain: sessionStorage.getItem('test-chain') || '0x190f1ca9', account:'0x1111111111111111111111111111111111111111', calls:[], hold:false, pending:[], listeners:{} };
    window.ethereum = {
      isMetaMask:true,
      request:async ({method}) => {
        n.calls.push(method);
        if (method==='eth_accounts' || method==='eth_requestAccounts') return [n.account];
        if (method==='eth_chainId') {
          if (n.hold) return await new Promise(resolve => n.pending.push(resolve));
          return n.chain;
        }
        if (method==='wallet_revokePermissions') return null;
        throw new Error('Network acceptance forbids '+method);
      },
      on:(event,fn)=>(n.listeners[event]??=new Set()).add(fn),
      removeListener:(event,fn)=>n.listeners[event]?.delete(fn),
    };
    n.emit = (event,value) => [...n.listeners[event]||[]].forEach(fn=>fn(value));
  });
  await context.route('https://test-evm-rpc-v3.portaldot.dev/**', async route => {
    const queries = route.request().postDataJSON();
    const reply = q => {
      let result;
      if(q.method==='eth_getCode') result='0x6000';
      else if(q.method==='eth_chainId') result='0x190f1ca9';
      else if(q.method==='eth_blockNumber') result='0x40000';
      else if(q.method==='eth_getTransactionReceipt'||q.method==='eth_getTransactionByHash') result=null;
      else if(q.method==='eth_call') {
        const selector=q.params[0].data.slice(0,10);
        const value = selector==='0xfc0c546a' ? '00001e6100000000000000000000000000010000'
          : selector==='0x313ce567' ? '6' : selector==='0x70a08231' ? (10000000).toString(16)
          : selector==='0xdd62ed3e' ? (450000).toString(16) : selector==='0xa9059cbb' ? '1' : '0';
        result='0x'+value.padStart(64,'0');
      } else throw new Error('Unexpected RPC '+q.method);
      return {jsonrpc:'2.0',id:q.id,result};
    };
    await route.fulfill({json:Array.isArray(queries)?queries.map(reply):reply(queries)});
  });
  const p=await context.newPage();
  const waitIdle=()=>p.waitForFunction(()=>!document.querySelector('#review').disabled);
  const connect=async()=>{
    await p.locator('#connect').click();
    await p.getByRole('button',{name:'MetaMask (browser)',exact:true}).click();
    await waitIdle();
  };
  try {
    await p.goto('http://127.0.0.1:5174/app.html#pay');
    // Seed only this isolated browser's recovery information, not a real wallet.
    const pending=JSON.stringify({status:'unknown',hash:null,payer:'0x9999999999999999999999999999999999999999',chainId:'420420777',contract:'0x2d17199920251f7eec8a555043c8387194ff5d1b',items:[]});
    await p.evaluate(value=>localStorage.setItem('test-recovery-sentinel',value),pending);
    await connect();
    check('Initial V3 connection uses fresh identity and no network switch', await p.locator('#wallet-menu').isVisible());
    check('One listener per wallet event', await p.evaluate(()=>['chainChanged','accountsChanged','disconnect'].every(event=>window.__network.listeners[event].size===1)));
    await p.locator('#setlora-invoice-0').fill('4701');
    await p.locator('#setlora-recipient-0').fill('0x3333333333333333333333333333333333333333');
    await p.locator('#setlora-amount-0').fill('0.45');
    await p.locator('#review').click(); await waitIdle();
    check('Fresh review enables settlement with sufficient allowance', !await p.locator('#settle').isDisabled());

    // Some providers delay or omit events. The click-time raw check still wins.
    await p.evaluate(()=>window.__network.chain='0x1');
    await p.locator('#settle').click();await waitIdle();
    check('Silent chain change is caught before any settlement request', (await p.locator('#network-status').innerText()).toLowerCase().includes('wrong network')&&await p.locator('#settle').isDisabled()&&await p.evaluate(()=>!window.__network.calls.includes('eth_sendTransaction')));
    await p.evaluate(()=>window.__network.chain='0x190f1ca9');await connect();
    await p.evaluate(()=>location.hash='#pay');await p.locator('#review').click();await waitIdle();

    await p.evaluate(()=>{ const n=window.__network;n.hold=true;n.chain='0x1';n.emit('chainChanged','0x1'); });
    await p.waitForFunction(()=>window.__network.pending.length===1);
    check('Network event immediately invalidates review and payment controls', await p.locator('#approve').isDisabled()&&await p.locator('#settle').isDisabled()&&await p.locator('.review-item').count()===0);
    check('Unresolved network feedback is visible', (await p.locator('#network-status').innerText()).includes('Checking'));
    await p.evaluate(()=>{const n=window.__network;n.chain='0x190f1ca9';n.emit('chainChanged',n.chain);});
    await p.waitForFunction(()=>window.__network.pending.length===2);
    await p.evaluate(()=>window.__network.pending[1]('0x190f1ca9'));
    await p.waitForFunction(()=>document.querySelector('#network-status').textContent.includes('V3 detected'));
    await p.evaluate(()=>window.__network.pending[0]('0x1'));
    check('Older wrong-chain reply cannot override latest V3 feedback', (await p.locator('#network-status').innerText()).includes('V3 detected'));
    check('Return to V3 never revives old review', await p.locator('#settle').isDisabled());
    await p.evaluate(()=>{window.__network.hold=false;window.__network.pending=[];});
    await connect();
    check('Explicit reconnect immediately succeeds after returning to V3', await p.locator('#wallet-menu').isVisible());

    // Genuine wrong-network connection must stay disabled; it never switches.
    await p.evaluate(()=>{const n=window.__network;n.chain='0x1';n.emit('chainChanged','0x1');});
    await p.waitForFunction(()=>document.querySelector('#network-status').textContent.toLowerCase().includes('wrong network'));
    await connect();
    check('Wrong network remains an accurate connection error', (await p.locator('#network-status').innerText()).toLowerCase().includes('wrong network')&&await p.locator('#settle').isDisabled());
    await p.evaluate(()=>window.__network.chain='0x190f1ca9'); await connect();

    // Close account/chain events race with an explicitly held raw network read.
    await p.evaluate(()=>{const n=window.__network;n.hold=true;n.chain='0x1';n.emit('chainChanged','0x1');});
    await p.waitForFunction(()=>window.__network.pending.length===1);
    await p.evaluate(()=>{const n=window.__network;n.account='0x2222222222222222222222222222222222222222';n.emit('accountsChanged',[n.account]);n.chain='0x190f1ca9';n.emit('chainChanged',n.chain);});
    await p.waitForFunction(()=>window.__network.pending.length===3);
    await p.evaluate(()=>window.__network.pending[2]('0x190f1ca9'));
    await p.waitForFunction(()=>document.querySelector('#network-status').textContent.includes('V3 detected'));
    await p.evaluate(()=>{window.__network.pending[0]('0x1');window.__network.pending[1]('0x1');window.__network.hold=false;window.__network.pending=[];});
    await connect();
    check('Account change during checks reconnects the latest account', await p.locator('#wallet-address').getAttribute('title')==='0x2222222222222222222222222222222222222222');
    check('Repeated events do not duplicate listeners', await p.evaluate(()=>window.__network.listeners.chainChanged.size===1));

    // Disconnect invalidates the pending check even if its old reply arrives.
    await p.evaluate(()=>{localStorage.setItem('setlora:pending:v2',localStorage.getItem('test-recovery-sentinel'));const n=window.__network;n.hold=true;n.emit('chainChanged',n.chain);});
    await p.waitForFunction(()=>window.__network.pending.length===1);
    await p.evaluate(()=>window.__network.emit('disconnect',{code:4900}));
    await p.evaluate(()=>{window.__network.pending[0]('0x190f1ca9');window.__network.hold=false;});
    check('Disconnect cannot be undone by a late response', await p.locator('#wallet-menu').isHidden()&&await p.locator('#settle').isDisabled());
    check('Pending recovery information survives network changes and disconnect', await p.evaluate(()=>localStorage.getItem('setlora:pending:v2')===localStorage.getItem('test-recovery-sentinel')));

    // Remember a connection, reload on another chain, and explicitly return.
    await p.evaluate(()=>{window.__network.account='0x1111111111111111111111111111111111111111';});await connect();
    await p.evaluate(()=>sessionStorage.setItem('test-chain','0x1'));await p.reload();await waitIdle();
    check('Refresh on another chain never restores payment readiness', await p.locator('#wallet-menu').isHidden()&&await p.locator('#settle').isDisabled());
    await connect();
    check('Wrong chain after refresh remains explicit', (await p.locator('#network-status').innerText()).toLowerCase().includes('wrong network'));
    await p.evaluate(()=>window.__network.chain='0x190f1ca9');await connect();
    check('Returning to V3 after refresh allows a new verified connection', await p.locator('#wallet-menu').isVisible());
    check('No automatic switching, signing, or transaction submission', await p.evaluate(()=>!window.__network.calls.some(m=>/switch|addEthereumChain|send|sign/i.test(m))));

    // Recovery preservation is asserted above; remove only this synthetic fixture
    // and reload so the viewport checks can exercise a new populated review.
    await p.evaluate(()=>{localStorage.removeItem('setlora:pending:v2');sessionStorage.setItem('test-chain','0x190f1ca9');});
    await p.goto('about:blank');await p.goto('http://127.0.0.1:5174/app.html#pay');await waitIdle();
    if(await p.locator('#wallet-menu').isHidden())await connect();
    const viewports=[];
    for(const width of [390,768,1440]) {
      await p.setViewportSize({width,height:900});
      await p.evaluate(()=>location.hash='#pay');
      await p.locator('#setlora-invoice-0').fill('4701');
      await p.locator('#setlora-recipient-0').fill('0x3333333333333333333333333333333333333333');
      await p.locator('#setlora-amount-0').fill('0.45');
      await p.locator('#review').click();await waitIdle();
      const review=await p.evaluate(()=>({scroll:document.documentElement.scrollWidth,items:document.querySelectorAll('.review-item').length,button:document.querySelector('#settle').getBoundingClientRect().toJSON()}));
      check('Populated review remains readable at '+width+'px',review.scroll===width&&review.items===1&&review.button.width>0&&review.button.right<=width);
      await p.evaluate(()=>{location.hash='#pay';const n=window.__network;n.chain='0x1';n.emit('chainChanged','0x1');});
      await p.waitForFunction(()=>document.querySelector('#network-status').textContent.toLowerCase().includes('wrong network'));
      const metrics=await p.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,messageWidth:document.querySelector('#network-status').getBoundingClientRect().width,connect:document.querySelector('#connect').getBoundingClientRect().toJSON()}));
      check('Readable network error and connection controls at '+width+'px', metrics.scrollWidth===width&&metrics.messageWidth>0&&metrics.connect.right<=width&&metrics.connect.width>0);
      viewports.push({width,review,...metrics});
      await p.evaluate(()=>window.scrollTo(0,0));
      await p.screenshot({path:'.playwright-mcp/network-error-'+width+'-'+Date.now()+'.png',fullPage:true});
      await p.evaluate(()=>window.__network.chain='0x190f1ca9');await connect();
    }
    return {assertions:results,viewports};
  } finally {await context.close();}
}
