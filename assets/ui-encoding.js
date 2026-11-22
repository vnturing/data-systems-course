/* Module 4 DOM adapters. Wire codecs and migration decisions live in the pure models.
   User-supplied text is escaped or assigned with textContent, never interpolated as markup. */
(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded',function(){
    var E=window.EncodingSim,V=window.EvolutionSim;
    function $(id){return document.getElementById(id);}
    function esc(x){return String(x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    function table(headers,rows){return '<div class="table-scroll"><table><thead><tr>'+headers.map(function(h){return '<th scope="col">'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(c){return '<td>'+esc(c)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';}
    function watch(ids,draw){ids.forEach(function(id){$(id).addEventListener('input',draw);});draw();}
    function verdict(p){return !p.ok?'Decode error':p.meaning==='wrong'?'Decodes; wrong amount':p.meaning==='unavailable'?'Decodes; amount absent':'Decodes; correct amount';}
    var h=$('sim-json-probe');
    if(h){
      h.innerHTML='<h4>Interactive · Parse at the boundary</h4><label for="jp-case">Payload <select id="jp-case"><option value="number">Large numeric ID</option><option value="string">Large ID as text</option><option value="duplicate">Duplicate keys</option><option value="null">Explicit null</option><option value="missing">Missing field</option><option value="decimal">Decimal arithmetic</option></select></label><pre id="jp-source"></pre><p>Predict the received value before running the parser.</p><button class="btn" id="jp-run" type="button">Parse in this browser</button><div id="jp-output" aria-live="polite"></div>';
      function preview(){var r=E.jsonProbe($('jp-case').value);$('jp-source').textContent=r.input;$('jp-output').replaceChildren();}
      $('jp-case').addEventListener('input',preview);$('jp-run').onclick=function(){var r=E.jsonProbe($('jp-case').value);$('jp-output').innerHTML='<pre></pre><p></p>';$('jp-output').querySelector('pre').textContent=r.received;$('jp-output').querySelector('p').textContent=r.why;};preview();
    }
    h=$('sim-text-bytes');
    if(h){
      h.innerHTML='<h4>Interactive · Text is bytes too</h4><label for="tb-text">Text <input id="tb-text" type="text" maxlength="40" value="Zoë"></label><div id="tb-output" aria-live="polite"></div>';
      watch(['tb-text'],function(){var t=$('tb-text').value,a=E.utf8(t),b64=btoa(String.fromCharCode.apply(null,a));
        $('tb-output').innerHTML=table(['JS UTF-16 units','UTF-8 bytes','Base64 characters'],[[t.length,a.length,b64.length]])+'<p>UTF-8 hex</p><pre></pre><p>Base64 of those bytes</p><pre></pre>';
        var pre=$('tb-output').querySelectorAll('pre');pre[0].textContent=E.hex(a);pre[1].textContent=b64;
      });
    }
    h=$('sim-wire');
    if(h){
      h.innerHTML='<h4>Interactive · Inspect the actual bytes</h4><div class="row"><label for="wr-id">ID <input id="wr-id" type="number" min="0" max="4294967295" value="150"></label><label for="wr-name">Name <input id="wr-name" type="text" maxlength="40" value="Zoë"></label></div><label class="opt"><input id="wr-extra" type="checkbox"> Add currency USD as field 3 / third Avro field</label><div id="wr-output" aria-live="polite"></div>';
      watch(['wr-id','wr-name','wr-extra'],function(){var id=+$('wr-id').value;
        if($('wr-id').value===''||!Number.isInteger(id)||id<0||id>4294967295){$('wr-output').textContent='Enter an integer ID from 0 to 4294967295.';return;}
        var s=E.wireSample(id,$('wr-name').value,$('wr-extra').checked);
        $('wr-output').innerHTML='<p>Application record</p><pre id="wr-record"></pre>'+table(['Encoding','Bare payload bytes'],[['JSON UTF-8',s.json.length],['Protobuf',s.protobuf.length],['Avro',s.avro.length]])+
          '<p>Protobuf hex</p><pre id="wr-pb"></pre><p>Avro hex</p><pre id="wr-av"></pre><p>Old Protobuf reader: known fields</p><pre id="wr-old-pb"></pre><p id="wr-unknown"></p><p>Old Avro reader: resolved values</p><pre id="wr-old-av"></pre><p>No headers, schema distribution, framing, compression, CPU cost or latency are counted. These are deliberately small codecs, not production libraries.</p>';
        $('wr-record').textContent=JSON.stringify(s.record);$('wr-pb').textContent=E.hex(s.protobuf);$('wr-av').textContent=E.hex(s.avro);
        $('wr-old-pb').textContent=JSON.stringify(s.oldProtobuf.value);$('wr-unknown').textContent='Unknown bytes retained: '+(E.hex(s.oldProtobuf.unknown)||'(none)');$('wr-old-av').textContent=JSON.stringify(s.oldAvro.value);
      });
    }
    h=$('sim-rollout');
    if(h){
      h.innerHTML='<h4>Interactive · Try the deployment order</h4><label for="ro-case">Change <select id="ro-case"><option value="widen">int to long (backward only)</option><option value="required">Add without default (forward only)</option><option value="safe">Add with default (both directions)</option></select></label><div class="row"><button class="btn ghost" id="ro-reader" type="button">Deploy reader v2</button><button class="btn ghost" id="ro-writer" type="button">Deploy writer v2</button><button class="btn ghost" id="ro-rollback" type="button">Roll reader back to v1</button><button class="btn ghost" id="ro-reset" type="button">Reset deployment</button></div><label class="opt"><input id="ro-history" type="checkbox" checked> Reader must also read retained v1 records</label><div id="ro-output" aria-live="polite"></div>';
      var rw=1,rr=1;
      function rollout(){var kind=$('ro-case').value,a=V.audit(kind,rw,rr,$('ro-history').checked,false),c=V.compatibility(kind,1,2);
        $('ro-output').innerHTML='<p>Live writer <b>v'+rw+'</b>; live reader <b>v'+rr+'</b>. Backward: '+(c.backward?'yes':'no')+'; forward: '+(c.forward?'yes':'no')+'.</p>'+table(['Writer data','Reader','Outcome'],a.rows.map(function(x){return ['v'+x.writer,'v'+x.reader,verdict(x.result)];}))+'<p><b>'+(a.decodes?'All required pairs decode.':'Deployment has a decode failure.')+'</b> This checks the selected schemas and sample; it does not prove business semantics, request/response compatibility or an actual deployment.</p>';
      }
      $('ro-reader').onclick=function(){rr=2;rollout();};$('ro-writer').onclick=function(){rw=2;rollout();};$('ro-rollback').onclick=function(){rr=1;rollout();};$('ro-reset').onclick=function(){rw=rr=1;rollout();};
      $('ro-case').addEventListener('input',function(){rw=rr=1;rollout();});$('ro-history').addEventListener('input',rollout);rollout();
    }
    h=$('sim-dataflow');
    if(h){
      h.innerHTML='<h4>Interactive · New writer, old intermediary, new reader</h4><p>The writer emits EUR. The old intermediary knows id and name, but not currency. Predict the final currency.</p><label for="df-mode">Intermediary <select id="df-mode"><option value="rebuild">Rebuild known fields</option><option value="preserve">Edit binary message; retain unknowns</option><option value="opaque">Pass bytes through unchanged</option></select></label><div id="df-output" aria-live="polite"></div>';
      watch(['df-mode'],function(){var r=window.DataflowSim.run($('df-mode').value);
        $('df-output').innerHTML='<p>Before intermediary</p><pre id="df-before"></pre><p>After intermediary</p><pre id="df-after"></pre><p>New reader sees</p><pre id="df-value"></pre><p id="df-verdict"></p>';
        $('df-before').textContent=E.hex(r.before);$('df-after').textContent=E.hex(r.after);$('df-value').textContent=JSON.stringify(r.value);$('df-verdict').textContent=r.why;
      });
    }
    h=$('sim-evolution');
    if(h){
      h.innerHTML='<h4>Interactive · Nine writer/reader pairs</h4><label for="ev-case">Migration <select id="ev-case"><option value="safe">Add fields with defaults</option><option value="bridge">Add default; later remove it</option><option value="units">Keep integer; change money units</option></select></label><p>Rows are writer versions; columns are reader versions. OK means decoding and this sample amount are correct. Select a cell to inspect bytes, defaults, ignored fields and the interpreted amount.</p><div id="ev-matrix"></div><pre id="ev-detail" aria-live="polite"></pre><details><summary>Inspect the three schemas</summary><pre id="ev-schemas"></pre></details><h4>Audit the migration</h4><div class="row"><label for="ev-writer">Live writer <select id="ev-writer"><option value="1">v1</option><option value="2">v2</option><option value="3" selected>v3</option></select></label><label for="ev-reader">Live reader <select id="ev-reader"><option value="1">v1</option><option value="2">v2</option><option value="3" selected>v3</option></select></label></div><label class="opt"><input id="ev-history" type="checkbox" checked> Retained v1 records must still be readable</label><label class="opt"><input id="ev-rollback" type="checkbox" checked> A v1 reader rollback must remain safe</label><div id="ev-audit" aria-live="polite"></div>';
      var selectedW=1,selectedR=3;
      function detail(){var p=V.pair($('ev-case').value,selectedW,selectedR);
        $('ev-detail').textContent='Writer v'+selectedW+' → reader v'+selectedR+'\n'+verdict(p)+'\nBytes: '+E.hex(p.bytes)+'\n'+(p.ok?'Values: '+JSON.stringify(p.value)+'\nDefaults used: '+(p.defaults.join(', ')||'none')+'\nIgnored: '+(p.ignored.join(', ')||'none')+'\nInterpreted cents: '+p.cents:'Error: '+p.error);
      }
      function draw(){var kind=$('ev-case').value,m=V.matrix(kind),html='<div class="table-scroll"><table class="matrix"><thead><tr><th scope="col">Writer / reader</th><th scope="col">v1</th><th scope="col">v2</th><th scope="col">v3</th></tr></thead><tbody>';
        m.forEach(function(row,w){html+='<tr><th scope="row">v'+(w+1)+'</th>';row.forEach(function(p,r){var short=!p.ok?'Error':p.meaning==='correct'?'OK':p.meaning==='wrong'?'Wrong amount':'No amount';html+='<td class="'+(!p.ok?'bad':p.meaning==='correct'?'ok':'warn')+'"><button class="btn ghost ev-cell" type="button" data-w="'+(w+1)+'" data-r="'+(r+1)+'" aria-label="Writer v'+(w+1)+' to reader v'+(r+1)+': '+verdict(p)+'">'+short+'</button></td>';});html+='</tr>';});
        $('ev-matrix').innerHTML=html+'</tbody></table></div><p>'+esc(V.scenarios[kind].why)+'</p>';
        $('ev-matrix').querySelectorAll('.ev-cell').forEach(function(b){b.onclick=function(){selectedW=+b.dataset.w;selectedR=+b.dataset.r;detail();};});
        $('ev-schemas').textContent=JSON.stringify(V.scenarios[kind].schemas,null,2)+'\nThe unit property is application metadata. Avro does not enforce it.';detail();
        var a=V.audit(kind,+$('ev-writer').value,+$('ev-reader').value,$('ev-history').checked,$('ev-rollback').checked);
        $('ev-audit').innerHTML=table(['Writer','Reader','Required outcome'],a.rows.map(function(x){return ['v'+x.writer,'v'+x.reader,verdict(x.result)];}))+'<p><b>'+(a.decodes?'All required pairs decode.':'A required pair cannot decode.')+' '+(a.meaning?'Every sample amount is correct.':'An amount is wrong or unavailable.')+'</b></p><p>This audit covers one declared workload: every record represents USD 12.00. It does not certify arbitrary data, other consumers or a registry policy.</p>';
      }
      watch(['ev-case','ev-writer','ev-reader','ev-history','ev-rollback'],draw);
    }
  });
})();
