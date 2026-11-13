/* Lesson 0014: the schema you did not write is still there. A stream of records written over time under three shapes,
   read by three independent readers, each written when only some shapes existed. Deterministic. */
(function(){
  /* v1: {name, plan:"pro"|"free"}   v2: {first,last, plan}   v3: {first,last, plan:{tier,seats}} */
  function stream(n){
    var out=[];
    for(var i=0;i<n;i++){
      var tier=(i%3===0)?'pro':'free',ver=(i%10<5)?1:(i%10<8)?2:3;
      if(ver===1)out.push({v:1,name:'Person '+i,plan:tier});
      else if(ver===2)out.push({v:2,first:'P',last:String(i),plan:tier});
      else out.push({v:3,first:'P',last:String(i),plan:{tier:tier,seats:1+(i%5)}});
    }
    return out;
  }
  function truth(r){return {name:r.v===1?r.name:(r.first+' '+r.last),tier:r.v===3?r.plan.tier:r.plan};}
  /* A reader "knows" a set of versions. For a record whose version it does not know it either defaults silently or throws. */
  function read(r,knows,onUnknown){
    var k=knows[r.v];
    if(!k){
      if(onUnknown==='throw')throw new Error('unknown record version '+r.v);
      /* silent defaults: read the fields as the oldest shape and fall back to a placeholder */
      return {name:r.name||'Unknown',tier:(typeof r.plan==='string')?r.plan:'free'};
    }
    return truth(r);
  }
  function run(knows,onUnknown,n){
    var recs=stream(n||3000),ok=0,silent=0,loud=0;
    recs.forEach(function(r){var t=truth(r);
      try{var got=read(r,knows,onUnknown);if(got.name===t.name&&got.tier===t.tier)ok++;else silent++;}catch(e){loud++;}});
    return {total:recs.length,correct:ok,silentlyWrong:silent,loudErrors:loud};
  }
  window.SchemaSim={stream:stream,truth:truth,read:read,run:run};

  var READERS=[{id:'billing',name:'Billing job',knows:{1:true,2:false,3:false}},{id:'analytics',name:'Analytics export',knows:{1:true,2:true,3:false}},{id:'search',name:'Search indexer',knows:{1:true,2:true,3:true}}];
  document.addEventListener('DOMContentLoaded',function(){
    var h=document.getElementById('sim-schema');if(!h)return;
    var mode='default';
    h.innerHTML='<h4>Interactive &middot; Three readers, three shapes</h4>'+
      '<p>3,000 records written over time: half in shape v1 (<code>name</code>, <code>plan</code> as a string), 30% in v2 (<code>first</code> and <code>last</code>), 20% in v3 (<code>plan</code> became an object). Each reader was last updated at a different time. Tick what each one handles.</p>'+
      '<div id="sc-r"></div><div class="row" id="sc-m"></div><div id="sc-out"></div>';
    var rh=document.getElementById('sc-r');
    READERS.forEach(function(r){var d=document.createElement('div');d.className='row';d.innerHTML='<b style="min-width:9rem">'+r.name+'</b>'+[1,2,3].map(function(v){return '<label class="opt" style="margin:0"><input type="checkbox" data-r="'+r.id+'" data-v="'+v+'"'+(r.knows[v]?' checked':'')+'> handles v'+v+'</label>';}).join('');rh.appendChild(d);});
    var mh=document.getElementById('sc-m');
    [['default','Unknown shape: fall back to defaults (tolerant)'],['throw','Unknown shape: fail loudly (strict)']].forEach(function(m){var b=document.createElement('button');b.className='btn ghost';b.dataset.m=m[0];b.textContent=m[1];b.onclick=function(){mode=m[0];draw();};mh.appendChild(b);});
    function draw(){
      [].forEach.call(mh.children,function(b){b.classList.toggle('sel',b.dataset.m===mode);});
      READERS.forEach(function(r){[1,2,3].forEach(function(v){r.knows[v]=rh.querySelector('input[data-r="'+r.id+'"][data-v="'+v+'"]').checked;});});
      var t='<table><tr><th>Reader</th><th>Correct</th><th>Silently wrong</th><th>Loud errors</th></tr>';
      READERS.forEach(function(r){var x=run(r.knows,mode,3000);
        t+='<tr><td>'+r.name+'</td><td>'+(x.correct/x.total*100).toFixed(0)+'%</td><td>'+(x.silentlyWrong?'<span class="tag bad">'+(x.silentlyWrong/x.total*100).toFixed(0)+'%</span>':'0%')+'</td><td>'+(x.loudErrors?'<span class="tag warn">'+(x.loudErrors/x.total*100).toFixed(0)+'%</span>':'0%')+'</td></tr>';});
      document.getElementById('sc-out').innerHTML=t+'</table><p style="color:var(--muted)">Nothing in the store changed between rows. The schema lives in each reader&rsquo;s code, and each reader&rsquo;s copy is a different age.</p>';
    }
    rh.querySelectorAll('input').forEach(function(el){el.onchange=draw;});draw();
  });
})();
