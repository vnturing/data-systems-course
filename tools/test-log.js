global.window={}; global.document={addEventListener(){}};
require('../assets/sim-log.js'); const {Log,crc32}=window.LogSim; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
function lcg(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s>>>8;};}
chk('CRC32 matches the standard check value for "123456789" (0xCBF43926)',crc32(new TextEncoder().encode('123456789'),0,9)===0xCBF43926);
// basic semantics
let l=new Log();l.put('a','1');l.put('b','2');l.put('a','3');l.del('b');
chk('get returns the latest value',l.get('a')==='3');chk('delete hides the key',l.get('b')===null&&l.keydir.size===1);
chk('each read is one seek',(()=>{const s0=l.st.seeks;l.get('a');return l.st.seeks===s0+1;})());
const before=l.len,big=new Log();for(let i=0;i<500;i++)big.put('k'+(i%10),'value-'+i);
const sa=big.stats().spaceAmp,c=big.compact();
chk('heavy overwrites give large space amplification (>20x for 10 keys written 500 times)',sa>20);
chk('compaction keeps exactly the live data',c.keydir.size===10&&Array.from(big.keydir.keys()).every(k=>c.get(k)===big.get(k)));
chk('after compaction the log is exactly the live records (space amp = 1)',Math.abs(c.stats().spaceAmp-1)<1e-9);
chk('compaction rewrote only live bytes (write cost equals the new log size)',c.st.compactWrite===c.len);
// ---- property test: crash at ANY byte offset recovers exactly the state after the last complete record
let trials=0;
for(let seed=1;seed<=40;seed++){
  const r=lcg(seed),L=new Log(),ops=[],ends=[];
  for(let i=0;i<60;i++){const k='k'+(r()%12);if(r()%5===0){L.del(k);ops.push(['d',k]);}else{const v='v'+r()+'x'.repeat(r()%30);L.put(k,v);ops.push(['p',k,v]);}ends.push(L.len);}
  const stateAfter=n=>{const m=new Map();for(let i=0;i<n;i++){const o=ops[i];if(o[0]==='p')m.set(o[1],o[2]);else m.delete(o[1]);}return m;};
  for(let t=0;t<25;t++){
    const cut=r()%(L.len+1),done=ends.filter(e=>e<=cut).length,ref=stateAfter(done),rec=Log.recover(L.buf,cut);trials++;
    let ok=rec.keydir.size===ref.size&&rec.recovered.records===done&&rec.recovered.validBytes===(done?ends[done-1]:0);
    ref.forEach((v,k)=>{if(rec.get(k)!==v)ok=false;});
    if(!ok){chk('crash at byte '+cut+' (seed '+seed+') recovers the state after '+done+' complete records',false);break;}
  }
  // corruption: flip one bit inside a random record; recovery must stop at (or before) that record and never accept it
  for(let t=0;t<10;t++){
    const idx=r()%ops.length,start=idx?ends[idx-1]:0,pos=start+4+(r()%(ends[idx]-start-4)),copy=L.buf.slice(0,L.len);copy[pos]^=1<<(r()%8);
    const rec=Log.recover(copy,L.len),ref=stateAfter(idx);trials++;
    let ok=rec.recovered.records<=idx;
    if(rec.recovered.records===idx){ref.forEach((v,k)=>{if(rec.get(k)!==v)ok=false;});ok=ok&&rec.keydir.size===ref.size;}
    if(!ok){chk('a flipped bit in record '+idx+' is never accepted (seed '+seed+')',false);break;}
  }
}
chk('property test ran '+trials+' random crash/corruption trials, all recovered correctly',bad===0&&trials>=1400);
console.log(bad?bad+' failures':'log model: all properties hold ('+trials+' randomized trials)'); process.exit(bad?1:0);
