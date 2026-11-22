// Independent-library fixtures plus behavioral invariants for the encoding/evolution labs.
const assert=require('node:assert/strict');
global.window={};
require('../assets/sim-encoding.js');require('../assets/sim-evolution.js');require('../assets/sim-dataflow.js');
const E=window.EncodingSim,V=window.EvolutionSim,D=window.DataflowSim;
const F=require('../experiments/encoding/results.json');
assert.equal(F.environment.avro,'1.12.0');assert.equal(F.environment.protobuf,'6.33.5');
for(const x of F.wire){
  const s=E.wireSample(x.record.id,x.record.name,x.extra);
  for(const type of ['json','protobuf','avro'])assert.deepEqual(s[type],x[type],type+' bytes for '+JSON.stringify(x.record));
  assert.deepEqual(s.oldProtobuf.value,{id:x.record.id,name:x.record.name});
  assert.deepEqual(s.oldAvro.value,{id:x.record.id,name:x.record.name});
}
for(const [kind,rows] of Object.entries(F.matrices))for(const x of rows){
  const p=V.pair(kind,x.writer,x.reader);assert.equal(p.ok,x.ok,`${kind} writer ${x.writer} reader ${x.reader}`);
  assert.deepEqual(p.bytes,x.bytes);if(x.ok)assert.deepEqual(p.value,x.value);
}
for(const mode of ['opaque','preserve','rebuild']){
  const r=D.run(mode);assert.deepEqual(r.after,F.dataflow[mode].bytes);assert.deepEqual(r.value,F.dataflow[mode].value);
}
assert.equal(F.dataflow.json.value.currency,undefined);assert.equal(F.protojson_unknown_field,'rejected by default');
assert.equal(F.reused_tag.email,'Zoë');
assert.equal(E.jsonProbe('number').received,'{"id":9007199254740992}');
assert.equal(E.jsonProbe('string').received,'{"id":"9007199254740993"}');
assert.equal(F.text.python_big_integer.toString(),'9007199254740992'); // JSON fixture loaded into Number is itself lossy.
// Preserve that independent Python observation by inspecting its literal JSON token instead.
assert.match(require('node:fs').readFileSync(require.resolve('../experiments/encoding/results.json'),'utf8'),/"python_big_integer": 9007199254740993/);
assert.equal(E.jsonProbe('duplicate').received,'{"tier":"pro"}');
assert.notEqual(E.jsonProbe('null').received,E.jsonProbe('missing').received);
assert.equal(F.text.csv_fields.length,3);assert.equal(F.text.naive_csv_fields.length,4);
assert.equal(F.text.base64_zoe,'Wm/Dqw==');
// Varint boundaries, Unicode length and explicit presence of zero/empty values.
for(const n of [0n,1n,127n,128n,150n,4294967295n,18446744073709551615n]){
  const bytes=E.varint(n),cursor={i:0};assert.equal(E.readVarint(bytes,cursor),n);assert.equal(cursor.i,bytes.length);
}
assert.equal(E.utf8('Zoë').length,4);assert.equal(E.utf8('🙂').length,4);
assert.deepEqual(E.pbRead(E.PB,E.pbEncode(E.PB,{id:0,name:''})).value,{id:0,name:''});
assert.throws(()=>E.pbRead(E.PB,[8,128]),/Truncated/);
assert.throws(()=>E.pbRead(E.PB,[18,4,65]),/Truncated/);
assert.throws(()=>E.pbRead(E.PB,[0]),/Invalid field/);
assert.throws(()=>E.readVarint(Array(10).fill(255),{i:0}),/exceeds/);
assert.throws(()=>E.pbEncode(E.PB,{id:-1}),/uint32/);
assert.throws(()=>E.pbEncode(E.PB,{id:4294967296}),/uint32/);
assert.throws(()=>E.pbEncode(E.PB,{name:12}),/string/);
const base={name:'T',fields:[{name:'n',type:'long'},{name:'s',type:'string'}]};
for(const n of [-9007199254740991,-2147483648,-1,0,1,2147483647,9007199254740991]){
  const value={n,s:'東京🙂'};assert.deepEqual(E.avroRead(base,base,E.avroEncode(base,value)).value,value);
}
assert.throws(()=>E.avroEncode(base,{n:1}),/missing s/);
assert.throws(()=>E.avroRead(base,base,[128]),/Truncated/);
assert.throws(()=>E.avroRead(base,{...base,name:'Other'},E.avroEncode(base,{n:1,s:'x'})),/names/);
assert.deepEqual(V.compatibility('widen',1,2),{backward:true,forward:false});
assert.deepEqual(V.compatibility('required',1,2),{backward:false,forward:true});
assert.deepEqual(V.compatibility('remove',1,2),{backward:true,forward:false});
assert.deepEqual(V.compatibility('safe',1,2),{backward:true,forward:true});
assert.ok(V.pair('bridge',1,2).ok&&V.pair('bridge',2,3).ok&&!V.pair('bridge',1,3).ok);
assert.ok(V.matrix('units').flat().every(p=>p.ok));
assert.equal(V.pair('units',1,3).cents,120000);assert.equal(V.pair('units',3,1).cents,12);
assert.equal(V.audit('bridge',3,3,false,false).decodes,true);
assert.equal(V.audit('bridge',3,3,true,false).decodes,false);
assert.equal(V.audit('units',3,3,false,false).meaning,true);
assert.equal(V.audit('units',3,3,true,true).meaning,false);
assert.equal(V.audit('widen',2,1,false,false).decodes,false);
assert.equal(V.audit('widen',2,2,true,false).decodes,true);
assert.equal(V.audit('widen',2,2,true,true).decodes,false);
assert.ok(V.audit('safe',3,3,true,true).meaning);
console.log(`encoding: ${F.wire.length} real wire fixtures, 54 Avro pairs, round trips, parsing and migration invariants OK`);
