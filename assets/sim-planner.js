/* Lesson 0016: a toy cost-based join planner, calibrated against MySQL 8.0.46 measurements (see lesson and tools/test-planner.js).
   Query shape (identical SQL text in every configuration):
     SELECT COUNT(*) FROM orders o JOIN customers c ON c.id=o.customer_id JOIN regions r ON r.id=c.region_id
     WHERE r.name='EU' AND o.status='open'
   Cost = rows read from storage. For each left-deep join order whose prefixes are connected, each join step costs the cheaper of
   an index lookup (outer rows x matches per lookup, if an index exists on the join column) or a hash join (read the inner table once).
   Cardinalities assume the predicates are independent, as most optimizers do. ILLUSTRATIVE TOY, not MySQL's cost model. */
(function(){
  var SIZE={r:50,c:100000,o:1000000};
  var NAME={r:'regions',c:'customers',o:'orders'};
  function cfg(o){return Object.assign({idxStatus:true,idxOc:true,idxCr:true,statusSel:0.02,regionSel:1/50},o||{});}
  function card(S,k){ /* estimated rows after filters for a set of tables */
    var has=function(t){return S.indexOf(t)>=0;}, n=1;
    if(has('o')) n=SIZE.o*k.statusSel;
    else if(has('c')) n=SIZE.c; else n=SIZE.r;
    if(has('o')&&has('c')) n=SIZE.o*k.statusSel;
    if(has('r')&&has('c')&&!has('o')) n=SIZE.c*k.regionSel;
    if(has('r')&&has('c')&&has('o')) n=SIZE.o*k.statusSel*k.regionSel;
    if(S.length===1&&S[0]==='r') n=SIZE.r*k.regionSel;
    return n;
  }
  /* (outer table set S, inner table U) -> {indexed, perLookup} */
  function edge(S,U,k){
    if(U==='c'&&S.indexOf('r')>=0) return {indexed:k.idxCr,m:SIZE.c/SIZE.r};
    if(U==='r') return {indexed:true,m:1};                      /* primary key */
    if(U==='c'&&S.indexOf('o')>=0) return {indexed:true,m:1};   /* primary key */
    if(U==='o') return {indexed:k.idxOc,m:SIZE.o/SIZE.c};
    return null;
  }
  var ORDERS=[['o','c','r'],['c','o','r'],['c','r','o'],['r','c','o']];
  function connected(S,U){return !!edge(S,U,cfg());}
  function plan(order,o){
    var k=cfg(o),S=[order[0]],cost=0,steps=[],first=order[0];
    var firstCost=(first==='o'&&k.idxStatus)?SIZE.o*k.statusSel:SIZE[first];
    cost+=firstCost;steps.push({table:NAME[first],how:(first==='o'&&k.idxStatus)?'index range on status':'full scan',reads:firstCost});
    for(var i=1;i<order.length;i++){
      var U=order[i],n=card(S,k),e=edge(S,U,k),look=e.indexed?n*e.m:Infinity,hash=SIZE[U],use=look<=hash?'index lookup':'hash join';
      var c=Math.min(look,hash);cost+=c;steps.push({table:NAME[U],how:use,reads:c});S=S.concat([U]);
    }
    return {order:order.join('>'),label:order.map(function(t){return NAME[t];}).join(' → '),cost:cost,steps:steps};
  }
  function plans(o){return ORDERS.map(function(ord){return plan(ord,o);});}
  function best(o){var ps=plans(o);return ps.reduce(function(a,p){return p.cost<a.cost?p:a;},ps[0]);}
  var AS_WRITTEN='o>c>r';
  function asWritten(o){return plans(o).filter(function(p){return p.order===AS_WRITTEN;})[0];}
  /* Measured on MySQL 8.0.46 (Ubuntu 24.04, InnoDB, data as in experiments/mysql/planner_setup.sql), Handler_read_* totals */
  var MEASURED=[
    {name:'A: all three secondary indexes',cfg:{idxStatus:true,idxOc:true,idxCr:true},optimizer:'r>c>o in 2/6 refreshes (24,054 reads); o>c>r in 4/6 (40,002 reads)',reads:[24054,40002],asWritten:40002},
    {name:'B: no index on orders.status',cfg:{idxStatus:false,idxOc:true,idxCr:true},optimizer:'r>c>o in 6/6 (24,054 reads)',reads:[24054],asWritten:1020004},
    {name:'C: no index on customers.region_id',cfg:{idxStatus:true,idxOc:true,idxCr:false},optimizer:'o>c>r in 6/6 (40,002 reads)',reads:[40002],asWritten:40002},
    {name:'D: no index on orders.customer_id',cfg:{idxStatus:true,idxOc:false,idxCr:true},optimizer:'o>c>r in 6/6 (40,002 reads)',reads:[40002],asWritten:40002},
    {name:'E: primary keys only',cfg:{idxStatus:false,idxOc:false,idxCr:false},optimizer:'o>c>r in 6/6 (1,020,004 reads)',reads:[1020004],asWritten:1020004}
  ];
  window.PlannerSim={SIZE:SIZE,plans:plans,best:best,asWritten:asWritten,MEASURED:MEASURED,ORDERS:ORDERS};

  function fmt(x){return x>=1e6?(x/1e6).toFixed(2)+'M':x>=1e3?(x/1e3).toFixed(1)+'K':x.toFixed(0);}
  document.addEventListener('DOMContentLoaded',function(){
    var h=document.getElementById('sim-planner');if(!h)return;
    h.innerHTML='<h4>Interactive &middot; Same SQL, different plan</h4>'+
      '<pre><code>SELECT COUNT(*) FROM orders o JOIN customers c ON c.id = o.customer_id\n  JOIN regions r ON r.id = c.region_id\nWHERE r.name = \'EU\' AND o.status = \'open\';</code></pre>'+
      '<p>1,000,000 orders, 100,000 customers, 50 regions, 2% of orders open. Toggle indexes; the query text never changes.</p>'+
      '<div class="row"><label class="opt"><input type="checkbox" id="pl-s" checked> index on orders(status)</label><label class="opt"><input type="checkbox" id="pl-o" checked> index on orders(customer_id)</label><label class="opt"><input type="checkbox" id="pl-c" checked> index on customers(region_id)</label></div>'+
      '<div id="pl-out"></div><h4 style="margin-top:1.2rem">Measured on MySQL 8.0.46 (same data, same five configurations)</h4><div id="pl-meas"></div>';
    function draw(){
      var o={idxStatus:document.getElementById('pl-s').checked,idxOc:document.getElementById('pl-o').checked,idxCr:document.getElementById('pl-c').checked};
      var ps=plans(o),b=best(o),aw=asWritten(o);
      var t='<table><tr><th>Join order</th><th>Steps (rows read)</th><th>Total rows read</th></tr>';
      ps.forEach(function(p){t+='<tr'+(p===b?' style="background:var(--ok-soft)"':'')+'><td>'+p.label+(p.order===AS_WRITTEN?' <span class="tag">as written</span>':'')+(p===b?' <span class="tag ok">cheapest</span>':'')+'</td><td>'+p.steps.map(function(s){return s.table+': '+s.how+', '+fmt(s.reads);}).join('<br>')+'</td><td><b>'+fmt(p.cost)+'</b></td></tr>';});
      document.getElementById('pl-out').innerHTML=t+'</table><p>An optimizer that picks the cheapest order reads <b>'+fmt(b.cost)+'</b> rows; a program that hard-codes the written order reads <b>'+fmt(aw.cost)+'</b> (<b>'+(aw.cost/b.cost).toFixed(1)+'&times;</b> as many).</p>';
    }
    ['pl-s','pl-o','pl-c'].forEach(function(id){document.getElementById(id).onchange=draw;});draw();
    var m='<table><tr><th>Configuration</th><th>Real optimizer&rsquo;s choice (6 statistics refreshes)</th><th>Forced as-written order</th><th>Toy model&rsquo;s cheapest</th></tr>';
    MEASURED.forEach(function(x){var b=best(x.cfg);m+='<tr><td>'+x.name+'</td><td>'+x.optimizer+'</td><td>'+x.asWritten.toLocaleString()+' reads</td><td>'+b.label+' ('+fmt(b.cost)+')</td></tr>';});
    document.getElementById('pl-meas').innerHTML=m+'</table>';
  });
})();
