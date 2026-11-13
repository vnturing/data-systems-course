global.window={}; global.document={addEventListener(){}};
require('../assets/sim-graph.js'); const G=window.GraphSim; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Cross-validation against MySQL 8.0.46 recursive CTEs on the same graph (n=2000, out-degree 3, seed 42; experiments/mysql/graph_crosscheck.sql)
const g=G.makeGraph(2000,3,42),L=G.levels(g,0,8);
chk('new nodes per hop equal MySQL UNION DISTINCT result',eq(L.map(x=>x.new),[3,9,26,73,184,401,603,419]));
chk('walks per hop equal MySQL UNION ALL result',eq(L.map(x=>x.walks),[3,9,27,81,243,729,2187,6561]));
chk('reached is the running sum of new (+ the start node)',L.every((x,i)=>x.reached===1+L.slice(0,i+1).reduce((a,y)=>a+y.new,0)));
// hand-checkable graphs
const path=G.fromEdges(6,[[0,1],[1,2],[2,3],[3,4],[4,5]]),P=G.levels(path,0,5);
chk('path graph: one new node and one walk per hop',eq(P.map(x=>x.new),[1,1,1,1,1])&&eq(P.map(x=>x.walks),[1,1,1,1,1]));
const K=[];for(let i=0;i<5;i++)for(let j=0;j<5;j++)if(i!==j)K.push([i,j]);const C=G.levels(G.fromEdges(5,K),0,4);
chk('complete graph K5: 4 new at hop 1 then none, walks 4^h',eq(C.map(x=>x.new),[4,0,0,0])&&eq(C.map(x=>x.walks),[4,16,64,256]));
const cyc=G.levels(G.fromEdges(3,[[0,1],[1,2],[2,0]]),0,6);
chk('3-cycle: reach stops at 3 nodes but a walk exists at every hop (UNION ALL never terminates alone)',cyc[5].reached===3&&cyc.every(x=>x.walks===1));
// invariants on random graphs
for(const d of [2,5,20]){const gg=G.makeGraph(3000,d,7),l=G.levels(gg,0,5);
  chk('d='+d+': reach never exceeds n',l.every(x=>x.reached<=3000));
  chk('d='+d+': walks of length h = d^h (regular out-degree)',l.every((x,i)=>x.walks===Math.pow(d,i+1)));
  chk('d='+d+': walks >= new nodes',l.every(x=>x.walks>=x.new));}
chk('deterministic',eq(G.levels(G.makeGraph(500,4,3),1,4),G.levels(G.makeGraph(500,4,3),1,4)));
console.log(bad?bad+' failures':'graph model: all properties hold'); process.exit(bad?1:0);
