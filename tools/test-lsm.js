global.window={}; global.document={addEventListener(){}};
require('../assets/sim-lsm.js'); const S=window.LSMSim; const R=require('../experiments/storage/measurements.json').rocksdb; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const M=1000,cfg=o=>Object.assign({M,fileRecs:M,base:2*M,T:10,l0Trigger:4},o||{});
const within=(x,rng,lo,hi)=>x>=rng[0]*lo&&x<=rng[1]*hi;
// ---------- correctness against a reference map (both policies, bloom on/off), including deletes
for(const policy of ['leveled','tiered'])for(const bloomBits of [0,10])for(const seed of [1,2,3]){
  const db=new S.LSM(cfg({policy,bloomBits,M:50,fileRecs:50,base:100})),ref=new Map(),r=S.lcg(seed);
  for(let i=0;i<6000;i++){const k=r()%700;if(r()%6===0){db.del(k);ref.set(k,false);}else{db.put(k);ref.set(k,true);}}
  let ok=true;for(let k=0;k<700;k++){const g=db.get(k).found,e=ref.get(k)===true;if(g!==e){ok=false;break;}}
  db.flush();for(let k=0;k<700&&ok;k++){if(db.get(k).found!==(ref.get(k)===true))ok=false;}
  chk(`${policy} bloom=${bloomBits} seed=${seed}: every key reads correctly (put/delete/overwrite), before and after a flush`,ok);
  if(policy==='leveled'){
    const lv=db.levels;let inv=true;
    lv.forEach(l=>{for(let i=1;i<l.length;i++)if(l[i].min<=l[i-1].max)inv=false;});
    for(let i=0;i<lv.length;i++){let t=0;lv[i].forEach(f=>t+=f.n);if(t>db.target(i))inv=false;}
    db.allRuns().forEach(f=>{for(let i=1;i<f.n;i++)if(f.keys[i]<=f.keys[i-1])inv=false;});
    chk(`leveled invariants (L>=1 non-overlapping, within target size, runs sorted) seed=${seed}`,inv&&db.L0.length<db.c.l0Trigger);
  }
}
// ---------- calibration against real RocksDB (hashed random keys; 3 seeds; tolerance: -25%/+25%, and -35%/+35% for the smallest size)
const mt=R.leveled_T10_random_write_amp.memtables;
for(const [m,rng] of Object.entries(mt)){
  const was=[1,2,3].map(sd=>S.runWorkload(cfg(),{keys:'random',n:Math.round(m*M),seed:sd}).stats().wa),avg=was.reduce((a,b)=>a+b)/3,tol=m<10?[0.65,1.35]:[0.75,1.25];
  chk(`leveled T=10 at ${m} memtables: model WA ${avg.toFixed(2)} within tolerance of real ${rng.join('-')}`,within(avg,rng,tol[0],tol[1]));
}
const wT4=[1,2,3].map(sd=>S.runWorkload(cfg({T:4}),{keys:'random',n:51500,seed:sd}).stats().wa).reduce((a,b)=>a+b)/3;
chk(`leveled T=4: model WA ${wT4.toFixed(2)} within +-25% of real ${R.leveled_T4_random_51_5_memtables.join('-')}`,within(wT4,R.leveled_T4_random_51_5_memtables,0.75,1.25));
const seq=S.runWorkload(cfg(),{keys:'sequential',n:25700}).stats();
chk(`sequential keys: model WA ${seq.wa.toFixed(2)} ~ real ${R.leveled_sequential_25_7_memtables[0]} (trivial moves)`,seq.wa<=1.15&&seq.trivialMoves>0);
// write amplification grows with the number of levels
const g=[6.4,25.7,103].map(m=>S.runWorkload(cfg(),{keys:'random',n:Math.round(m*M),seed:1}).stats().wa);
chk('leveled WA grows with data size (more levels): '+g.map(x=>x.toFixed(2)).join(' < '),g[0]<g[1]&&g[1]<g[2]);
// ---------- overwrite workload: space amplification, write amplification, tiered vs leveled
const ow={keys:'overwrite',n:12900,passes:5,sampleEvery:1,seed:5};
const L=S.runWorkload(cfg(),ow),T6=S.runWorkload(cfg({policy:'tiered',tierTrigger:6}),ow),T4=S.runWorkload(cfg({policy:'tiered',tierTrigger:4}),ow);
const ls=L.stats(),lt=L.spaceTrace(),ts6=T6.spaceTrace(),ts4=T4.spaceTrace();
chk(`leveled overwrite: model space amp ${ls.spaceAmp.toFixed(2)} within +-15% of real ${R.overwrite_5_passes.leveled.space_amp.join('-')}`,within(ls.spaceAmp,R.overwrite_5_passes.leveled.space_amp,0.85,1.15));
chk(`leveled overwrite: model WA ${ls.wa.toFixed(2)} within +-15% of real ${R.overwrite_5_passes.leveled.write_amp.join('-')}`,within(ls.wa,R.overwrite_5_passes.leveled.write_amp,0.85,1.15));
chk('tiered writes less than leveled on random keys (model and real agree on the ordering)',S.runWorkload(cfg({policy:'tiered'}),{keys:'random',n:51500,seed:1}).stats().wa<S.runWorkload(cfg(),{keys:'random',n:51500,seed:1}).stats().wa&&R.universal_random_51_5_memtables[1]<R.leveled_T10_random_write_amp.memtables['51.5'][0]);
chk('tiered writes less than leveled on the overwrite workload',T4.stats().wa<ls.wa&&T6.stats().wa<ls.wa);
chk(`tiered has a higher PEAK space amplification (${ts4.peak.toFixed(2)}, ${ts6.peak.toFixed(2)}) than leveled (${lt.peak.toFixed(2)})`,ts4.peak>lt.peak&&ts6.peak>lt.peak);
// ---------- reads: bloom filters and a small cache, absent keys inside the stored range (odd probes against even stored keys)
function reads(c){const db=S.runWorkload(c,{keys:'overwrite',n:12900,passes:5,seed:5}),cached=db.cachedSet(),r=S.lcg(9),N=20000,o={ac:0,ar:0,pr:0};
  for(let i=0;i<N;i++){const a=db.get(2*(r()%12900)+1,cached),p=db.get(2*(r()%12900),cached);o.ac+=a.consulted;o.ar+=a.reads;o.pr+=p.reads;}return {absent:o.ar/N,present:o.pr/N,consulted:o.ac/N,runs:db.stats().sortedRuns};}
const cache=Math.round(0.15*12900),A=reads(cfg({cacheRecs:cache})),B=reads(cfg({cacheRecs:cache,bloomBits:10})),TA=reads(cfg({policy:'tiered',tierTrigger:6,cacheRecs:cache})),TB=reads(cfg({policy:'tiered',tierTrigger:6,cacheRecs:cache,bloomBits:10}));
const rr=R.reads_block_cache_misses_per_lookup;
chk(`leveled, no filter: absent reads ${A.absent.toFixed(2)} and present ${A.present.toFixed(2)} inside the real ranges (${rr.leveled.absent.join('-')}, ${rr.leveled.present.join('-')}) +-25%`,within(A.absent,rr.leveled.absent,0.75,1.25)&&within(A.present,rr.leveled.present,0.75,1.25));
chk(`leveled, bloom: absent reads ${B.absent.toFixed(3)} <= 0.03 (real ${rr.leveled.absent_bloom[0]}) and present ${B.present.toFixed(2)} near real ${rr.leveled.present_bloom[0]}`,B.absent<=0.03&&Math.abs(B.present-rr.leveled.present_bloom[0])<0.15);
chk('a bloom filter cuts absent-key reads by more than 20x in both policies',A.absent/Math.max(B.absent,1e-9)>20&&TA.absent/Math.max(TB.absent,1e-9)>20);
chk(`size-tiered reads more runs than leveled without filters (${TA.absent.toFixed(1)} vs ${A.absent.toFixed(1)}); real universal ${rr.universal.absent[0]} vs leveled ${rr.leveled.absent.join('-')}`,TA.absent>A.absent&&rr.universal.absent[0]>rr.leveled.absent[0]);
const keys=Int32Array.from({length:10000},(_,i)=>i*3),bl=new S.Bloom(keys,10);let fp=0,t=0;for(let k=1;k<30000;k+=3){t++;if(bl.mayContain(k))fp++;}
chk(`bloom filter false-positive rate ${(100*fp/t).toFixed(2)}% is near the ~0.8% theory for 10 bits per key`,fp/t>0.004&&fp/t<0.02);
let nofn=true;for(let i=0;i<keys.length;i++)if(!bl.mayContain(keys[i]))nofn=false;chk('a bloom filter never gives a false negative',nofn);
chk('deterministic given the seed',JSON.stringify(S.runWorkload(cfg(),{keys:'random',n:20000,seed:4}).stats())===JSON.stringify(S.runWorkload(cfg(),{keys:'random',n:20000,seed:4}).stats()));
console.log(bad?bad+' failures':'lsm model: all properties hold'); process.exit(bad?1:0);
