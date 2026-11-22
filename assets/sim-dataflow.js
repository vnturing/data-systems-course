/* Actual subset-Protobuf read/serialize round trips. An old intermediary changes name;
   its treatment of unknown fields determines whether a newer currency survives. */
(function(){
  'use strict';
  var E=window.EncodingSim,newSchema=E.PB.concat([{tag:3,name:'currency',type:'string'}]);
  function run(mode){
    var input={id:150,name:'Zoë',currency:'EUR'},bytes=E.pbEncode(newSchema,input),old=E.pbRead(E.PB,bytes),output;
    if(mode==='opaque')output=bytes.slice();
    else{
      old.value.name='Zoe';
      if(mode==='preserve')output=E.pbEncode(E.PB,old.value,old.unknown);
      else if(mode==='rebuild')output=E.pbEncode(E.PB,old.value);
      else throw Error('Unknown intermediary mode');
    }
    var final=E.pbRead(newSchema,output).value,kept=final.currency==='EUR';
    return {input:input,before:bytes,old:old.value,unknown:old.unknown,after:output,value:final,kept:kept,
      why:kept?(mode==='opaque'?'Bytes pass through unchanged. No application update was performed.':'The old intermediary changes name while retaining unknown field 3.'):
        'Rebuilding only known fields discarded currency. A new reader sees it absent; a USD fallback would misinterpret this EUR record.'};
  }
  window.DataflowSim={run:run};
})();
