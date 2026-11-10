global.window={}; global.document={addEventListener(){}};
require('../assets/sim-kafka.js');
const K=window.KafkaSim; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const M=K.matrix(), row=(a,m,u)=>M.find(r=>r.acks===a&&r.minIsr===m&&r.unclean===u);
// 1. acks=1: min.insync.replicas has no effect
for(const u of [false,true]){const a=row('1',1,u),b=row('1',2,u);
  chk('acks=1 ignores min.insync.replicas ('+u+')',a.accepted===b.accepted&&a.lost===b.lost&&a.leaderDeathLost===b.leaderDeathLost);}
// 2. acks=all with minIsr=1 behaves like leader-only acknowledgement in the cascade
chk('acks=all,minIsr=1 == leader-only in cascade',row('all',1,false).accepted===row('1',1,false).accepted);
// 3. unclean election loses acknowledged data in the cascade for every acks/minIsr combination
for(const [a,m] of [['1',1],['1',2],['all',1],['all',2]]) chk('unclean=true loses data in cascade '+a+'/'+m,row(a,m,true).lost>0);
// 4. unclean=false never loses acknowledged data in the cascade
for(const [a,m] of [['1',1],['1',2],['all',1],['all',2]]) chk('unclean=false loses nothing in cascade '+a+'/'+m,row(a,m,false).lost===0);
// 5. leader dies while follower lags: acks=1 loses, acks=all with minIsr 2 does not
for(const u of [false,true]){chk('acks=1 loses on leader death ('+u+')',row('1',1,u).leaderDeathLost>0);
  chk('acks=all,minIsr=2 safe on leader death ('+u+')',row('all',2,u).leaderDeathLost===0);}
// 6. safe configuration pays in availability (liveness)
chk('acks=all,minIsr=2,unclean=false rejects more produces',row('all',2,false).rejected>row('1',1,false).rejected);
// 7. explicit event checks
let w=K.init({acks:'all',minIsr:2,unclean:false}); K.runSteps(w,['p','k:C','p','k:B','p']);
chk('NotEnoughReplicas emitted',w.events.some(e=>/NotEnoughReplicas/.test(e.t)));
chk('rejected message is not in acked',w.acked.length===2);
K.runSteps(w,['k:A']); chk('offline when last ISR member dies',w.leader===null);
K.runSteps(w,['s:C']); chk('stale replica cannot lead when unclean=false',w.leader===null);
K.runSteps(w,['s:A']); chk('last ISR member returns and leads',w.leader==='A'&&K.lost(w).length===0);
// 8. preset 1 as shown in the lesson
w=K.init({acks:'1',minIsr:1,unclean:false}); K.runSteps(w,K.SCEN[0].steps);
chk('preset 1 loses m2 under acks=1',JSON.stringify(K.lost(w))==='["m2"]');
w=K.init({acks:'all',minIsr:2,unclean:false}); K.runSteps(w,K.SCEN[0].steps);
chk('preset 1 loses nothing under acks=all/min 2',K.lost(w).length===0);
// 9. disk-loss scenario: why min.insync.replicas=2 matters
chk('acks=1 loses acknowledged data on disk loss',row('1',1,false).diskLost>0);
chk('acks=all,minIsr=1 still loses data on disk loss (single-copy acks)',row('all',1,false).diskLost>0);
chk('acks=all,minIsr=2 survives disk loss',row('all',2,false).diskLost===0&&row('all',2,true).diskLost===0);
const safeAll=M.filter(r=>r.lost===0&&r.leaderDeathLost===0&&r.diskLost===0);
chk('exactly one configuration is lossless in all three scenarios',safeAll.length===1&&safeAll[0].acks==='all'&&safeAll[0].minIsr===2&&safeAll[0].unclean===false);
w=K.init({acks:'all',minIsr:1,unclean:false}); K.runSteps(w,K.DISKLOSS);
chk('wipe: only the single-copy record is on no disk',JSON.stringify(K.unrecoverable(w))==='["m3"]');
console.log(bad?bad+' failures':'kafka model: 23 properties hold'); process.exit(bad?1:0);
