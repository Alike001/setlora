import test from 'node:test';
import assert from 'node:assert/strict';
import { switchWalletNetwork, explainNetworkSwitchError } from '../src/wallet-network-switch.js';
import { walletState, releaseWalletState, verifiedWallet, verifiedSigner } from '../src/wallet-network.js';

const CHAIN = 420420777n, HEX = '0x190f1ca9', A = '0x'+'1'.repeat(40), B = '0x'+'2'.repeat(40);
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; };
function mock() {
  const listeners = new Map();
  const p = {
    account:A, chain:'0x1', calls:[], switchResult:null, switchError:null, switchGate:null, readGate:null, emitSwitch:true, changeChain:true,
    on(event, fn) { if(!listeners.has(event))listeners.set(event,new Set()); listeners.get(event).add(fn); },
    removeListener(event, fn) { listeners.get(event)?.delete(fn); },
    emit(event, value) { for(const fn of [...listeners.get(event)||[]])fn(value); },
    async request({method,params}) {
      p.calls.push({method,params});
      if(method==='wallet_switchEthereumChain') {
        p.started?.resolve();
        if(p.switchGate)await p.switchGate.promise;
        if(p.switchError)throw p.switchError;
        if(p.changeChain)p.chain=HEX;
        if(p.emitSwitch)p.emit('chainChanged',p.chain);
        if(p.postReadGate)p.readGate=p.postReadGate;
        return p.switchResult;
      }
      if(method==='eth_accounts')return p.account?[p.account]:[];
      if(method==='eth_chainId') {
        if(p.readGate) {const gate=p.readGate;p.readGate=null;p.readStarted?.resolve();return gate.promise;}
        return p.chain;
      }
      throw new Error('Forbidden method '+method);
    },
  };
  return p;
}
const setup=t=>{const p=mock();t.after(()=>releaseWalletState(p));return p;};
const codeError=code=>Object.assign(new Error('Synthetic wallet error'),{code});
const switches=p=>p.calls.filter(c=>c.method==='wallet_switchEthereumChain');

test('explicit switch targets only the supplied provider and verifies actual account and V3', async t=>{
  const selected=setup(t), other=setup(t);
  const result=await switchWalletNetwork(selected,HEX);
  assert.equal(result.status,'switched');assert.equal(result.identity.address,A);assert.equal(result.identity.chainId,CHAIN);
  assert.deepEqual(switches(selected),[{method:'wallet_switchEthereumChain',params:[{chainId:HEX}]}]);
  assert.equal(other.calls.length,0);
  assert.ok(selected.calls.every(c=>['wallet_switchEthereumChain','eth_accounts','eth_chainId'].includes(c.method)));
});

test('switch invalidates a prior reviewed signer even when the wallet emits no event', async t=>{
  const p=setup(t);p.chain=HEX;const old=await verifiedWallet(p,CHAIN);t.after(()=>old.wallet.destroy());
  p.emitSwitch=false;await switchWalletNetwork(p,HEX);
  await assert.rejects(verifiedSigner(old.wallet,A,p,CHAIN),e=>e.code==='WALLET_STATE_CHANGED');
});

test('user rejection returns clear cancelled guidance and makes no fallback request', async t=>{
  const p=setup(t);p.switchError=codeError(4001);
  await assert.rejects(switchWalletNetwork(p,HEX),e=>explainNetworkSwitchError(e).kind==='rejected');
  assert.equal(switches(p).length,1);assert.equal(p.calls.length,3);assert.equal(p.chain,'0x1');
});

test('unknown chain offers manual addition without wallet_addEthereumChain', async t=>{
  const p=setup(t);p.switchError=codeError(4902);
  await assert.rejects(switchWalletNetwork(p,HEX),e=>explainNetworkSwitchError(e).kind==='unknown-chain');
  assert.equal(p.calls.length,3);
  assert.ok(!p.calls.some(c=>c.method==='wallet_addEthereumChain'));
});

test('unsupported switching methods are explained for standard and legacy error codes', async t=>{
  for(const code of [4200,-32601]) {
    const p=setup(t);p.switchError=codeError(code);
    await assert.rejects(switchWalletNetwork(p,HEX),e=>explainNetworkSwitchError(e).kind==='unsupported');
    assert.equal(p.calls.length,3);
  }
});

test('another wallet request pending is reported without automatic retries', async t=>{
  const p=setup(t);p.switchError=codeError(-32002);
  await assert.rejects(switchWalletNetwork(p,HEX),e=>explainNetworkSwitchError(e).kind==='pending');
  assert.equal(switches(p).length,1);
});

test('rapid repeated clicks do not queue duplicate switches', async t=>{
  const p=setup(t);p.switchGate=deferred();p.started=deferred();
  const first=switchWalletNetwork(p,HEX);await p.started.promise;
  await assert.rejects(switchWalletNetwork(p,HEX),e=>e.code===-32002);
  assert.equal(switches(p).length,1);p.switchGate.resolve();await first;
});

test('the switch lock includes post-switch verification, not just the wallet response', async t=>{
  const p=setup(t);p.postReadGate=deferred();p.readStarted=deferred();const gate=p.postReadGate;
  const first=switchWalletNetwork(p,HEX);await p.readStarted.promise;
  await assert.rejects(switchWalletNetwork(p,HEX),e=>e.code===-32002);
  gate.resolve(HEX);assert.equal((await first).status,'switched');assert.equal(switches(p).length,1);
});

test('disconnect during a pending switch cancels UI work even if its main observer disposes first', async t=>{
  const p=setup(t);p.switchGate=deferred();p.started=deferred();
  walletState(p).subscribe(event=>{if(event==='disconnect')releaseWalletState(p);});
  const first=switchWalletNetwork(p,HEX);const rejected=assert.rejects(first,e=>explainNetworkSwitchError(e).kind==='disconnected');
  await p.started.promise;p.emit('disconnect',{code:4900});await rejected;
  // The uncompleted native request still owns the lock, preventing duplicates.
  await assert.rejects(switchWalletNetwork(p,HEX),e=>e.code===-32002);
  assert.equal(switches(p).length,1);p.switchGate.resolve();
});

test('account changes during switching verify the latest authorized account', async t=>{
  const p=setup(t);p.switchGate=deferred();p.started=deferred();
  const first=switchWalletNetwork(p,HEX);await p.started.promise;
  p.account=B;p.emit('accountsChanged',[B]);p.switchGate.resolve();
  const result=await first;assert.equal(result.identity.address,B);assert.equal(result.identity.chainId,CHAIN);
  assert.ok(!p.calls.some(c=>c.method==='eth_requestAccounts'));
});

test('a successful switch with missing account permission does not request permission automatically', async t=>{
  const p=setup(t);p.account=null;
  const result=await switchWalletNetwork(p,HEX);
  assert.equal(result.status,'needs-account');assert.equal(result.chainId,CHAIN);
  walletState(p).assertRevision(result.revision);
  assert.ok(!p.calls.some(c=>c.method==='eth_requestAccounts'));
});

test('success is not assumed when the wallet returns null but stays on the wrong chain', async t=>{
  const p=setup(t);p.changeChain=false;
  await assert.rejects(switchWalletNetwork(p,HEX),e=>explainNetworkSwitchError(e).kind==='wrong-network');
});

test('missing account permission on the wrong chain is not reported as a successful switch', async t=>{
  const p=setup(t);p.changeChain=false;p.account=null;
  await assert.rejects(switchWalletNetwork(p,HEX),e=>e.code==='WALLET_WRONG_NETWORK');
});

test('late stale RPC responses cannot override a newer V3 check after rapid events', async t=>{
  const p=setup(t);p.postReadGate=deferred();p.readStarted=deferred();const old=p.postReadGate;
  const first=switchWalletNetwork(p,HEX);await p.readStarted.promise;
  p.chain='0x1';p.emit('chainChanged','0x1');p.chain=HEX;p.emit('chainChanged',HEX);
  const result=await first;old.resolve('0x1');
  assert.equal(result.status,'switched');assert.equal(result.identity.chainId,CHAIN);
});

test('malformed chain data never authorizes readiness after a switch', async t=>{
  const p=setup(t);p.changeChain=false;p.chain='garbage';
  await assert.rejects(switchWalletNetwork(p,HEX),/could not be verified/);
});

test('nested wallet error codes and generic failures have safe guidance', ()=>{
  assert.equal(explainNetworkSwitchError({data:{originalError:{code:4902}}}).kind,'unknown-chain');
  assert.equal(explainNetworkSwitchError({info:{error:{code:4001}}}).kind,'rejected');
  assert.equal(explainNetworkSwitchError({error:{code:-32002}}).kind,'pending');
  assert.equal(explainNetworkSwitchError(new Error('timeout')).kind,'unverified');
});

test('a completed switch result cannot be applied after another wallet identity event', async t=>{
  for(const account of [A,null]) {
    const p=setup(t);p.account=account;const result=await switchWalletNetwork(p,HEX);
    walletState(p).assertRevision(result.revision);
    p.chain='0x1';p.emit('chainChanged',p.chain);
    assert.throws(()=>walletState(p).assertRevision(result.revision),e=>e.code==='WALLET_STATE_CHANGED');
  }
});


test('fresh V3 identity skips the unnecessary switch, including missing account permission', async t=>{
  for(const account of [A,null]) {
    const p=setup(t);p.account=account;p.chain=HEX;
    const phases=[];const result=await switchWalletNetwork(p,HEX,{onPhase:phase=>phases.push(phase)});
    assert.equal(result.status,account?'already-correct':'needs-account');
    assert.equal(switches(p).length,0);assert.deepEqual(phases,['checking']);
    assert.deepEqual(p.calls.map(c=>c.method).sort(),['eth_accounts','eth_chainId']);
  }
});

test('waiting and verification phases follow actual requests; an event alone never resolves switching', async t=>{
  const p=setup(t);p.switchGate=deferred();p.started=deferred();const phases=[];
  const first=switchWalletNetwork(p,HEX,{onPhase:phase=>phases.push(phase)});await p.started.promise;
  assert.deepEqual(phases,['checking','waiting']);
  p.emit('chainChanged',HEX); // The actual chain is still wrong and the request pending.
  assert.deepEqual(phases,['checking','waiting']);
  p.switchGate.resolve();const result=await first;
  assert.equal(result.status,'switched');assert.deepEqual(phases,['checking','waiting','verifying']);
  assert.equal(p.calls.filter(c=>c.method==='eth_chainId').length,2);
});

test('RPC failure checking current chain never dispatches a switch or authorizes payment', async t=>{
  const p=setup(t);p.request=async()=>{throw new Error('RPC unavailable');};
  await assert.rejects(switchWalletNetwork(p,HEX),/RPC unavailable/);
  assert.equal(switches(p).length,0);
});

test('an old initial wrong-chain response cannot request a redundant switch after returning to V3', async t=>{
  const p=setup(t);p.readGate=deferred();p.readStarted=deferred();const old=p.readGate;
  const first=switchWalletNetwork(p,HEX);await p.readStarted.promise;
  p.chain=HEX;p.emit('chainChanged',HEX);
  assert.equal((await first).status,'already-correct');old.resolve('0x1');
  assert.equal(switches(p).length,0);
});

test('repeated clicks during the initial network check cannot queue wallet requests', async t=>{
  const p=setup(t);p.readGate=deferred();p.readStarted=deferred();const initial=p.readGate;
  const first=switchWalletNetwork(p,HEX);await p.readStarted.promise;
  await assert.rejects(switchWalletNetwork(p,HEX),e=>e.code===-32002);
  assert.equal(switches(p).length,0);initial.resolve('0x1');
  assert.equal((await first).status,'switched');assert.equal(switches(p).length,1);
});
