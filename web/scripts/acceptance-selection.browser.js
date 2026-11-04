// Playwright MCP entry point; configured Vite app on 5174. Synthetic wallets only.
async (page) => {
  const results=[];
  const check=(name,condition)=>{if(!condition)throw new Error('Selection acceptance failed: '+name);results.push({name,result:'PASS'});};
  for(const scenario of ['fresh','absent','revoked','changed','remembered-wrong','remembered-correct','multiple']) {
    const context=await page.context().browser().newContext();
    try {
      await context.addInitScript(({scenario})=>{
        const A='0x1111111111111111111111111111111111111111';
        const s=window.__selection={chain:scenario==='remembered-correct'?'0x190f1ca9':'0x1',account:scenario==='changed'?'0x2222222222222222222222222222222222222222':A,authorized:scenario!=='revoked',calls:[],otherCalls:[],listeners:{}};
        s.emit=(event,value)=>[...s.listeners[event]||[]].forEach(fn=>fn(value));
        const provider={isMetaMask:true,on:(event,fn)=>(s.listeners[event]??=new Set()).add(fn),removeListener:(event,fn)=>s.listeners[event]?.delete(fn),request:async({method})=>{
          s.calls.push(method);
          if(method==='eth_accounts')return s.authorized?[s.account]:[];
          if(method==='eth_chainId')return s.chain;
          if(method==='eth_requestAccounts'){s.authorized=true;return[s.account];}
          if(method==='wallet_revokePermissions'){s.authorized=false;return null;}
          throw new Error('No signing/switching allowed in selection harness: '+method);
        }};
        if(scenario!=='absent')window.ethereum=provider;
        if(scenario==='multiple')window.addEventListener('eip6963:requestProvider',()=>{
          const other={request:async({method})=>{s.otherCalls.push(method);return method==='eth_accounts'?[A]:'0x190f1ca9';},on(){},removeListener(){}};
          for(const[uuid,name,p]of[['chosen','MetaMask',provider],['other','Other Wallet',other]])window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid,name,rdns:'test.'+uuid},provider:p}}));
        });
        // Seed once per context; refresh must observe the application's storage changes.
        if(!sessionStorage.getItem('selection-seeded')) {
          sessionStorage.setItem('selection-seeded','1');
          if(['revoked','changed','remembered-wrong','remembered-correct'].includes(scenario))localStorage.setItem('setlora:last-wallet:v1',JSON.stringify({version:1,address:A,chainId:'420420777',contract:'0x2d17199920251f7eec8a555043c8387194ff5d1b',name:'MetaMask (browser)',rdns:'',legacy:true}));
          localStorage.setItem('selection-recovery','preserved');
          localStorage.setItem('setlora:pending:v2',JSON.stringify({status:'unknown',hash:null,payer:A,items:[{invoice:'9',recipient:A,amount:'10000'}],chainId:'420420777',contract:'0x2d17199920251f7eec8a555043c8387194ff5d1b'}));
        }
      },{scenario});
      await context.route('https://test-evm-rpc-v3.portaldot.dev/**',async route=>{
        const queries=route.request().postDataJSON();
        const reply=q=>{
          let result;
          if(q.method==='eth_getCode')result='0x6000';
          else if(q.method==='eth_chainId')result='0x190f1ca9';
          else if(q.method==='eth_call') {
            const selector=q.params[0].data.slice(0,10);
            const value=selector==='0xfc0c546a'?'00001e6100000000000000000000000000010000':selector==='0x313ce567'?'6':'0';
            result='0x'+value.padStart(64,'0');
          } else throw new Error('Unexpected read-only RPC '+q.method);
          return{jsonrpc:'2.0',id:q.id,result};
        };
        await route.fulfill({json:Array.isArray(queries)?queries.map(reply):reply(queries)});
      });
      const p=await context.newPage();
      await p.goto('http://127.0.0.1:5174/app.html#pay');
      const idle=()=>p.waitForFunction(()=>document.querySelector('#review')&&!document.querySelector('#review').disabled);
      await idle();
      if(['fresh','absent','revoked','changed','multiple'].includes(scenario)) {
        check(scenario+': neutral disconnected state',await p.locator('#connect').isVisible()&&(await p.locator('#connect').innerText())==='Connect wallet'&&await p.locator('#switch-network').isHidden()&&!/wrong network/i.test(await p.locator('#network-status').innerText()));
        check(scenario+': payment disabled',await p.locator('#approve').isDisabled()&&await p.locator('#settle').isDisabled());
        if(['fresh','multiple'].includes(scenario))check(scenario+': discovery requests no wallet identity or permission',await p.evaluate(()=>window.__selection.calls.length===0&&window.__selection.otherCalls.length===0));
        if(scenario!=='absent') {
          await p.evaluate(()=>{const s=window.__selection;s.emit('chainChanged','0x1');s.emit('accountsChanged',[s.account]);});
          check(scenario+': unselected provider events cannot show switching',await p.locator('#switch-network').isHidden()&&!/wrong network/i.test(await p.locator('#network-status').innerText()));
        }
      } else if(scenario==='remembered-wrong') {
        check('Authorized remembered wrong-chain wallet offers reconnect/switch',await p.locator('#switch-network').isVisible()&&(await p.locator('#connect').innerText())==='Reconnect wallet'&&await p.locator('#settle').isDisabled());
      } else {
        check('Authorized remembered V3 wallet restores account without review',await p.locator('#wallet-menu').isVisible()&&await p.locator('#switch-network').isHidden()&&await p.locator('#settle').isDisabled());
        const before=await p.evaluate(()=>localStorage.getItem('setlora:pending:v2'));
        await p.locator('#wallet-address').click();await p.locator('#disconnect-wallet').click();await idle();
        check('Disconnect hides switch and preserves pending evidence',await p.locator('#switch-network').isHidden()&&await p.evaluate(value=>localStorage.getItem('setlora:pending:v2')===value,before));
        await p.reload();await idle();
        check('Disconnect and refresh stay neutral with no wallet requests',await p.locator('#connect').isVisible()&&await p.locator('#switch-network').isHidden()&&await p.evaluate(()=>window.__selection.calls.length===0));
      }
      if(scenario==='multiple') {
        await p.locator('#connect').click();await p.getByRole('button',{name:'MetaMask',exact:true}).click();await idle();
        check('Explicit wrong-chain selection retains only the chosen provider',await p.locator('#switch-network').isVisible()&&await p.evaluate(()=>window.__selection.calls.includes('eth_requestAccounts')&&window.__selection.otherCalls.length===0));
      }
      check(scenario+': no automatic permissions, switch or financial requests',await p.evaluate(()=>!window.__selection.calls.some(m=>/switch|addEthereum|send|sign/i.test(m))));
    } finally {await context.close();}
  }
  return {assertions:results};
}
