// Writes the n=2000, out-degree-3, seed-42 graph used by graph_crosscheck.sql to /tmp/edges.tsv
global.window={}; global.document={addEventListener(){}};
require('../../assets/sim-graph.js');
const g=window.GraphSim.makeGraph(2000,3,42),rows=[];
g.adj.forEach((a,i)=>a.forEach(j=>rows.push(i+'\t'+j)));
require('fs').writeFileSync('/tmp/edges.tsv',rows.join('\n')+'\n');
console.log('wrote',rows.length,'edges to /tmp/edges.tsv');
