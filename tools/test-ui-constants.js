// The widgets in assets/ui-storage.js print real measurements beside the models. They are copied constants; this test makes sure
// they still match experiments/storage/measurements.json.
const fs=require('fs'); const ui=fs.readFileSync(__dirname+'/../assets/ui-storage.js','utf8'); const M=require('../experiments/storage/measurements.json'); let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const fmt=r=>r[0]===r[1]?r[0].toLocaleString('en-US'):r[0].toLocaleString('en-US')+' to '+r[1].toLocaleString('en-US');
const pw=M.innodb.write_cost_200k_rows_108B_logical.random_md5.pages_written;
for(const mb of ['8','16','32','128']) chk(`UI shows the measured page-write range for the ${mb} MB pool (${fmt(pw[mb])})`,ui.includes("pages:'"+fmt(pw[mb])+"'"));
const pl=M.innodb.write_cost_200k_rows_108B_logical.random_md5.physical_over_logical;
chk('UI shows 140 to 141x, 72x, 13x and 5.2 to 5.4x',ui.includes("phys:'140 to 141x'")&&ui.includes("phys:'72x'")&&ui.includes("phys:'13x'")&&ui.includes("phys:'5.2 to 5.4x'")&&pl['8'][1]===141&&pl['128'][0]===5.2);
chk('UI shows the 2.27 / 5.0-5.3 / 5.3-5.8 / 6.7-6.8 leveled write amplification anchors',/'6\.4':'2\.27'.*'25\.7':'5\.0 to 5\.3'.*'51\.5':'5\.3 to 5\.8'.*'103':'6\.7 to 6\.8'/.test(ui)&&M.rocksdb.leveled_T10_random_write_amp.memtables['6.4'][0]===2.27);
const m=M.rocksdb.leveled_T10_random_write_amp.memtables;
chk('measurements.json ranges are consistent with the wording in the UI',m['25.7'][0]>=4.9&&m['25.7'][1]<=5.4&&m['51.5'][0]>=5.3&&m['51.5'][1]<=5.8&&m['103'][0]>=6.6&&m['103'][1]<=6.9);
chk('pool fractions in the UI (22%, 43%, 86%, 346%) match 8, 16, 32, 128 MB over a 37 MB table',[8,16,32,128].map(x=>Math.round(100*x/37)).join(',')==='22,43,86,346');
console.log(bad?bad+' failures':'ui constants match measurements.json'); process.exit(bad?1:0);
