/* Lesson 0015: how fast does a multi-hop traversal grow? Deterministic random directed graph; exact counts.
   For a start node and each hop h:
     new      = nodes first reached at exactly h hops (what a visited-set / UNION DISTINCT traversal produces)
     reached  = distinct nodes within h hops
     walks    = number of walks of length h (rows a naive UNION ALL recursion produces at depth h)
   Cross-checked against MySQL 8.0.46 recursive CTEs (experiments/mysql/graph_crosscheck.sql). */
(function(){
  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function makeGraph(n,d,seed){ /* each node gets d distinct out-neighbours, no self loops */
    var r=rng(seed||1),adj=new Array(n),i,k;
    for(i=0;i<n;i++){var s={},a=[];while(a.length<Math.min(d,n-1)){k=Math.floor(r()*n);if(k!==i&&!s[k]){s[k]=1;a.push(k);}}adj[i]=a;}
    return {n:n,adj:adj};
  }
  function fromEdges(n,edges){var adj=[];for(var i=0;i<n;i++)adj.push([]);edges.forEach(function(e){adj[e[0]].push(e[1]);});return {n:n,adj:adj};}
  function levels(g,start,H){
    var seen=new Uint8Array(g.n),frontier=[start],out=[],reached=1,h,i,j;seen[start]=1;
    var walks=new Float64Array(g.n),next=new Float64Array(g.n);walks[start]=1;
    for(h=1;h<=H;h++){
      var nf=[];
      for(i=0;i<frontier.length;i++){var a=g.adj[frontier[i]];for(j=0;j<a.length;j++){if(!seen[a[j]]){seen[a[j]]=1;nf.push(a[j]);}}}
      next.fill(0);var w=0;
      for(i=0;i<g.n;i++){if(walks[i]){var b=g.adj[i];for(j=0;j<b.length;j++)next[b[j]]+=walks[i];}}
      for(i=0;i<g.n;i++){w+=next[i];}
      var t=walks;walks=next;next=t;
      reached+=nf.length;frontier=nf;out.push({hop:h,new:nf.length,reached:reached,walks:w});
    }
    return out;
  }
  window.GraphSim={makeGraph:makeGraph,fromEdges:fromEdges,levels:levels};

  function fmt(x){return x>=1e9?(x/1e9).toFixed(1)+'B':x>=1e6?(x/1e6).toFixed(1)+'M':x>=1e3?(x/1e3).toFixed(1)+'K':String(Math.round(x));}
  document.addEventListener('DOMContentLoaded',function(){
    var h=document.getElementById('sim-graph');if(!h)return;
    var N=20000;
    h.innerHTML='<h4>Interactive &middot; Friends of friends of friends</h4>'+
      '<p>A random directed graph of 20,000 people. Each follows <i>d</i> others. For one person, how big is the answer to &ldquo;who is within <i>h</i> hops?&rdquo; and how many rows does a naive traversal produce on the way?</p>'+
      '<div class="row"><label>Each person follows: <b id="g-dv"></b> <input id="g-d" type="range" min="2" max="40" value="10"></label>'+
      '<label>Hops: <b id="g-hv"></b> <input id="g-h" type="range" min="1" max="6" value="4"></label></div><div id="g-out"></div>';
    var cache={};
    function draw(){
      var d=+document.getElementById('g-d').value,H=+document.getElementById('g-h').value;
      document.getElementById('g-dv').textContent=d;document.getElementById('g-hv').textContent=H;
      var g=cache[d]||(cache[d]=makeGraph(N,d,42)),L=levels(g,0,H);
      var t='<table><tr><th>Hops</th><th>Newly reached</th><th>Distinct people within h hops</th><th>Rows a naive walk enumeration produces</th><th>Waste factor</th></tr>';
      L.forEach(function(x){t+='<tr><td>'+x.hop+'</td><td>'+fmt(x.new)+'</td><td>'+fmt(x.reached)+'</td><td>'+fmt(x.walks)+'</td><td>'+(x.walks/Math.max(1,x.new)).toFixed(1)+'&times;</td></tr>';});
      document.getElementById('g-out').innerHTML=t+'</table><p style="color:var(--muted)">The answer cannot exceed 20,000 people no matter how many hops, but the naive row count keeps multiplying by about <i>d</i> per hop. A visited set (UNION DISTINCT without a changing column, or a graph engine&rsquo;s traversal) keeps work proportional to the answer, not to the number of paths.</p>';
    }
    ['g-d','g-h'].forEach(function(id){document.getElementById(id).oninput=draw;});draw();
  });
})();
