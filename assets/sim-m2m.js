/* Lesson 0013: many-to-many between articles and tags, three representations.
   Same accounting as sim-layout: rows/documents read, written, and torn states when multi-document atomicity is unavailable.
   Reverse lookups follow MySQL 8.0.46 measurements (array index ~ 1+A reads; no index ~ N+3 reads). ILLUSTRATIVE. */
(function(){
  var DEF={N:100000,T:2000,k:5,reverseIndex:true,multiDocTxn:true};
  var REPS={
    one:{name:'One side stores an array of ids (article has tag_ids)'},
    two:{name:'Both sides store arrays (article.tag_ids and tag.article_ids)'},
    junction:{name:'Junction table / collection (one row per link)'}
  };
  var OPS={
    tags:{name:'List the tags of one article (ids)'},
    articles:{name:'List the articles with tag X (ids)'},
    add:{name:'Attach one tag to one article'},
    del:{name:'Delete tag X everywhere'}
  };
  function A(o){return o.N*o.k/o.T;}   /* articles per tag */
  function cost(rep,op,o){
    o=Object.assign({},DEF,o);var a=A(o),r={reads:0,writes:0,torn:0,hazard:''};
    if(rep==='one'){
      if(op==='tags'){r.reads=1;}
      if(op==='articles'){r.reads=o.reverseIndex?1+a:o.N+3;}
      if(op==='add'){r.writes=1;}
      if(op==='del'){r.reads=o.reverseIndex?1+a:o.N+3;r.writes=a+1;r.torn=o.multiDocTxn?0:a;r.hazard='dangling ids if interrupted';}
    }else if(rep==='two'){
      if(op==='tags'){r.reads=1;}
      if(op==='articles'){r.reads=1;}
      if(op==='add'){r.writes=2;r.torn=o.multiDocTxn?0:1;r.hazard='the two sides disagree if interrupted';}
      if(op==='del'){r.reads=1;r.writes=a+1;r.torn=o.multiDocTxn?0:a;r.hazard='dangling ids if interrupted';}
    }else{
      if(op==='tags'){r.reads=o.k;}
      if(op==='articles'){r.reads=a;}
      if(op==='add'){r.writes=1;}
      if(op==='del'){r.reads=a;r.writes=a+1;r.torn=0;r.hazard='';}   /* one transaction or cascading delete; rows, not documents */
    }
    return r;
  }
  /* crash points of "attach a tag" for the two-sided representation, in the style of Lesson 2 */
  function attachDrill(rep){
    if(rep==='two')return [{at:'before either write',state:'nothing linked',ok:true},{at:'after writing the article side',state:'article lists the tag; tag does not list the article',ok:false},{at:'after writing both sides',state:'linked on both sides',ok:true}];
    return [{at:'before the write',state:'nothing linked',ok:true},{at:'after the write',state:'linked',ok:true}];
  }
  window.M2MSim={DEF:DEF,REPS:REPS,OPS:OPS,cost:cost,A:A,attachDrill:attachDrill};

  function f(x){return x>=1e6?(x/1e6).toFixed(1)+'M':Math.round(x).toLocaleString();}
  document.addEventListener('DOMContentLoaded',function(){
    var h=document.getElementById('sim-m2m');if(!h)return;
    h.innerHTML='<h4>Interactive &middot; Articles and tags</h4>'+
      '<div class="row"><label>Tags per article: <b id="mm-kv"></b> <input id="mm-k" type="range" min="1" max="20" value="5"></label></div>'+
      '<div class="row"><label class="opt"><input type="checkbox" id="mm-i" checked> multi-valued index on the array</label><label class="opt"><input type="checkbox" id="mm-t" checked> multi-document atomic commits available</label></div><div id="mm-out"></div><div id="mm-drill"></div>';
    function draw(){
      var o={k:+document.getElementById('mm-k').value,reverseIndex:document.getElementById('mm-i').checked,multiDocTxn:document.getElementById('mm-t').checked};
      document.getElementById('mm-kv').textContent=o.k+' (so '+f(A(Object.assign({},DEF,o)))+' articles per tag)';
      var t='<table><tr><th>Operation</th>'+Object.keys(REPS).map(function(r){return '<th>'+REPS[r].name+'</th>';}).join('')+'</tr>';
      Object.keys(OPS).forEach(function(op){t+='<tr><td>'+OPS[op].name+'</td>'+Object.keys(REPS).map(function(r){var x=cost(r,op,o);
        return '<td>'+f(x.reads)+' read'+(x.reads===1?'':'s')+', '+f(x.writes)+' write'+(x.writes===1?'':'s')+(x.torn?'<br><span class="tag bad">'+f(x.torn)+' torn states: '+x.hazard+'</span>':'')+'</td>';}).join('')+'</tr>';});
      document.getElementById('mm-out').innerHTML=t+'</table>';
      var d='<h4 style="margin-top:1rem">Crash-point drill for &ldquo;attach a tag&rdquo; (as in Lesson 2)</h4><table><tr><th>Representation</th><th>Where it dies</th><th>State</th></tr>';
      ['two','junction'].forEach(function(r){attachDrill(r).forEach(function(s,i){d+='<tr><td>'+(i===0?REPS[r].name:'')+'</td><td>'+s.at+'</td><td><span class="tag '+(s.ok?'ok':'bad')+'">'+s.state+'</span></td></tr>';});});
      document.getElementById('mm-drill').innerHTML=d+'</table><p style="color:var(--muted)">With multi-document atomic commits the torn states disappear, because the two writes become one transaction. Without them, Lesson 2&rsquo;s outbox-style reasoning applies inside a single database.</p>';
    }
    ['mm-k','mm-i','mm-t'].forEach(function(id){document.getElementById(id).oninput=draw;document.getElementById(id).onchange=draw;});draw();
  });
})();
