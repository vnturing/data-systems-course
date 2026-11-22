/* Lesson 0021: crash-point drill for a B-tree leaf split, with and without a write-ahead log and a doublewrite buffer.
   One logical change (insert key 55 into a full leaf) is THREE page writes. We crash after every write and also in the middle of
   each page write (a torn page), then run recovery and check whether the tree is still a valid tree. Pure model: no real disk. */
(function(){
  function clone(o){return JSON.parse(JSON.stringify(o));}
  var OLD_KEYS=[10,20,30,40,50,60,70,80,110,120],NEW_KEYS=[10,20,30,40,50,55,60,70,80,110,120];
  function initial(){return {R:{kind:'internal',keys:[100],kids:['A','B']},A:{kind:'leaf',keys:[10,20,30,40,50,60,70,80],next:'B'},B:{kind:'leaf',keys:[110,120],next:null}};}
  /* the pages as they should look after the split: A keeps 4 keys, new page C takes the rest plus the new key, R gains a separator */
  function final(){return {R:{kind:'internal',keys:[50,100],kids:['A','C','B']},A:{kind:'leaf',keys:[10,20,30,40],next:'C'},C:{kind:'leaf',keys:[50,55,60,70,80],next:'B'}};}
  var ORDERS={childFirst:['C','A','R'],parentFirst:['R','A','C']};
  /* Is the on-disk state a valid tree, and which logical state does it represent? */
  function validate(disk){
    var seen=[],problem=null,r=disk.R;
    if(!r||r.torn)return {state:'CORRUPT',why:'the root page is unreadable'};
    for(var i=0;i<r.kids.length;i++){var p=disk[r.kids[i]];
      if(!p){problem='the root points to page '+r.kids[i]+' which does not exist';break;}
      if(p.torn){problem='page '+r.kids[i]+' is torn (fails its checksum)';break;}
      for(var j=0;j<p.keys.length;j++)seen.push(p.keys[j]);}
    if(problem)return {state:'CORRUPT',why:problem};
    var s=JSON.stringify(seen);
    if(s===JSON.stringify(OLD_KEYS))return {state:'OLD',why:'the insert did not happen; the tree is intact'};
    if(s===JSON.stringify(NEW_KEYS))return {state:'NEW',why:'the insert is complete and the tree is intact'};
    var lost=OLD_KEYS.filter(function(k){return seen.indexOf(k)<0;});
    return {state:'CORRUPT',why:lost.length?'keys '+lost.join(', ')+' are unreachable (lost)':'duplicate or unexpected keys'};
  }
  /* crash points. kind: 'before-log' (log not yet durable), 'after' (k pages written), 'torn' (page k+1 half written) */
  function points(){return [{id:'before-log',label:'Before the log record is durable',k:0,kind:'before-log'},
    {id:'after0',label:'Log durable, no page written yet',k:0,kind:'after'},
    {id:'torn1',label:'During write 1 (torn page)',k:0,kind:'torn'},{id:'after1',label:'After write 1',k:1,kind:'after'},
    {id:'torn2',label:'During write 2 (torn page)',k:1,kind:'torn'},{id:'after2',label:'After write 2',k:2,kind:'after'},
    {id:'torn3',label:'During write 3 (torn page)',k:2,kind:'torn'},{id:'after3',label:'After write 3 (all pages written)',k:3,kind:'after'}];}
  function diskAt(order,pt){
    var d=initial(),f=final(),seq=ORDERS[order];
    for(var i=0;i<pt.k;i++)d[seq[i]]=clone(f[seq[i]]);
    if(pt.kind==='torn'){var id=seq[pt.k];d[id]={kind:(f[id]||{}).kind,keys:[],torn:true};}
    return d;
  }
  /* mode: 'none' | 'wal' | 'wal+dwb' */
  function run(order,mode,pt){
    var d=diskAt(order,pt),logDurable=(mode!=='none')&&pt.kind!=='before-log',f=final(),seq=ORDERS[order];
    if(pt.kind==='before-log'&&mode==='none'){/* without a log there is no such moment: nothing has been written */}
    if(logDurable){
      for(var i=0;i<seq.length;i++){var id=seq[i];
        if(d[id]&&d[id].torn){
          if(mode==='wal+dwb'){/* a good copy was flushed to the doublewrite area before the home write began */d[id]=clone(f[id]);}
          else return {state:'UNRECOVERABLE',why:'page '+id+' is torn, and redo needs an intact page to start from'};
        }
      }
      for(var j=0;j<seq.length;j++)d[seq[j]]=clone(f[seq[j]]);                         /* redo: idempotent, re-applies the logged change */
    }
    return validate(d);
  }
  function drill(order,mode){return points().map(function(p){var r=run(order,mode,p);return {point:p,state:r.state,why:r.why};});}
  window.WalSim={OLD_KEYS:OLD_KEYS,NEW_KEYS:NEW_KEYS,ORDERS:ORDERS,points:points,run:run,drill:drill,validate:validate,initial:initial,final:final};

  document.addEventListener('DOMContentLoaded',function(){
    var h=document.getElementById('sim-wal');if(!h)return;var order='childFirst';
    h.innerHTML='<h4>Interactive &middot; Crash during a page split</h4><p>Inserting key 55 into a full leaf takes <b>three page writes</b>: the new leaf C, the shortened leaf A, and the parent R. Pick the order the engine writes them in, then look at what survives a crash at every point.</p>'+
      '<div class="row" id="wl-o"></div><div id="wl-t"></div>';
    var ob=document.getElementById('wl-o');
    [['childFirst','New leaf, then old leaf, then parent'],['parentFirst','Parent, then old leaf, then new leaf']].forEach(function(o){var b=document.createElement('button');b.className='btn ghost';b.dataset.o=o[0];b.textContent=o[1];b.onclick=function(){order=o[0];draw();};ob.appendChild(b);});
    function tag(r){var c=r.state==='NEW'||r.state==='OLD'?'ok':'bad';return '<span class="tag '+c+'" title="'+r.why.replace(/"/g,'&quot;')+'">'+r.state+'</span> <span style="color:var(--muted);font-size:.74rem">'+r.why+'</span>';}
    function draw(){
      [].forEach.call(ob.children,function(b){b.classList.toggle('sel',b.dataset.o===order);});
      var a=drill(order,'none'),b=drill(order,'wal'),c=drill(order,'wal+dwb');
      var t='<table><tr><th>Crash point</th><th>No log</th><th>Write-ahead log</th><th>Log + doublewrite</th></tr>';
      a.forEach(function(x,i){t+='<tr><td>'+x.point.label+'</td><td>'+tag(x)+'</td><td>'+tag(b[i])+'</td><td>'+tag(c[i])+'</td></tr>';});
      var n=function(rows,s){return rows.filter(function(r){return r.state===s;}).length;};
      document.getElementById('wl-t').innerHTML=t+'</table><p><b>Bad outcomes out of '+a.length+' crash points:</b> no log '+(n(a,'CORRUPT')+n(a,'UNRECOVERABLE'))+'; log only '+(n(b,'CORRUPT')+n(b,'UNRECOVERABLE'))+'; log + doublewrite '+(n(c,'CORRUPT')+n(c,'UNRECOVERABLE'))+'. OLD and NEW are both fine: the insert either happened or it did not.</p>';
    }
    draw();
  });
})();
