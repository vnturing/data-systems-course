/* A deliberately small executable slice of the wire formats, not general-purpose codecs.
   Protobuf: singular uint32/string, wire types 0/2. Avro: flat records, int/long/string.
   Avro long values are limited to JavaScript's safe integer range here. No framing/compression.
   Cross-checked against the real Python libraries in experiments/encoding/. */
(function(){
  'use strict';
  var own=function(o,k){return Object.prototype.hasOwnProperty.call(o,k);};
  function utf8(s){return Array.from(new TextEncoder().encode(s));}
  function text(a){return new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(a));}
  function hex(a){return a.map(function(b){return b.toString(16).padStart(2,'0');}).join(' ');}
  function varint(n){
    n=BigInt(n); if(n<0n||n>18446744073709551615n)throw Error('Varint out of uint64 range');
    var out=[];do{var b=Number(n&127n);n>>=7n;out.push(b|(n?128:0));}while(n);return out;
  }
  function readVarint(bytes,c){
    var n=0n;
    for(var i=0;i<10;i++){
      if(c.i>=bytes.length)throw Error('Truncated varint');
      var b=bytes[c.i++];if(i===9&&b>1)throw Error('Varint exceeds uint64');
      n|=BigInt(b&127)<<BigInt(7*i);if(!(b&128))return n;
    }throw Error('Unterminated varint');
  }
  function safe(n){var v=Number(n);if(!Number.isSafeInteger(v))throw Error('Outside the lab safe integer range');return v;}
  function slice(bytes,c,n){
    if(n<0||c.i+n>bytes.length)throw Error('Truncated field');
    var a=bytes.slice(c.i,c.i+n);c.i+=n;return a;
  }
  function pbEncode(schema,record,unknown){
    var out=[];
    schema.forEach(function(f){
      if(!own(record,f.name))return;
      var v=record[f.name],a;
      if(f.type==='uint32'){
        if(!Number.isInteger(v)||v<0||v>4294967295)throw Error('Invalid uint32');
        a=varint(BigInt(f.tag)*8n).concat(varint(v));
      }else if(f.type==='string'){
        if(typeof v!=='string')throw Error('Expected string');
        var s=utf8(v);a=varint(BigInt(f.tag)*8n+2n).concat(varint(s.length),s);
      }else throw Error('Unsupported Protobuf type');
      out=out.concat(a);
    });return out.concat(unknown||[]);
  }
  function pbRead(schema,bytes){
    var c={i:0},value={},unknown=[];
    while(c.i<bytes.length){
      var start=c.i,k=safe(readVarint(bytes,c)),tag=Math.floor(k/8),wire=k%8,v;
      if(tag<1||tag>536870911)throw Error('Invalid field number');
      if(wire===0)v=readVarint(bytes,c);
      else if(wire===2)v=slice(bytes,c,safe(readVarint(bytes,c)));
      else throw Error('Lab supports wire types 0 and 2 only');
      var f=schema.find(function(f){return f.tag===tag;});
      if(f&&((f.type==='uint32'&&wire===0)||(f.type==='string'&&wire===2)))
        value[f.name]=wire===0?Number(v&4294967295n):text(v);
      else unknown=unknown.concat(bytes.slice(start,c.i));
    }
    return {value:value,unknown:unknown};
  }
  function avroValue(type,v){
    if(type==='string'){
      if(typeof v!=='string')throw Error('Expected string');
      var b=utf8(v);return avroValue('long',b.length).concat(b);
    }
    if(type!=='int'&&type!=='long')throw Error('Unsupported Avro type');
    if(!Number.isSafeInteger(v)||(type==='int'&&(v<-2147483648||v>2147483647)))throw Error('Integer out of range');
    var n=BigInt(v);return varint(n<0n?-2n*n-1n:2n*n);
  }
  function avroEncode(schema,record){
    var out=[];
    schema.fields.forEach(function(f){
      // Require explicit writer values. Reader defaults are not a license to omit wire fields.
      if(!own(record,f.name))throw Error('Writer missing '+f.name);
      out=out.concat(avroValue(f.type,record[f.name]));
    });return out;
  }
  function avroRead(writer,reader,bytes){
    if(writer.name!==reader.name)throw Error('Record names do not match');
    var c={i:0},raw={},value={},defaults=[],ignored=[];
    writer.fields.forEach(function(f){
      var n=readVarint(bytes,c),v=(n&1n)?-(n+1n)/2n:n/2n;
      if(f.type==='string')v=text(slice(bytes,c,safe(v)));
      else if(f.type==='int'||f.type==='long'){
        v=safe(v);if(f.type==='int'&&(v<-2147483648||v>2147483647))throw Error('Invalid int');
      }else throw Error('Unsupported Avro type');
      raw[f.name]=v;
    });
    if(c.i!==bytes.length)throw Error('Trailing bytes: wrong writer schema?');
    reader.fields.forEach(function(f){
      var w=writer.fields.find(function(w){return w.name===f.name;});
      if(!w){
        if(!own(f,'default'))throw Error('Reader missing default for '+f.name);
        avroValue(f.type,f.default);value[f.name]=f.default;defaults.push(f.name);
      }else{
        if(w.type!==f.type&&!(w.type==='int'&&f.type==='long'))throw Error('Cannot resolve '+f.name+': '+w.type+' to '+f.type);
        value[f.name]=raw[f.name];
      }
    });
    writer.fields.forEach(function(w){if(!reader.fields.some(function(f){return f.name===w.name;}))ignored.push(w.name);});
    return {value:value,defaults:defaults,ignored:ignored};
  }
  var PB=[{tag:1,name:'id',type:'uint32'},{tag:2,name:'name',type:'string'}];
  var AV={type:'record',name:'Account',fields:[{name:'id',type:'long'},{name:'name',type:'string'}]};
  function wireSample(id,name,extra){
    var record={id:id,name:name},pb=PB.slice(),av={name:AV.name,fields:AV.fields.slice()};
    if(extra){record.currency='USD';pb.push({tag:3,name:'currency',type:'string'});av.fields.push({name:'currency',type:'string',default:'USD'});}
    return {record:record,json:utf8(JSON.stringify(record)),protobuf:pbEncode(pb,record),avro:avroEncode(av,record),
      oldProtobuf:pbRead(PB,pbEncode(pb,record)),oldAvro:avroRead(av,AV,avroEncode(av,record))};
  }
  function jsonProbe(kind){
    var samples={number:'{"id":9007199254740993}',string:'{"id":"9007199254740993"}',
      duplicate:'{"tier":"free","tier":"pro"}',null:'{"name":null}',missing:'{}',decimal:'{"amount":0.1}'};
    var input=samples[kind],v=JSON.parse(input),received=JSON.stringify(v);
    var why={number:'The numeric token was rounded to 9007199254740992 before your code saw it. Parsing succeeded; identity changed.',
      string:'The identifier survives exactly as text. Validate its digit syntax and range at the boundary.',
      duplicate:'This browser keeps the last value. Another parser may reject the object; duplicate names are not an interoperable contract.',
      null:'The key exists and its value is null. Your application must define whether that means clear, unknown, or something else.',
      missing:'The key is absent. A PATCH endpoint can give this a different meaning from an explicit null.',
      decimal:'0.1 parses, but 0.1 + 0.2 is '+(0.1+0.2)+'. Define money units and arithmetic explicitly.'};
    return {input:input,received:received,why:why[kind]};
  }
  window.EncodingSim={utf8:utf8,hex:hex,varint:varint,readVarint:readVarint,pbEncode:pbEncode,pbRead:pbRead,
    avroEncode:avroEncode,avroRead:avroRead,wireSample:wireSample,jsonProbe:jsonProbe,PB:PB,AV:AV};
})();
