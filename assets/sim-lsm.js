/* A miniature but REAL log-structured merge tree (Lessons 0019, 0020, 0022).
   It stores only keys (integers), version numbers and tombstone flags, but every flush, compaction, bloom-filter probe and
   read path is actually executed, so the counters are measurements of this algorithm, not formulas.
   Units are RECORDS (one record ~ 108 bytes in the calibration runs). Compare with experiments/storage/ (real RocksDB 9.x via rocksdict).
   Policies: 'leveled' (L0 files overlap; L>=1 non-overlapping; round-robin file picking; trivial moves) and
             'tiered'  (classic size-tiered buckets, as in Cassandra's STCS; the real RocksDB 'universal' style differs in details).
   This is a teaching model, not RocksDB: it omits value storage, block formats, compression, multi-threading and many heuristics. */
(function(){
  function mix(x){x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;return x>>>0;}
  function Bloom(keys,bitsPerKey){
    this.m=Math.max(64,keys.length*bitsPerKey);this.k=Math.max(1,Math.round(0.69*bitsPerKey));this.bits=new Uint8Array((this.m+7)>>3);
    for(var i=0;i<keys.length;i++){var h1=mix(keys[i]),h2=mix(keys[i]+0x9e3779b9)|1;for(var j=0;j<this.k;j++){var b=(h1+Math.imul(j,h2))>>>0;b%=this.m;this.bits[b>>3]|=1<<(b&7);}}
  }
  Bloom.prototype.mayContain=function(key){var h1=mix(key),h2=mix(key+0x9e3779b9)|1;for(var j=0;j<this.k;j++){var b=((h1+Math.imul(j,h2))>>>0)%this.m;if(!(this.bits[b>>3]&(1<<(b&7))))return false;}return true;};
  var NEXT_ID=1;
  function SST(keys,vers,dels,bits){this.id=NEXT_ID++;this.keys=keys;this.vers=vers;this.dels=dels;this.n=keys.length;this.min=keys[0];this.max=keys[this.n-1];this.bloom=bits>0?new Bloom(keys,bits):null;}
  SST.prototype.find=function(key){var lo=0,hi=this.n-1;while(lo<=hi){var mid=(lo+hi)>>1,k=this.keys[mid];if(k===key)return mid;if(k<key)lo=mid+1;else hi=mid-1;}return -1;};
  /* merge sorted SST list (newest first) into arrays; newest version of each key wins; optionally drop tombstones */
  function mergeRuns(runs,dropTombstones){
    var pos=runs.map(function(){return 0;}),outK=[],outV=[],outD=[];
    for(;;){
      var best=-1,bk=Infinity;
      for(var i=0;i<runs.length;i++){if(pos[i]<runs[i].n){var k=runs[i].keys[pos[i]];if(k<bk){bk=k;best=i;}}}   /* first (newest) run wins ties */
      if(best<0)break;
      var v=runs[best].vers[pos[best]],d=runs[best].dels[pos[best]];
      for(var j=0;j<runs.length;j++){if(pos[j]<runs[j].n&&runs[j].keys[pos[j]]===bk)pos[j]++;}
      if(d&&dropTombstones)continue;
      outK.push(bk);outV.push(v);outD.push(d);
    }
    return {keys:Int32Array.from(outK),vers:Int32Array.from(outV),dels:Uint8Array.from(outD)};
  }
  function mergeRunsByVersion(runs,dropTombstones){
    var pos=runs.map(function(){return 0;}),outK=[],outV=[],outD=[];
    for(;;){
      var bk=Infinity,i;for(i=0;i<runs.length;i++)if(pos[i]<runs[i].n&&runs[i].keys[pos[i]]<bk)bk=runs[i].keys[pos[i]];
      if(bk===Infinity)break;
      var bv=-1,bd=0;
      for(i=0;i<runs.length;i++){if(pos[i]<runs[i].n&&runs[i].keys[pos[i]]===bk){if(runs[i].vers[pos[i]]>bv){bv=runs[i].vers[pos[i]];bd=runs[i].dels[pos[i]];}pos[i]++;}}
      if(bd&&dropTombstones)continue;
      outK.push(bk);outV.push(bv);outD.push(bd);
    }
    return {keys:Int32Array.from(outK),vers:Int32Array.from(outV),dels:Uint8Array.from(outD)};
  }
  function split(m,fileRecs,bits){var out=[];for(var s=0;s<m.keys.length;s+=fileRecs)out.push(new SST(m.keys.slice(s,s+fileRecs),m.vers.slice(s,s+fileRecs),m.dels.slice(s,s+fileRecs),bits));return out;}
  function sum(a){var t=0;for(var i=0;i<a.length;i++)t+=a[i].n;return t;}

  function LSM(cfg){
    this.c=Object.assign({policy:'leveled',M:1000,fileRecs:1000,base:2000,T:10,l0Trigger:4,bloomBits:0,cacheRecs:0,tierTrigger:4,sizeRatio:1.0,maxSpaceAmpPct:200},cfg||{});
    this.mem=new Map();this.seq=0;this.L0=[];this.levels=[];this.runs=[];          /* leveled: L0+levels; tiered: runs (newest first) */
    this.ptr=[];
    this.st={user:0,wal:0,flush:0,cw:0,cr:0,compactions:0,trivial:0};
  }
  LSM.prototype.put=function(key){this.seq++;this.mem.set(key,{v:this.seq,d:0});this.st.user++;this.st.wal++;if(this.mem.size>=this.c.M)this.flush();};
  LSM.prototype.del=function(key){this.seq++;this.mem.set(key,{v:this.seq,d:1});this.st.user++;this.st.wal++;if(this.mem.size>=this.c.M)this.flush();};
  LSM.prototype.flush=function(){
    if(!this.mem.size)return;var ks=Array.from(this.mem.keys()).sort(function(a,b){return a-b;}),n=ks.length,K=new Int32Array(n),V=new Int32Array(n),D=new Uint8Array(n);
    for(var i=0;i<n;i++){var e=this.mem.get(ks[i]);K[i]=ks[i];V[i]=e.v;D[i]=e.d;}
    this.mem=new Map();var f=new SST(K,V,D,this.c.bloomBits);this.st.flush+=n;
    if(this.c.policy==='leveled')this.L0.unshift(f);else this.runs.push(f);
    this.compact();
  };
  LSM.prototype.lvl=function(i){while(this.levels.length<=i){this.levels.push([]);this.ptr.push(-Infinity);}return this.levels[i];};
  LSM.prototype.target=function(i){return this.c.base*Math.pow(this.c.T,i);};          /* i = 0 means L1 */
  function overlaps(files,lo,hi){return files.filter(function(f){return !(f.max<lo||f.min>hi);});}
  LSM.prototype.compact=function(){this.c.policy==='leveled'?this.compactLeveled():this.compactTiered();};
  LSM.prototype.compactLeveled=function(){
    var guard=0;
    for(;;){
      if(++guard>100000)throw new Error('compaction did not settle');
      if(this.L0.length>=this.c.l0Trigger){
        var inputs=this.L0.slice(),lo=Math.min.apply(null,inputs.map(function(f){return f.min;})),hi=Math.max.apply(null,inputs.map(function(f){return f.max;})),l1=this.lvl(0),ov=overlaps(l1,lo,hi);
        var sorted=inputs.slice().sort(function(a,b){return a.min-b.min;}),disjoint=true;for(var i=1;i<sorted.length;i++)if(sorted[i].min<=sorted[i-1].max)disjoint=false;
        if(disjoint&&!ov.length){this.moveFiles(inputs,0);this.L0=[];this.st.trivial++;continue;}
        this.mergeInto(inputs.concat(ov),0,0,ov);this.L0=[];continue;                 /* newest first: L0 (newest first) then L1 */
      }
      var did=false;
      for(var i=0;i<this.levels.length;i++){
        var cur=this.levels[i];
        if(sum(cur)>this.target(i)){
          var p=this.ptr[i],pick=null;for(var j=0;j<cur.length;j++){if(cur[j].min>p){pick=cur[j];break;}}if(!pick)pick=cur[0];this.ptr[i]=pick.max;
          var nxt=this.lvl(i+1),ov2=overlaps(nxt,pick.min,pick.max);
          if(!ov2.length){this.levels[i]=cur.filter(function(f){return f!==pick;});this.insertSorted(i+1,[pick]);this.st.trivial++;}
          else{this.levels[i]=cur.filter(function(f){return f!==pick;});this.mergeInto([pick].concat(ov2),i+1,i+1,ov2);}
          did=true;break;
        }
      }
      if(!did)return;
    }
  };
  LSM.prototype.insertSorted=function(i,files){var l=this.lvl(i);Array.prototype.push.apply(l,files);l.sort(function(a,b){return a.min-b.min;});};
  LSM.prototype.moveFiles=function(files,i){this.insertSorted(i,files);};
  LSM.prototype.mergeInto=function(inputs,_unused,dest,removeFromDest){
    var bottom=true;for(var i=dest+1;i<this.levels.length;i++)if(this.levels[i].length)bottom=false;
    var m=mergeRuns(inputs,bottom),read=0;for(var k=0;k<inputs.length;k++)read+=inputs[k].n;
    this.st.cr+=read;this.st.cw+=m.keys.length;this.st.compactions++;
    var l=this.lvl(dest);this.levels[dest]=l.filter(function(f){return removeFromDest.indexOf(f)<0;});
    this.insertSorted(dest,split(m,this.c.fileRecs,this.c.bloomBits));
  };
  /* Classic size-tiered compaction (as in Cassandra's STCS): group runs of similar size into buckets; when a bucket holds
     tierTrigger or more runs, merge them into one larger run. Runs need not be adjacent in age, so every record carries a version
     number and reads take the highest version they find. */
  LSM.prototype.compactTiered=function(){
    var c=this.c,guard=0;
    for(;;){
      if(++guard>100000)throw new Error('compaction did not settle');
      var r=this.runs.slice().sort(function(a,b){return a.n-b.n;}),buckets=[],cur=null;
      for(var i=0;i<r.length;i++){
        var f=r[i];
        if(cur&&f.n>=0.5*(cur.total/cur.runs.length)&&f.n<=1.5*(cur.total/cur.runs.length)){cur.runs.push(f);cur.total+=f.n;}
        else{cur={runs:[f],total:f.n};buckets.push(cur);}
      }
      var pick=null;for(var b=0;b<buckets.length;b++){if(buckets[b].runs.length>=c.tierTrigger){pick=buckets[b];break;}}   /* smallest-size bucket first */
      if(!pick)return;
      this.mergeSelected(pick.runs.slice(0,32));
    }
  };
  LSM.prototype.mergeSelected=function(take){
    var bottom=(take.length===this.runs.length),sorted=take.slice().sort(function(a,b){return b.vers[b.n-1]-a.vers[a.n-1];});  /* mergeRuns lets earlier entries win ties: put the newest data first */
    var m=mergeRunsByVersion(take,bottom),read=sum(take);
    this.st.cr+=read;this.st.cw+=m.keys.length;this.st.compactions++;
    var keep=this.runs.filter(function(f){return take.indexOf(f)<0;});
    this.runs=keep.concat(split(m,Infinity,this.c.bloomBits));
  };
  LSM.prototype.settle=function(){this.flush();};
  /* ---- reads ---- */
  LSM.prototype.allRuns=function(){ /* newest first, as the read path consults them */
    if(this.c.policy==='tiered')return this.runs.slice();
    var out=this.L0.slice();for(var i=0;i<this.levels.length;i++)out=out.concat(this.levels[i]);return out;
  };
  LSM.prototype.cachedSet=function(){ /* smallest runs are assumed to live in the cache, up to cacheRecs records */
    var all=this.allRuns().slice().sort(function(a,b){return a.n-b.n;}),left=this.c.cacheRecs,set={};
    for(var i=0;i<all.length;i++){if(all[i].n<=left){set[all[i].id]=1;left-=all[i].n;}else break;}
    return set;
  };
  /* returns {found, consulted, reads}: consulted = sorted runs whose key range and filter did not rule the key out;
     reads = consulted runs that are not cached (a stand-in for block reads that miss the block cache) */
  LSM.prototype.get=function(key,cached){
    var m=this.mem.get(key);if(m)return {found:!m.d,consulted:0,reads:0,fromMemtable:true};
    cached=cached||this.cachedSet();var consulted=0,reads=0,run;
    var runs=this.c.policy==='tiered'?this.runs:null;
    var check=function(f){
      if(key<f.min||key>f.max)return null;
      if(f.bloom&&!f.bloom.mayContain(key))return null;
      consulted++;if(!cached[f.id])reads++;
      var i=f.find(key);return i>=0?{found:!f.dels[i],consulted:consulted,reads:reads}:null;
    };
    if(runs){ /* size-tiered: runs are not age-ordered, so every candidate must be consulted and the highest version wins */
      var bestV=-1,bestFound=false;
      for(var a=0;a<runs.length;a++){var f0=runs[a];
        if(key<f0.min||key>f0.max)continue; if(f0.bloom&&!f0.bloom.mayContain(key))continue;
        consulted++;if(!cached[f0.id])reads++;var ix=f0.find(key);if(ix>=0&&f0.vers[ix]>bestV){bestV=f0.vers[ix];bestFound=!f0.dels[ix];}}
      return {found:bestFound,consulted:consulted,reads:reads};
    }
    for(var b=0;b<this.L0.length;b++){var r2=check(this.L0[b]);if(r2)return r2;}
    for(var i=0;i<this.levels.length;i++){
      var l=this.levels[i],lo=0,hi=l.length-1,f=null;                                  /* binary search the one file whose range could hold the key */
      while(lo<=hi){var mid=(lo+hi)>>1;if(l[mid].max<key)lo=mid+1;else if(l[mid].min>key)hi=mid-1;else{f=l[mid];break;}}
      if(f){var r3=check(f);if(r3)return r3;}
    }
    return {found:false,consulted:consulted,reads:reads};
  };
  LSM.prototype.stats=function(){
    var all=this.allRuns(),stored=sum(all)+this.mem.size,live=new Set(),dead=new Set();
    var runs=all;for(var i=0;i<runs.length;i++){var f=runs[i];for(var j=0;j<f.n;j++){var k=f.keys[j];if(dead.has(k)||live.has(k))continue;if(f.dels[j])dead.add(k);else live.add(k);}}
    this.mem.forEach(function(e,k){if(e.d)dead.add(k);else if(!dead.has(k))live.add(k);});
    var s=this.st,flushedPlusCompact=s.flush+s.cw;
    return {user:s.user,wa:s.user?flushedPlusCompact/s.user:0,waTotal:s.user?(flushedPlusCompact+s.wal)/s.user:0,
            runsCount:all.length,sortedRuns:this.c.policy==='tiered'?this.runs.length:(this.L0.length+this.levels.filter(function(l){return l.length;}).length),
            levelSizes:this.c.policy==='tiered'?this.runs.map(function(r){return r.n;}):[this.L0.length+' files in L0'].concat(this.levels.map(function(l){return sum(l);})),
            stored:stored,live:live.size,spaceAmp:live.size?stored/live.size:0,compactionReads:s.cr,compactionWrites:s.cw,trivialMoves:s.trivial};
  };
  /* convenience used by labs and tests */
  function lcg(seed){var s=seed>>>0;return function(){s=(Math.imul(s,1664525)+1013904223)>>>0;return s;};}
  function runWorkload(cfg,w){
    var db=new LSM(cfg),r=lcg(w.seed||1),i;db.sampleKeys=[];var skip=Math.max(1,Math.floor((w.n||1)/4000));
    if(w.collect){var _put=db.put;db.put=function(k){if(db.st.user%skip===0)db.sampleKeys.push(k);_put.call(db,k);};}
    if(w.sampleEvery){ /* track space amplification over the run: operators provision for the peak, not the final value */
      var origFlush=db.flush,count=0,peak=0,sumAmp=0,samples=0;
      db.flush=function(){origFlush.call(db);if(++count%w.sampleEvery===0){var s=db.stats();if(s.live>0){peak=Math.max(peak,s.spaceAmp);sumAmp+=s.spaceAmp;samples++;}}};
      db.spaceTrace=function(){return {peak:peak,mean:samples?sumAmp/samples:0,samples:samples};};
    }
    if(w.keys==='sequential'){for(i=0;i<w.n;i++)db.put(i);}
    else if(w.keys==='overwrite'){ /* w.passes passes over the same w.n keys in shuffled order */
      var ks=[];for(i=0;i<w.n;i++)ks.push(i);
      for(var p=0;p<w.passes;p++){var a=ks.slice(),rr=lcg((w.seed||1)+p*7919);for(i=a.length-1;i>0;i--){var j=rr()%(i+1),t=a[i];a[i]=a[j];a[j]=t;}for(i=0;i<a.length;i++)db.put(2*a[i]);}
    }
    else{var sd=(w.seed||1)>>>0;for(i=0;i<w.n;i++)db.put(mix((Math.imul(i+1,2654435761)^Math.imul(sd,0x9e3779b9))>>>0)&0x3fffffff);}   /* a proper hash of the counter: uniformly random keys */
    db.flush();return db;
  }
  window.LSMSim={LSM:LSM,Bloom:Bloom,runWorkload:runWorkload,lcg:lcg,mergeRuns:mergeRuns};
})();
