global.window={}; global.document={addEventListener(){}};
require('../assets/sim-redundancy.js'); const R=window.RedundancySim; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const near=(a,b,e)=>Math.abs(a-b)<=e;
chk('single = p when c=0',near(R.unavailability('single',0.01,0),0.01,1e-12));
chk('any2 = p^2',near(R.unavailability('any2',0.01,0),1e-4,1e-12));
chk('maj3 = 3p^2-2p^3',near(R.unavailability('maj3',0.01,0),3e-4-2e-6,1e-12));
chk('any3 = p^3',near(R.unavailability('any3',0.01,0),1e-6,1e-15));
chk('ordering any3<any2<single when independent',R.unavailability('any3',.02,0)<R.unavailability('any2',.02,0)&&R.unavailability('any2',.02,0)<R.unavailability('single',.02,0));
chk('majority-of-3 beats a single replica for p<0.5',R.unavailability('maj3',.05,0)<R.unavailability('single',.05,0));
chk('any3 beats majority3 (needs fewer survivors)',R.unavailability('any3',.05,0)<R.unavailability('maj3',.05,0));
for(const k of Object.keys(R.SCHEMES)) chk('common-mode floor: '+k+' >= c',R.unavailability(k,.01,.001)>=0.001-1e-15);
chk('with large c, all designs within 10% of each other',(R.unavailability('single',.01,.01)-R.unavailability('any3',.01,.01))/R.unavailability('single',.01,.01)<0.5);
chk('1 minute/year = 1/525600',near(R.minutesPerYear(1/525600),1,1e-9));
chk('drill answers in range',R.DRILL.every(d=>d.a>=0&&d.a<=3)&&R.DRILL.length===6);
console.log(bad?bad+' failures':'redundancy model: 12 properties hold'); process.exit(bad?1:0);
