// Playwright MCP function entry point. Start the configured Vite app on 5174.
// Two synthetic EIP-6963 wallets; no real extension, key, signature or payment.
async (page) => {
  const context=await page.context().browser().newContext();
  const results=[], errors=[];
  const check=(name,condition)=>{
    if(!condition)throw new Error('Switch acceptance failed: '+name);
    results.push({name,result:'PASS'});
  };
  await context.addInitScript(()=>{
    const s=window.__switch={chain:sessionStorage.getItem('test-switch-chain')||'0x1',account:'0x1111111111111111111111111111111111111111',authorized:true,mode:'success',calls:[],otherCalls:[],listeners:{},pending:false};
    s.emit=(event,value)=>[...s.listeners[event]||[]].forEach(fn=>fn(value));
    const selected={
      request:async({method,params})=>{
        s.calls.push({method,params,chain:method==='eth_chainId'?s.chain:undefined});
        if(method==='eth_chainId')return s.chain;
        if(method==='eth_accounts')return s.authorized?[s.account]:[];
        if(method==='eth_requestAccounts'){s.authorized=true;return[s.account];}
        if(method==='wallet_switchEthereumChain'){
          if(typeof s.mode==='number')throw Object.assign(new Error('Synthetic wallet failure'),{code:s.mode});
          if(s.mode==='hold')await new Promise(resolve=>{s.pending=true;s.resolve=resolve;});
          if(s.mode==='missing-account')s.authorized=false;
          if(s.mode!=='noop'){s.chain=params[0].chainId;s.emit('chainChanged',s.chain);}
          s.pending=false;return null;
        }
        throw new Error('Financial/add-chain method forbidden: '+method);
      },
      on:(event,fn)=>(s.listeners[event]??=new Set()).add(fn),
      removeListener:(event,fn)=>s.listeners[event]?.delete(fn),
    };
    const other={request:async({method})=>{s.otherCalls.push(method);throw new Error('Wrong provider selected');},on(){},removeListener(){}};
    window.ethereum=other; // Deliberately NOT the provider chosen in the picker.
    window.addEventListener('eip6963:requestProvider',()=>{
      for(const [uuid,name,provider]of[['target','Target Wallet',selected],['other','Other Wallet',other]]){
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid,name,rdns:'test.'+uuid},provider}}));
      }
    });
  });
  await context.route('https://test-evm-rpc-v3.portaldot.dev/**',async route=>{
    const queries=route.request().postDataJSON();
    const reply=q=>{
      let result;
      if(q.method==='eth_getCode')result='0x6000';
      else if(q.method==='eth_chainId')result='0x190f1ca9';
      else if(q.method==='eth_blockNumber')result='0x40000';
      else if(q.method==='eth_getTransactionReceipt'||q.method==='eth_getTransactionByHash')result=null;
      else if(q.method==='eth_call'){
        const selector=q.params[0].data.slice(0,10);
        const value=selector==='0xfc0c546a'?'00001e6100000000000000000000000000010000'
          :selector==='0x313ce567'?'6':selector==='0x70a08231'?(10000000).toString(16)
          :selector==='0xdd62ed3e'?(450000).toString(16):selector==='0xa9059cbb'?'1':'0';
        result='0x'+value.padStart(64,'0');
      }else throw new Error('Unexpected RPC '+q.method);
      return{jsonrpc:'2.0',id:q.id,result};
    };
    await route.fulfill({json:Array.isArray(queries)?queries.map(reply):reply(queries)});
  });
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  const idle=()=>p.waitForFunction(()=>!document.querySelector('#review').disabled);
  const choose=async()=>{
    await p.locator('#connect').click();await p.getByRole('button',{name:'Target Wallet',exact:true}).click();await idle();
  };
  const count=()=>p.evaluate(()=>window.__switch.calls.filter(c=>c.method==='wallet_switchEthereumChain').length);
  try{
    await p.goto('http://127.0.0.1:5174/app.html#pay');
    check('Page load makes no network-switch request',await count()===0&&await p.locator('#switch-network').isHidden());
    await choose();
    check('Wrong selected wallet shows Switch in network status area',await p.locator('#switch-network').isVisible()&&await p.locator('#network-actions').evaluate(e=>!!e.closest('.preview-note')));
    check('Selecting a wallet does not switch automatically',await count()===0);
    check('Wrong network message is explicit',(await p.locator('#network-status').innerText()).includes('Wrong network detected'));
    const recovery=JSON.stringify({status:'unknown',hash:null,payer:'0x9999999999999999999999999999999999999999',items:[{invoice:'9',recipient:'0x3333333333333333333333333333333333333333',amount:'10000'}],chainId:'420420777',contract:'0x2d17199920251f7eec8a555043c8387194ff5d1b'});
    await p.evaluate(value=>{localStorage.setItem('setlora:pending:v2',value);localStorage.setItem('test-switch-recovery',value);window.__switch.mode='hold';},recovery);
    await p.locator('#switch-network').evaluate(button=>{button.click();button.click();});
    await p.waitForFunction(()=>window.__switch.pending);
    check('Double click sends exactly one switch to the selected provider',await count()===1&&await p.evaluate(()=>window.__switch.otherCalls.length===0));
    check('Switch uses config chain ID hex',await p.evaluate(()=>window.__switch.calls.find(c=>c.method==='wallet_switchEthereumChain').params[0].chainId==='0x190f1ca9'));
    check('Pending request shows Waiting for wallet confirmation',(await p.locator('#network-status').innerText()).includes('Waiting for wallet confirmation'));
    check('Switching disables payment and repeated switching',await p.locator('#approve').isDisabled()&&await p.locator('#settle').isDisabled()&&await p.locator('#switch-network').isDisabled());
    await p.evaluate(()=>{const s=window.__switch;s.account='0x2222222222222222222222222222222222222222';s.emit('accountsChanged',[s.account]);s.chain='0x1';s.emit('chainChanged','0x1');s.chain='0x190f1ca9';s.emit('chainChanged',s.chain);s.resolve();});await idle();
    check('Success verifies latest account/network and requires reconnect', (await p.locator('#network-status').innerText()).includes('Portaldot V3 detected. Reconnect your wallet to continue')&&await p.locator('#wallet-menu').isHidden()&&await p.locator('#settle').isDisabled());
    check('Post-switch verification queried fresh selected-wallet identity',await p.evaluate(()=>window.__switch.calls.filter(c=>c.method==='eth_chainId').length>=3));
    check('Switch and fresh V3 read use the selected EIP-6963 object, not window.ethereum',await p.evaluate(()=>{
      const s=window.__switch,index=s.calls.findIndex(c=>c.method==='wallet_switchEthereumChain');
      const after=s.calls.slice(index+1).find(c=>c.method==='eth_chainId');
      return s.otherCalls.length===0&&after?.chain==='0x190f1ca9';
    }));
    check('Switch preserves pending recovery information',await p.evaluate(()=>localStorage.getItem('setlora:pending:v2')===localStorage.getItem('test-switch-recovery')));
    await choose();
    check('Explicit reconnect uses changed account',await p.locator('#wallet-address').getAttribute('title')==='0x2222222222222222222222222222222222222222');
    await p.evaluate(()=>{window.__switch.chain='0x1';window.__switch.emit('chainChanged','0x1');});
    await p.waitForFunction(()=>!document.querySelector('#switch-network').hidden);
    for(const[code,text]of[[4001,'cancelled'],[4200,'does not support'],[-32601,'does not support'],[-32002,'pending'],[-32603,'could not be verified']]){
      await p.evaluate(code=>window.__switch.mode=code,code);const before=await count();
      await p.locator('#switch-network').click();await idle();
      check('Clear switch error '+code,(await p.locator('#network-status').innerText()).includes(text)&&await count()===before+1&&await p.locator('#settle').isDisabled());
    }
    await p.evaluate(()=>window.__switch.mode=4902);await p.locator('#switch-network').click();await idle();
    check('Unknown chain offers Add action',await p.locator('#add-network').isVisible());
    const beforeManual=await p.evaluate(()=>window.__switch.calls.length);await p.locator('#add-network').click();
    check('Add action opens honest manual instructions without a wallet request',await p.locator('#network-setup').isVisible()&&await p.evaluate(n=>window.__switch.calls.length===n,beforeManual));
    check('Manual settings show existing chain/RPC and disclose missing gas metadata',(await p.locator('#network-setup-chain').innerText()).includes('420420777')&&(await p.locator('#network-setup-rpc').innerText())==='https://test-evm-rpc-v3.portaldot.dev'&&(await p.locator('#network-setup').innerText()).includes('gas-currency'));
    const viewports=[];
    for(const width of[390,768,1440]){
      await p.setViewportSize({width,height:900});
      const rects=await p.locator('#switch-network,#add-network').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
      const scroll=await p.evaluate(()=>document.documentElement.scrollWidth);
      check('Switch/manual actions fit '+width+'px',scroll===width&&rects.every(r=>r.width>0&&r.right<=width));
      await p.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
      const screenshot='.playwright-mcp/network-switch-'+width+'-'+Date.now()+'.png';await p.screenshot({path:screenshot,fullPage:true});viewports.push({width,scroll,rects,screenshot});
    }
    // Make a valid remembered connection; then reload on another chain.
    await p.evaluate(()=>{window.__switch.mode='success';window.__switch.account='0x1111111111111111111111111111111111111111';window.__switch.chain='0x190f1ca9';});await choose();
    await p.evaluate(()=>sessionStorage.setItem('test-switch-chain','0x1'));await p.reload();await idle();
    check('Restoration and recovery never switch automatically',await count()===0&&await p.locator('#switch-network').isVisible());
    check('Recovery survives refresh on the wrong chain',await p.evaluate(()=>localStorage.getItem('setlora:pending:v2')===localStorage.getItem('test-switch-recovery')));
    await p.evaluate(()=>window.__switch.mode='hold');await p.locator('#switch-network').click();await p.waitForFunction(()=>window.__switch.pending);
    await p.evaluate(()=>window.__switch.emit('disconnect',{code:4900}));await idle();
    check('Disconnect during switch clears action and readiness',await p.locator('#switch-network').isHidden()&&await p.locator('#settle').isDisabled()&&(await p.locator('#network-status').innerText()).includes('disconnected'));
    await p.evaluate(()=>window.__switch.resolve());
    check('Late switch response cannot reconnect a disconnected wallet',await p.locator('#wallet-menu').isHidden()&&await p.locator('#settle').isDisabled());
    await p.evaluate(()=>{window.__switch.chain='0x1';window.__switch.mode='missing-account';});await choose();await p.locator('#switch-network').click();await idle();
    check('Switched chain with missing account access asks for reconnect',(await p.locator('#network-status').innerText()).includes('no account is authorized')&&await p.locator('#wallet-menu').isHidden()&&await p.locator('#settle').isDisabled());
    check('No automatic account prompt after switch',await p.evaluate(()=>window.__switch.calls.filter(c=>c.method==='eth_requestAccounts').length===1));
    // Clear only the synthetic recovery fixture to test a fresh reviewed batch.
    await choose();check('User can explicitly grant missing account access',await p.locator('#wallet-menu').isVisible());
    await p.evaluate(()=>{localStorage.removeItem('setlora:pending:v2');sessionStorage.setItem('test-switch-chain','0x190f1ca9');});await p.reload();await idle();
    await p.locator('#setlora-invoice-0').fill('4801');await p.locator('#setlora-recipient-0').fill('0x3333333333333333333333333333333333333333');await p.locator('#setlora-amount-0').fill('0.45');await p.locator('#review').click();await idle();
    check('Only an explicit fresh review enables payment readiness',!await p.locator('#settle').isDisabled());
    await p.evaluate(()=>{window.__switch.chain='0x1';window.__switch.emit('chainChanged','0x1');});await p.waitForFunction(()=>!document.querySelector('#switch-network').hidden);
    check('Network change clears the old reviewed batch',await p.locator('.review-item').count()===0&&await p.locator('#settle').isDisabled());
    await p.evaluate(()=>window.__switch.mode='noop');await p.locator('#switch-network').click();await idle();
    check('Null response on wrong chain is not shown as success',(await p.locator('#network-status').innerText()).includes('still on the wrong network')&&await p.locator('#settle').isDisabled());
    // The wallet silently returns to V3 before a click: verify without switching.
    await p.evaluate(()=>window.__switch.chain='0x190f1ca9');const beforeAlready=await count();
    await p.locator('#switch-network').click();await idle();
    check('Already-correct chain avoids a redundant switch',await count()===beforeAlready&&(await p.locator('#network-status').innerText()).includes('Portaldot V3 detected'));
    for(const chain of ['0x190f1ca9','0x1']) {
      await p.evaluate(()=>{window.__switch.chain='0x190f1ca9';window.__switch.mode='success';});
      if(await p.locator('#wallet-menu').isHidden())await choose();
      const pendingBefore=await p.evaluate(()=>localStorage.getItem('setlora:pending:v2'));
      await p.locator('#wallet-address').click();await p.locator('#disconnect-wallet').click();await idle();
      check('Explicit disconnect is neutral before reconnect to '+chain,(await p.locator('#connect').innerText())==='Connect wallet'&&await p.locator('#switch-network').isHidden()&&(await p.locator('#network-status').innerText()).includes('Connect wallet to continue')&&await p.locator('#settle').isDisabled());
      await p.evaluate(chain=>{window.__switch.chain=chain;window.__switch.emit('chainChanged',chain);window.dispatchEvent(new Event('eip6963:requestProvider'));},chain);
      check('Discovery/events cannot reconnect after disconnect '+chain,await p.locator('#wallet-menu').isHidden()&&await p.locator('#switch-network').isHidden()&&await p.evaluate(value=>localStorage.getItem('setlora:pending:v2')===value,pendingBefore));
      const switchesBefore=await count();await choose();
      check('New connection rechecks actual chain '+chain,chain==='0x1'?await p.locator('#switch-network').isVisible()&&await p.locator('#settle').isDisabled():await p.locator('#wallet-menu').isVisible()&&await p.locator('#switch-network').isHidden()&&await p.locator('#settle').isDisabled());
      check('New connection never automatically switches '+chain,await count()===switchesBefore&&await p.evaluate(()=>window.__switch.otherCalls.length===0));
    }
    check('No add-chain, financial signature, or transaction request',await p.evaluate(()=>!window.__switch.calls.some(c=>/addEthereumChain|send|sign|approve/i.test(c.method))));
    check('No browser runtime errors',errors.length===0);
    return{assertions:results,viewports};
  }finally{await context.close();}
}
