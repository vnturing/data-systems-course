global.window={}; global.document={addEventListener(){}};
require('../assets/sim-btree.js'); const B=window.BTreeSim; const R=require('../experiments/storage/measurements.json').innodb; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function loadRandom(cfg,n,seed){const r=mulberry(seed),t=new B.BTree(cfg),ks=[];for(let i=0;i<n;i++){const k=Math.floor(r()*4294967296)+Math.floor(r()*2**20)*4294967296;if(t.insert(k))ks.push(k);}t.finish();t.keys=ks;return t;}
// ---------- structure and correctness
for(const mode of ['seq','random']){
  const t=mode==='seq'?B.load({Lc:20,Ic:8},5000,'seq'):loadRandom({Lc:20,Ic:8},5000,3);
  chk(`${mode}: tree is valid (sorted, separators correct, all leaves at one depth) with tiny pages`,t.validate());
  const keys=mode==='seq'?Array.from({length:5000},(_,i)=>i+1):t.keys;let all=true;for(const k of keys)if(!t.lookup(k))all=false;
  chk(`${mode}: every inserted key is found`,all&&t.count===keys.length);
  chk(`${mode}: absent keys are not found`,!t.lookup(-5)&&!t.lookup(1e15));
}
// ---------- calibration against real InnoDB, sequential load
const SQ=R.sequential_load.rows;
for(const [n,m] of Object.entries(SQ)){
  const t=B.load({},+n,'seq'),s=t.stats();
  chk(`N=${n} sequential: height ${s.height}, leaves ${s.leaves} equal InnoDB (${m.height}, ${m.leaves})`,s.height===m.height&&Math.abs(s.leaves-m.leaves)<=1);
  chk(`N=${n} sequential: leaf fill ${(100*s.fill).toFixed(0)}% within 2 points of InnoDB ${m.leaf_fill_pct}%`,Math.abs(100*s.fill-m.leaf_fill_pct)<=2);
  const t2=B.load({poolPages:1e9},+n,'seq');const before=t2.pool.requests;t2.lookup(Math.floor(+n/2));
  chk(`N=${n}: a point lookup touches exactly ${m.page_requests_per_lookup} pages (height), as in InnoDB`,t2.pool.requests-before===m.page_requests_per_lookup);
}
const big=B.load({},1000000,'seq').stats();chk('1M rows sequential: 8 level-1 pages + 1 root (9 internal pages) as in InnoDB',big.internals===SQ['1000000'].level1_pages+1);
// ---------- calibration against real InnoDB, genuinely random keys
const RR=R.write_cost_200k_rows_108B_logical.random_md5,full=loadRandom({},200000,1),fs=full.stats();
chk(`random: leaf fill ${(100*fs.fill).toFixed(0)}% within 8 points of InnoDB ${RR.leaf_fill_pct}% (textbook: about ln 2 = 69%)`,Math.abs(100*fs.fill-RR.leaf_fill_pct)<=8);
chk(`random: ${fs.leaves} leaves within 10% of InnoDB ${RR.leaves}`,Math.abs(fs.leaves-RR.leaves)/RR.leaves<=0.10);
chk('random keys leave leaves much emptier than key-order loading (fill and leaf count)',fs.fill<0.75&&fs.leaves>1.2*B.load({},200000,'seq').stats().leaves);
// buffer pool sweep: the model must reproduce the SHAPE and stay within a stated error band (it underestimates InnoDB)
const mb2pages=mb=>mb*64,prev={w:Infinity},ratios=[];
for(const mb of ['8','16','32','128']){
  const w=loadRandom({poolPages:mb2pages(+mb)},200000,1).stats().pageWrites,real=RR.pages_written[mb],ratio=w/((real[0]+real[1])/2);ratios.push(ratio);
  chk(`pool ${mb}MB: model page writes ${w} vs InnoDB ${real.join('-')} (ratio ${ratio.toFixed(2)}) inside the stated 0.3-1.2 band`,ratio>=0.3&&ratio<=1.2);
  chk(`pool ${mb}MB: writes fall as the pool grows`,w<prev.w);prev.w=w;
}
const sw=mb=>loadRandom({poolPages:mb2pages(mb)},200000,1).stats().pageWrites;
chk('a pool a quarter of the tree costs more than 20x the writes of a pool that holds it',sw(8)/sw(128)>20);
// ---------- sequential loading does not suffer from a small pool
const seqSmall=B.load({poolPages:512},200000,'seq').stats(),seqBig=B.load({poolPages:1e9},200000,'seq').stats();
chk(`sequential load with a tiny pool writes about as many pages as with a huge one (${seqSmall.pageWrites} vs ${seqBig.pageWrites}); real InnoDB 4.3-4.6x vs 3.0-3.8x`,seqSmall.pageWrites<=1.25*seqBig.pageWrites);
// ---------- the pitfall found while calibrating: a low-discrepancy "scramble" is NOT random
const quasi=B.load({poolPages:2048},200000,'random').stats(),rand=loadRandom({poolPages:2048},200000,1).stats();
chk(`n*2654435761 mod 2^32 thrashes an LRU pool that is just too small (${quasi.pageWrites} writes) far more than true random keys (${rand.pageWrites})`,quasi.pageWrites>3*rand.pageWrites);
chk('and it splits leaves in lockstep: higher fill than random keys',quasi.fill>rand.fill+0.03);
console.log(bad?bad+' failures':'btree model: all properties hold'); process.exit(bad?1:0);
