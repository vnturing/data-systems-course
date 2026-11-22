/* Lesson 0018: a real append-only log with an in-memory hash index (a "keydir"), in the style of Bitcask.
   Records are actual bytes with a CRC32, so crash recovery (scan, verify, stop at the first bad record) is genuinely executed.
   Record layout: crc32(4) | type(1) | keyLen(2) | valLen(4) | key | value.  Teaching model: single file, no hint files, no concurrency. */
(function(){
  var HDR=11,PUT=1,DEL=2,CRC_T=(function(){var t=new Uint32Array(256);for(var i=0;i<256;i++){var c=i;for(var k=0;k<8;k++)c=c&1?(0xEDB88320^(c>>>1)):(c>>>1);t[i]=c>>>0;}return t;})();
  function crc32(buf,from,to){var c=0xFFFFFFFF;for(var i=from;i<to;i++)c=CRC_T[(c^buf[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
  function enc(s){var a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i)&0xFF;return a;}
  function dec(b,from,to){var s='';for(var i=from;i<to;i++)s+=String.fromCharCode(b[i]);return s;}
  function Log(buf,len){this.buf=buf||new Uint8Array(1<<12);this.len=len||0;this.keydir=new Map();this.st={user:0,appended:0,compactRead:0,compactWrite:0,seeks:0};}
  Log.prototype.ensure=function(n){if(this.len+n>this.buf.length){var nb=new Uint8Array(Math.max(this.buf.length*2,this.len+n));nb.set(this.buf.subarray(0,this.len));this.buf=nb;}};
  Log.prototype.append=function(type,key,val){
    var k=enc(key),v=enc(val),n=HDR+k.length+v.length;this.ensure(n);var o=this.len,b=this.buf;
    b[o+4]=type;b[o+5]=(k.length>>8)&255;b[o+6]=k.length&255;b[o+7]=(v.length>>>24)&255;b[o+8]=(v.length>>>16)&255;b[o+9]=(v.length>>>8)&255;b[o+10]=v.length&255;
    b.set(k,o+HDR);b.set(v,o+HDR+k.length);var c=crc32(b,o+4,o+n);b[o]=(c>>>24)&255;b[o+1]=(c>>>16)&255;b[o+2]=(c>>>8)&255;b[o+3]=c&255;
    this.len+=n;this.st.appended+=n;return {off:o,size:n};
  };
  Log.prototype.put=function(key,val){var r=this.append(PUT,key,val);this.keydir.set(key,{off:r.off,size:r.size,vlen:val.length});this.st.user+=key.length+val.length;return r;};
  Log.prototype.del=function(key){var r=this.append(DEL,key,'');this.keydir.delete(key);this.st.user+=key.length;return r;};
  Log.prototype.get=function(key){var e=this.keydir.get(key);if(!e)return null;this.st.seeks++;var o=e.off,kl=(this.buf[o+5]<<8)|this.buf[o+6];return dec(this.buf,o+HDR+kl,o+HDR+kl+e.vlen);};   /* one seek: the keydir holds the offset */
  /* Rebuild the keydir by scanning. Stops at the first record that is incomplete or fails its checksum. */
  Log.recover=function(buf,len){
    var l=new Log(buf.slice(0,len),len),o=0,recs=0;l.len=0;
    while(o+HDR<=len){
      var kl=(buf[o+5]<<8)|buf[o+6],vl=((buf[o+7]<<24)|(buf[o+8]<<16)|(buf[o+9]<<8)|buf[o+10])>>>0,n=HDR+kl+vl;
      if(o+n>len)break;                                                         /* torn tail: record not fully on disk */
      var stored=((buf[o]<<24)|(buf[o+1]<<16)|(buf[o+2]<<8)|buf[o+3])>>>0;
      if(crc32(buf,o+4,o+n)!==stored)break;                                     /* corrupt record: stop trusting the log here */
      var key=dec(buf,o+HDR,o+HDR+kl);
      if(buf[o+4]===PUT)l.keydir.set(key,{off:o,size:n,vlen:vl});else l.keydir.delete(key);
      o+=n;recs++;
    }
    l.len=o;l.recovered={records:recs,validBytes:o,discardedBytes:len-o};return l;
  };
  /* Merge: rewrite only the live records into a fresh log (tombstones disappear because the whole log is rewritten). */
  Log.prototype.compact=function(){
    var self=this,nl=new Log(),keys=Array.from(this.keydir.keys());this.st.compactRead+=this.len;
    keys.forEach(function(k){nl.put(k,self.get(k));});
    nl.st.user=this.st.user;nl.st.appended=this.st.appended;nl.st.compactRead=this.st.compactRead;nl.st.compactWrite=this.st.compactWrite+nl.len;nl.st.seeks=this.st.seeks;
    nl.st.appended=this.st.appended;return nl;
  };
  Log.prototype.liveBytes=function(){var t=0;this.keydir.forEach(function(e){t+=e.size;});return t;};
  Log.prototype.stats=function(){var live=this.liveBytes();return {logBytes:this.len,liveBytes:live,spaceAmp:live?this.len/live:0,keys:this.keydir.size,
    writeAmp:this.st.user?(this.st.appended+this.st.compactWrite)/this.st.user:0,compactRead:this.st.compactRead,compactWrite:this.st.compactWrite};};
  window.LogSim={Log:Log,crc32:crc32,HDR:HDR};

  function lcg(seed){var s=seed>>>0;return function(){s=(Math.imul(s,1664525)+1013904223)>>>0;return s>>>8;};}
  document.addEventListener('DOMContentLoaded',function(){
    var h=document.getElementById('sim-log');if(!h)return;
    h.innerHTML='<h4>Interactive &middot; An append-only log with a hash index</h4>'+
      '<div class="row"><label>Distinct keys: <b id="lg-kv"></b> <input id="lg-k" type="range" min="50" max="2000" step="50" value="500"></label>'+
      '<label>Writes per key (overwrites): <b id="lg-wv"></b> <input id="lg-w" type="range" min="1" max="20" value="6"></label></div>'+
      '<div class="row"><button class="btn" id="lg-merge">Merge (compact) the log</button><button class="btn ghost" id="lg-reset">Rebuild</button></div><div id="lg-out"></div><div id="lg-crash"></div>';
    var db,log;
    function build(){var K=+document.getElementById('lg-k').value,W=+document.getElementById('lg-w').value,r=lcg(7);log=new Log();
      for(var i=0;i<K*W;i++){var k='key'+(r()%K);log.put(k,'v'+i+'-'+'x'.repeat(40+(r()%40)));}db=log;draw();}
    function draw(){
      var K=+document.getElementById('lg-k').value,W=+document.getElementById('lg-w').value;document.getElementById('lg-kv').textContent=K;document.getElementById('lg-wv').textContent=W;
      var s=db.stats(),mem=s.keys*(40+7);
      document.getElementById('lg-out').innerHTML='<table><tr><th>Log size</th><th>Live data in it</th><th>Space amplification</th><th>Keys in the hash index</th><th>Index memory (assuming ~47 B per entry: a parameter, not a measurement)</th><th>Write amplification so far</th></tr>'+
        '<tr><td>'+(s.logBytes/1024).toFixed(0)+' KB</td><td>'+(s.liveBytes/1024).toFixed(0)+' KB</td><td><b>'+s.spaceAmp.toFixed(2)+'&times;</b></td><td>'+s.keys.toLocaleString()+'</td><td>'+(mem/1024).toFixed(0)+' KB</td><td>'+s.writeAmp.toFixed(2)+'&times;</td></tr></table>'+
        '<p style="color:var(--muted)">One read = one lookup in the hash index + one seek. Old versions stay in the log until a merge rewrites only live records.</p>';
      var cb='<h4 style="margin-top:1rem">Crash drill: the machine dies mid-append</h4><div class="row"><label>Bytes of the log that reached disk: <b id="lg-cv"></b> <input id="lg-c" type="range" min="0" max="1000" value="1000"></label></div><div id="lg-cr"></div>';
      document.getElementById('lg-crash').innerHTML=cb;
      var cs=document.getElementById('lg-c');function crash(){var keep=Math.floor(db.len*(+cs.value)/1000),rec=Log.recover(db.buf,keep);
        document.getElementById('lg-cv').textContent=keep.toLocaleString()+' of '+db.len.toLocaleString();
        document.getElementById('lg-cr').innerHTML='<p>Recovery scanned the log, verified each record&rsquo;s checksum, and stopped: <b>'+rec.recovered.records.toLocaleString()+' records</b> accepted, <b>'+rec.recovered.discardedBytes.toLocaleString()+' bytes</b> discarded as a torn tail. Rebuilt index: <b>'+rec.keydir.size+' keys</b>.</p>';}
      cs.oninput=crash;crash();
    }
    document.getElementById('lg-merge').onclick=function(){db=db.compact();draw();};
    document.getElementById('lg-reset').onclick=build;['lg-k','lg-w'].forEach(function(id){document.getElementById(id).onchange=build;});build();
  });
})();
