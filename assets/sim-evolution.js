/* Executable Avro-subset resolution, plus separate APPLICATION unit checks.
   Units are not Avro type information. No registry, network, or database is simulated. */
(function(){
  'use strict';
  var E=window.EncodingSim;
  function copy(o){return JSON.parse(JSON.stringify(o));}
  function schema(fields,unit){return {type:'record',name:'Payment',fields:fields,unit:unit||'cents'};}
  var base=[{name:'id',type:'long'},{name:'amount',type:'int'}];
  var currency={name:'currency',type:'string',default:'USD'};
  var scenarios={
    safe:{label:'Add fields with reader defaults',why:'All nine pairs decode. Older readers ignore new fields; only use defaults when they preserve the business meaning.',schemas:[
      schema(copy(base)),schema(copy(base).concat([copy(currency)])),schema(copy(base).concat([copy(currency),{name:'note',type:'string',default:''}]))]},
    required:{label:'Add currency without a default',why:'New readers cannot read old bytes. Old readers can ignore the new field: forward only for v1 to v2.',schemas:[
      schema(copy(base)),schema(copy(base).concat([{name:'currency',type:'string'}])),schema(copy(base).concat([{name:'currency',type:'string'}]))]},
    remove:{label:'Remove amount without an old default',why:'New readers ignore the old amount, but old readers cannot synthesize the removed field: backward only for v1 to v2.',schemas:[
      schema(copy(base)),schema([{name:'id',type:'long'}]),schema([{name:'id',type:'long'}])]},
    widen:{label:'Widen amount from int to long',why:'Avro promotes int to long, not long to int. A small sample value fitting int does not change that schema rule.',schemas:[
      schema(copy(base)),schema([{name:'id',type:'long'},{name:'amount',type:'long'}]),schema([{name:'id',type:'long'},{name:'amount',type:'long'}])]},
    bridge:{label:'Add currency, then remove its default',why:'Reader v2 reads v1, and reader v3 reads v2. Reader v3 cannot read v1. Adjacent checks miss retained history.',schemas:[
      schema(copy(base)),schema(copy(base).concat([copy(currency)])),schema(copy(base).concat([{name:'currency',type:'string'}]))]},
    units:{label:'Keep the type; change cents to dollars',why:'Every pair decodes. Cross-unit readers compute the wrong amount. The registry cannot infer a unit change from an unchanged integer type.',schemas:[
      schema(copy(base)),schema(copy(base),'dollars'),schema(copy(base),'dollars')]}
  };
  function record(s){
    var all={id:150,amount:s.unit==='dollars'?12:1200,currency:'USD',note:'paid'},r={};
    s.fields.forEach(function(f){r[f.name]=all[f.name];});return r;
  }
  function pair(kind,w,r){
    var a=scenarios[kind].schemas,writer=a[w-1],reader=a[r-1],data=record(writer),bytes=E.avroEncode(writer,data);
    try{
      var result=E.avroRead(writer,reader,bytes),has=Object.prototype.hasOwnProperty.call(result.value,'amount');
      var cents=has?result.value.amount*(reader.unit==='dollars'?100:1):null;
      return {ok:true,meaning:!has?'unavailable':cents===1200?'correct':'wrong',cents:cents,bytes:bytes,
        value:result.value,defaults:result.defaults,ignored:result.ignored};
    }catch(e){return {ok:false,meaning:'unavailable',bytes:bytes,error:e.message};}
  }
  function matrix(kind){return [1,2,3].map(function(w){return [1,2,3].map(function(r){return pair(kind,w,r);});});}
  function compatibility(kind,oldVersion,newVersion){
    return {backward:pair(kind,oldVersion,newVersion).ok,forward:pair(kind,newVersion,oldVersion).ok};
  }
  function audit(kind,writer,reader,history,rollback){
    var writers=[writer],readers=[reader],rows=[];
    if(history&&writers.indexOf(1)<0)writers.push(1);
    if(rollback&&readers.indexOf(1)<0)readers.push(1);
    writers.forEach(function(w){readers.forEach(function(r){rows.push({writer:w,reader:r,result:pair(kind,w,r)});});});
    return {rows:rows,decodes:rows.every(function(x){return x.result.ok;}),
      meaning:rows.every(function(x){return x.result.ok&&x.result.meaning==='correct';})};
  }
  window.EvolutionSim={scenarios:scenarios,record:record,pair:pair,matrix:matrix,compatibility:compatibility,audit:audit};
})();
