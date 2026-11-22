/* Interactive widgets for Module 3 (Lessons 19-22). They only drive the tested models in sim-lsm.js and sim-btree.js.
   Real measurements shown beside the models come from experiments/storage/measurements.json (copied here as constants;
   tools/test-ui-constants.js checks they have not drifted). */
(function(){
  var REAL={
    lsmWA:{'6.4':'2.27','25.7':'5.0 to 5.3','51.5':'5.3 to 5.8','103':'6.7 to 6.8'},
    btreeWrites:[{pool:'8 MB (22% of the table)',frac:0.22,pages:'97,051 to 97,718',phys:'140 to 141x'},{pool:'16 MB (43%)',frac:0.43,pages:'48,771 to 48,958',phys:'72x'},
                 {pool:'32 MB (86%)',frac:0.86,pages:'7,421 to 7,960',phys:'13x'},{pool:'128 MB (346%)',frac:3.46,pages:'2,773 to 2,926',phys:'5.2 to 5.4x'}]
  };
  function $(id){return document.getElementById(id);}
  function btn(host,items,get,set){host.innerHTML='';items.forEach(function(it){var b=document.createElement('button');b.className='btn ghost'+(get()===it[0]?' sel':'');b.textContent=it[1];b.onclick=function(){set(it[0]);};host.appendChild(b);});}
  function f2(x){return (Math.round(x*100)/100).toFixed(2);}
  function bar(label,v,max,color){return '<div class="ev" style="gap:.6rem;align-items:center"><span class="t" style="min-width:7.5rem">'+label+'</span><span style="display:inline-block;height:.7rem;background:'+(color||'var(--accent)')+';width:'+Math.max(1,Math.round(260*v/Math.max(max,1)))+'px"></span><span>'+v.toLocaleString()+'</span></div>';}
  function lsmCfg(o){return Object.assign({M:1000,fileRecs:1000,base:2000,T:10,l0Trigger:4,tierTrigger:4},o||{});}

  document.addEventListener('DOMContentLoaded',function(){
    /* ---------------- Lesson 19: watch a write go down the tree ---------------- */
    var a=$('sim-lsm');
    if(a&&window.LSMSim){
      var S=window.LSMSim,st={policy:'leveled',keys:'random'};
      a.innerHTML='<h4>Interactive &middot; A real miniature LSM-tree</h4><p>Writes go to a memtable of 1,000 records. Each full memtable is flushed as a sorted run and compaction merges runs. Everything below is counted by running the algorithm.</p>'+
        '<div class="row" id="ls-p"></div><div class="row" id="ls-k"></div>'+
        '<div class="row"><label>Data written: <b id="ls-nv"></b> memtables <input id="ls-n" type="range" min="5" max="100" value="52"></label><label>Size ratio T (leveled): <b id="ls-tv"></b> <input id="ls-t" type="range" min="2" max="20" value="10"></label></div><div id="ls-out"></div>';
      function draw(){
        btn($('ls-p'),[['leveled','Leveled compaction'],['tiered','Size-tiered compaction']],function(){return st.policy;},function(v){st.policy=v;draw();});
        btn($('ls-k'),[['random','Random keys'],['sequential','Keys in order']],function(){return st.keys;},function(v){st.keys=v;draw();});
        var mt=+$('ls-n').value,T=+$('ls-t').value;$('ls-nv').textContent=mt;$('ls-tv').textContent=T;
        var db=S.runWorkload(lsmCfg({policy:st.policy,T:T}),{keys:st.keys,n:mt*1000,seed:1}),s=db.stats(),max=1;
        var rows=st.policy==='leveled'?[[ 'L0 ('+db.L0.length+' files)',db.L0.reduce(function(t,f){return t+f.n;},0)]].concat(db.levels.map(function(l,i){return ['L'+(i+1),l.reduce(function(t,f){return t+f.n;},0)];})).filter(function(r){return r[1]>0;}):db.runs.map(function(r,i){return ['run '+(i+1),r.n];}).sort(function(x,y){return y[1]-x[1];});
        rows.forEach(function(r){max=Math.max(max,r[1]);});
        $('ls-out').innerHTML='<table><tr><th>Records written by the application</th><th>Write amplification</th><th>Sorted runs to search</th><th>Compactions</th><th>Moves without rewriting</th></tr><tr><td>'+s.user.toLocaleString()+'</td><td><b>'+f2(s.wa)+'&times;</b></td><td>'+s.sortedRuns+'</td><td>'+db.st.compactions+'</td><td>'+db.st.trivial+'</td></tr></table>'+
          '<div style="margin:.4rem 0">'+rows.map(function(r){return bar(r[0],r[1],max);}).join('')+'</div>'+
          '<p style="color:var(--muted)">Write amplification here = (records flushed + records rewritten by compaction) &divide; records the application wrote. Real RocksDB, leveled, ratio 10, random keys, same memory ratios: 2.27 at 6 memtables, 5.0 to 5.3 at 26, 5.3 to 5.8 at 52, 6.7 to 6.8 at 103. Keys in order: 1.06 (real) because files move down without being rewritten.</p>';
      }
      ['ls-n','ls-t'].forEach(function(id){$(id).oninput=draw;});draw();
    }
    /* ---------------- Lesson 20: the three amplifications ---------------- */
    var b=$('sim-compaction');
    if(b&&window.LSMSim){
      var S2=window.LSMSim,w={wl:'overwrite',bloom:false};
      b.innerHTML='<h4>Interactive &middot; Write, space and read amplification, side by side</h4><div class="row" id="cp-w"></div>'+
        '<div class="row"><label class="opt"><input type="checkbox" id="cp-b"> a 10-bits-per-key bloom filter on every run</label><label>Cache: <b id="cp-cv"></b> of the data <input id="cp-c" type="range" min="0" max="50" value="15"></label></div><div id="cp-out"></div>';
      var POL=[['Leveled, ratio 10',{T:10}],['Leveled, ratio 4',{T:4}],['Size-tiered, merge at 4 runs',{policy:'tiered',tierTrigger:4}],['Size-tiered, merge at 6 runs',{policy:'tiered',tierTrigger:6}]];
      function wload(){return w.wl==='overwrite'?{keys:'overwrite',n:12900,passes:5,seed:5,sampleEvery:2,collect:true}:w.wl==='random'?{keys:'random',n:51500,seed:1,sampleEvery:3,collect:true}:{keys:'sequential',n:51500,seed:1,sampleEvery:3,collect:true};}
      function draw2(){
        btn($('cp-w'),[['overwrite','Update-heavy: 12,900 keys, each written 5 times'],['random','Random inserts, 51,500 distinct keys'],['sequential','Inserts in key order']],function(){return w.wl;},function(v){w.wl=v;draw2();});
        var pct=+$('cp-c').value;$('cp-cv').textContent=pct+'%';w.bloom=$('cp-b').checked;
        var t='<table><tr><th>Policy</th><th>Write amp.</th><th>Peak space amp.</th><th>Sorted runs</th><th>Reads per lookup: key absent</th><th>key present</th></tr>';
        POL.forEach(function(p){
          var db=S2.runWorkload(lsmCfg(Object.assign({bloomBits:w.bloom?10:0},p[1])),wload()),s=db.stats(),tr=db.spaceTrace();
          db.c.cacheRecs=Math.round(s.live*pct/100);var cached=db.cachedSet(),r=S2.lcg(9),N=4000,ar=0,pr=0,hasAbsent=w.wl!=='sequential',sk=db.sampleKeys;
          for(var i=0;i<N;i++){
            if(hasAbsent){var ak=w.wl==='overwrite'?2*(r()%12900)+1:(r()&0x3fffffff)|0;ar+=db.get(ak,cached).reads;}
            pr+=db.get(sk[r()%sk.length],cached).reads;}
          t+='<tr><td>'+p[0]+'</td><td>'+f2(s.wa)+'&times;</td><td>'+f2(tr.peak)+'&times;</td><td>'+s.sortedRuns+'</td><td>'+(hasAbsent?f2(ar/N):'n/a')+'</td><td>'+f2(pr/N)+'</td></tr>';});
        $('cp-out').innerHTML=t+'</table><p style="color:var(--muted)">Reads = sorted runs that must be read from disk after the cache (the smallest runs are assumed cached first). Real RocksDB on the update-heavy workload: write amp. 4.6 to 4.9 (leveled) vs 3.8 to 4.0 (universal); space amp. 1.19 to 1.27 vs 1.62 to 1.82; absent-key reads without a filter 1.3 to 2.1 (leveled) vs 3.3 (universal), with a filter 0.01 to 0.04.</p>';
      }
      $('cp-b').onchange=draw2;$('cp-c').onchange=draw2;draw2();
    }
    /* ---------------- Lesson 21: the buffer pool decides what a B-tree write costs ---------------- */
    var c=$('sim-btree');
    if(c&&window.BTreeSim){
      var BT=window.BTreeSim,cs={order:'random'},base={};
      function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
      function build(order,pool,n){var t=new BT.BTree({poolPages:pool}),i;if(order==='sequential'){for(i=1;i<=n;i++)t.insert(i);}else{var r=mulberry(1);for(i=0;i<n;i++)t.insert(Math.floor(r()*4294967296)+Math.floor(r()*1048576)*4294967296);}t.finish();return t;}
      c.innerHTML='<h4>Interactive &middot; A real B+tree with a buffer pool (200,000 rows of 108 bytes, 16 KB pages)</h4><div class="row" id="bt-k"></div>'+
        '<div class="row"><label>Buffer pool: <b id="bt-pv"></b> of the finished tree <input id="bt-p" type="range" min="1" max="7" value="3"></label></div><div id="bt-out"></div><div id="bt-real"></div>';
      var FR=[0.1,0.22,0.43,0.86,1.5,3.46,10];
      function draw3(){
        btn($('bt-k'),[['random','Random keys'],['sequential','Keys in order']],function(){return cs.order;},function(v){cs.order=v;draw3();});
        var fr=FR[+$('bt-p').value-1];$('bt-pv').textContent=Math.round(fr*100)+'%';
        var unl=base[cs.order]||(base[cs.order]=build(cs.order,Infinity,200000)),pages=unl.leaves+unl.internals,t=build(cs.order,Math.max(8,Math.round(pages*fr)),200000),s=t.stats();
        $('bt-out').innerHTML='<table><tr><th>Height</th><th>Leaf pages</th><th>Leaf fill</th><th>Pool size</th><th>Page writes</th><th>Page reads</th><th>Page bytes written &divide; row bytes</th></tr><tr><td>'+s.height+'</td><td>'+s.leaves.toLocaleString()+'</td><td>'+Math.round(100*s.fill)+'%</td><td>'+Math.max(8,Math.round(pages*fr)).toLocaleString()+' pages</td><td><b>'+s.pageWrites.toLocaleString()+'</b></td><td>'+s.pageReads.toLocaleString()+'</td><td><b>'+f2(s.pageWrites*16384/(200000*108))+'&times;</b></td></tr></table>'+
          '<p style="color:var(--muted)">Random keys touch a random leaf, so once the leaves no longer fit, almost every insert evicts a dirty page. Keys in order only ever touch the last leaf, so the pool barely matters.</p>';
      }
      $('bt-p').onchange=draw3;draw3();
      var rt='<h4 style="margin-top:1rem">The same experiment on real InnoDB 8.0.46 (random keys, same rows; a 37 MB table)</h4><table><tr><th>Buffer pool</th><th>Page writes, real</th><th>Page writes, this model</th><th>Real bytes written to disk &divide; row bytes</th></tr>';
      setTimeout(function(){
        var unl=base.random||(base.random=build('random',Infinity,200000)),pages=unl.leaves+unl.internals;
        REAL.btreeWrites.forEach(function(r){var s=build('random',Math.round(pages*r.frac*(2363/pages)),200000).stats();rt+='<tr><td>'+r.pool+'</td><td>'+r.pages+'</td><td>'+s.pageWrites.toLocaleString()+'</td><td>'+r.phys+'</td></tr>';});
        $('bt-real').innerHTML=rt+'</table><p style="color:var(--muted)">The model underestimates InnoDB (it is an ideal LRU cache; InnoDB also flushes in the background and loses some cache to other uses), but it reproduces the shape: writes collapse once the pool covers the tree. &ldquo;Real bytes written&rdquo; also includes the doublewrite pages and the redo log.</p>';
      },30);
    }
    /* ---------------- Lesson 22: same workload, two engines ---------------- */
    var d=$('sim-engines');
    if(d&&window.LSMSim&&window.BTreeSim){
      var S4=window.LSMSim,BT4=window.BTreeSim,es={order:'random'},N4=100000;
      function mb(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
      d.innerHTML='<h4>Interactive &middot; One workload, three engines</h4><p>100,000 records of 108 bytes are inserted, then read back. &ldquo;Memory&rdquo; buys a buffer pool for the B-tree and a block cache for the LSM-trees (whose memtable is a fixed 2% of the data).</p>'+
        '<div class="row" id="en-k"></div><div class="row"><label>Memory: <b id="en-mv"></b> of the data <input id="en-m" type="range" min="1" max="6" value="3"></label><label class="opt"><input type="checkbox" id="en-b" checked> bloom filters on the LSM-trees</label></div><div id="en-out"></div>';
      var MEM=[0.02,0.05,0.1,0.25,0.5,1.0];
      function keysFor(order){if(order==='sequential'){var a=[];for(var i=1;i<=N4;i++)a.push(i);return a;}var r=mb(3),k=[];for(var j=0;j<N4;j++)k.push(Math.floor(r()*4294967296)+Math.floor(r()*1048576)*4294967296);return k;}
      function draw4(){
        btn($('en-k'),[['random','Random keys'],['sequential','Keys in order']],function(){return es.order;},function(v){es.order=v;draw4();});
        var m=MEM[+$('en-m').value-1],bloom=$('en-b').checked?10:0;$('en-mv').textContent=Math.round(m*100)+'%';
        var keys=keysFor(es.order),logical=N4*108,rr=mb(11),probes=3000,i;
        /* B-tree */
        var u=new BT4.BTree({poolPages:Infinity});keys.forEach(function(k){u.insert(k);});var pages=u.leaves+u.internals;
        var t=new BT4.BTree({poolPages:Math.max(8,Math.round(pages*m))});keys.forEach(function(k){t.insert(k);});t.finish();var s=t.stats(),r0=t.pool.reads;
        for(i=0;i<probes;i++)t.lookup(keys[Math.floor(rr()*keys.length)]);var presentB=(t.pool.reads-r0)/probes;r0=t.pool.reads;
        var absentB=null;if(es.order==='random'){for(i=0;i<probes;i++)t.lookup(Math.floor(rr()*4294967296)+Math.floor(rr()*1048576)*4294967296);absentB=(t.pool.reads-r0)/probes;}   /* an absent key must land INSIDE the key range, or it hits the always-cached last leaf */
        var rowsB={name:'B-tree (16 KB pages)',wa:s.pageWrites*16384/logical,pres:presentB,abs:absentB,space:pages*16384/logical};
        /* LSM-trees */
        function lsmRow(name,cfg){var db=new S4.LSM(Object.assign({M:2000,fileRecs:2000,base:4000,T:10,l0Trigger:4,bloomBits:bloom},cfg));keys.forEach(function(k){db.put(k&0x3fffffff);});db.flush();
          var st=db.stats();db.c.cacheRecs=Math.round(st.live*m);var cached=db.cachedSet(),p=0,a=0,r=mb(11);
          for(var q=0;q<probes;q++){p+=db.get(keys[Math.floor(r()*keys.length)]&0x3fffffff,cached).reads;if(es.order==='random')a+=db.get((Math.floor(r()*4294967296)&0x3fffffff)|0,cached).reads;}
          return {name:name,wa:st.wa,pres:p/probes,abs:es.order==='random'?a/probes:null,space:st.spaceAmp};}
        var rows=[rowsB,lsmRow('LSM-tree, leveled',{}),lsmRow('LSM-tree, size-tiered',{policy:'tiered',tierTrigger:4})];
        var cols=['wa','pres','abs','space'],low={};cols.forEach(function(c){low[c]=Math.min.apply(null,rows.filter(function(r){return r[c]!==null;}).map(function(r){return r[c];}));});
        function cell(r,c,fmt){var v=r[c];if(v===null)return '<td>n/a</td>';var good=Math.abs(v-low[c])<1e-9;return '<td'+(good?' style="background:var(--ok-soft)"':'')+'>'+fmt(v)+'</td>';}
        $('en-out').innerHTML='<table><tr><th>Engine</th><th>Bytes written &divide; bytes inserted</th><th>Disk reads per lookup: present key</th><th>absent key</th><th>Space used &divide; data</th></tr>'+
          rows.map(function(r){return '<tr><td>'+r.name+'</td>'+cell(r,'wa',function(v){return f2(v)+'&times;';})+cell(r,'pres',f2)+cell(r,'abs',f2)+cell(r,'space',function(v){return f2(v)+'&times;';})+'</tr>';}).join('')+'</table>'+
          '<p style="color:var(--muted)">Green = lowest in its column. B-tree writes count page writes only (no redo log or doublewrite); LSM writes count compaction output only (no WAL). Space for the LSM-trees is stored records &divide; live records. Move the memory slider and flip the key order to see which columns change.</p>';
      }
      $('en-m').onchange=draw4;$('en-b').onchange=draw4;draw4();
    }
  });
})();
