/* Thin DOM layer for the five second-half Module 3 labs. All user text uses textContent.
   The shared stylesheet, quiz and theme components remain the course defaults. */
(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded',function(){
    var S=window.StorageExtra;
    function $(id){return document.getElementById(id);}
    function table(headers,rows){return '<div class="table-scroll"><table><thead><tr>'+headers.map(function(h){return '<th scope="col">'+h+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(r){return '<tr>'+r.map(function(c){return '<td>'+c+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';}
    function watch(ids,draw){ids.forEach(function(id){$(id).addEventListener('input',draw);});draw();}
    var h=$('sim-indexes');
    if(h){
      h.innerHTML='<h4>Interactive · Choose the access path</h4><p>100,000 orders; tenant 42 has 1,000. Predict which work covering removes, then change the index.</p>'+
        '<div class="row"><label for="ix-kind">Index <select id="ix-kind"><option value="tenant">(tenant)</option><option value="rangeFirst">(tenant, date, status)</option><option value="good">(tenant, status, date)</option><option value="covering">(tenant, status, date, amount)</option><option value="scan">Full table scan</option></select></label></div>'+
        '<div class="row"><label for="ix-day">Earliest date bucket <input id="ix-day" type="range" min="0" max="99" value="90"> <output id="ix-day-value"></output></label></div>'+
        '<label class="opt"><input id="ix-icp" type="checkbox"> Enable index condition pushdown (ICP)</label><div id="ix-output" aria-live="polite"></div>';
      watch(['ix-kind','ix-day','ix-icp'],function(){var r=S.indexes($('ix-kind').value,+$('ix-day').value,$('ix-icp').checked);$('ix-day-value').textContent=$('ix-day').value;
        $('ix-output').innerHTML=table(['Entries in search range','Clustered records fetched','Matching rows','SUM(amount)'],[[r.entries.toLocaleString(),r.lookups.toLocaleString(),r.matches,r.sum]])+
          '<p>Model counts, not disk reads or latency. Covering avoids the modeled clustered fetches. ICP rejects nonmatching secondary entries before those fetches; it does not remove them from the search range.</p>';
      });
    }
    h=$('sim-persistence');
    if(h){
      h.innerHTML='<h4>Interactive · Which acknowledged writes come back?</h4><p>Six SETs assign counter values 1 through 6. The model schedules a completed fsync or snapshot exactly at each whole second.</p>'+
        '<div class="row"><label for="ps-mode">Policy <select id="ps-mode"><option value="everysec">AOF: every second</option><option value="always">AOF: before reply</option><option value="rdb">RDB: completed snapshot each second</option><option value="no">AOF: no explicit fsync</option><option value="none">No persistence</option></select></label></div>'+
        '<div class="row"><label for="ps-scope">Failure <select id="ps-scope"><option value="host">Lose RAM and OS cache</option><option value="process">Process only; OS cache survives</option></select></label></div>'+
        '<label for="ps-time">Crash at <input id="ps-time" type="range" min="50" max="2450" step="50" value="1950"> <output id="ps-time-value"></output> ms</label><div id="ps-output" aria-live="polite"></div>';
      watch(['ps-mode','ps-scope','ps-time'],function(){var r=S.persistence($('ps-mode').value,+$('ps-time').value,$('ps-scope').value);$('ps-time-value').textContent=$('ps-time').value;
        $('ps-output').innerHTML=table(['Acknowledged','Recovered counter','Lost acknowledged SETs'],[[r.acknowledged,r.recovered,r.lost]])+
          table(['Time','Value','At this crash'],r.events.map(function(e){return [e.time+' ms',e.value,!e.acknowledged?'Not issued':e.recovered?'Recovered':'Acknowledged, lost'];}))+
          '<p>Idealized failure drill. In “no explicit fsync” host failures we choose a possible outcome in which the OS has flushed nothing. Real scheduling, device honesty, fork pauses and write latency are excluded; everysec is not a hard real-time deadline.</p>';
      });
    }
    h=$('sim-workloads');
    if(h){
      h.innerHTML='<h4>Interactive · Put a report behind checkout</h4><p>Checkouts arrive every 5 ms and use one resource for 1 ms. Every second a report joins the same FIFO queue just before a checkout. There is one resource, no preemption and no parallel I/O.</p>'+
        '<label for="wk-report">Resource time per report <input id="wk-report" type="range" min="0" max="1200" step="50" value="200"> <output id="wk-value"></output> ms</label>'+
        '<label class="opt"><input id="wk-separate" type="checkbox"> Give reporting a separate resource</label><div id="wk-output" aria-live="polite"></div>';
      watch(['wk-report','wk-separate'],function(){var ms=+$('wk-report').value,r=S.workload(ms,$('wk-separate').checked);$('wk-value').textContent=ms;
        $('wk-output').innerHTML=table(['Checkout p99','Worst checkout','Checkouts over 50 ms'],[[r.p99+' ms',r.max+' ms',r.misses+' / '+r.total]])+
          '<p>A separate resource removes contention in this model; a real pipeline adds cost and lag. It does not automatically isolate storage, networking or the source database.</p>';
      });
    }
    h=$('sim-columns');
    if(h){
      h.innerHTML='<h4>Interactive · Four different savings</h4><p>10,000 rows, 12 fixed-width 8-byte columns, 100 rows per group. The predicate selects the final 5% of rows. Counts below are an uncompressed model.</p>'+
        '<label for="cl-project">Columns needed (including the filter) <input id="cl-project" type="range" min="2" max="12" value="2"> <output id="cl-value"></output></label>'+
        '<label class="opt"><input id="cl-sort" type="checkbox" checked> Rows sorted by the filter column; group ranges do not overlap</label>'+
        '<label for="cl-batch">Execution batch <select id="cl-batch"><option value="1">1 row</option><option value="128">128 rows</option><option value="2048" selected>2,048 rows</option></select></label><div id="cl-output" aria-live="polite"></div>'+
        '<h4>Encoding: same four values, different order</h4><label class="opt"><input id="cl-runs" type="checkbox" checked> Put equal values together</label><div id="cl-encoding" aria-live="polite"></div>';
      watch(['cl-project','cl-sort','cl-batch','cl-runs'],function(){var n=+$('cl-project').value,r=S.columns(10000,n,$('cl-sort').checked,+$('cl-batch').value),e=S.encodings($('cl-runs').checked);$('cl-value').textContent=n;
        $('cl-output').innerHTML=table(['Row scan bytes','Projected bytes','After group pruning','Batch dispatches'],[[r.rowBytes.toLocaleString(),r.columnBytes.toLocaleString(),r.prunedBytes.toLocaleString(),r.batchCalls]])+
          '<p>'+r.kept+' / '+r.groups+' groups remain. Dispatch count is ceil(10,000 / batch size); it is not CPU instructions or predicted speedup.</p>';
        $('cl-encoding').innerHTML=table(['1,000 int32 values','Dictionary + packed IDs','Dictionary + runs'],[[e.plain+' bytes',e.dictionary+' bytes',e.rle+' bytes ('+e.runs+' runs)']])+
          '<p>Toy encodings: 16-byte dictionary, 2-bit IDs; each run uses a 1-byte ID plus 4-byte count. This is not Parquet’s hybrid RLE encoding. Short runs make this toy RLE larger than plain values.</p>';
      });
    }
    h=$('sim-views');
    if(h){
      h.innerHTML='<h4>Interactive · Maintain a revenue view</h4><p>Insert three orders; move order 2 from EU/300 to US/500; delete order 1. Event e4 carries both the old and new values.</p>'+
        '<div class="row"><label for="mv-delivery">Delivery <select id="mv-delivery"><option value="clean">All five events</option><option value="lag">Only the first three (lag)</option><option value="duplicate" selected>Replay the update e4</option></select></label></div>'+
        '<label class="opt"><input id="mv-dedupe" type="checkbox"> Deduplicate event IDs</label>'+
        '<label class="opt"><input id="mv-atomic" type="checkbox" checked> Commit the view delta and dedupe marker atomically</label><div id="mv-output" aria-live="polite"></div>';
      watch(['mv-delivery','mv-dedupe','mv-atomic'],function(){var mode=$('mv-delivery').value,events=mode==='lag'?[0,1,2]:mode==='duplicate'?[0,1,2,3,3,4]:[0,1,2,3,4];
        var r=S.materialize(events,$('mv-dedupe').checked,$('mv-atomic').checked),rows=[];
        ['EU','US'].forEach(function(k){var a=r.view[k]||{sum:0,count:0},t=r.truth[k]||{sum:0,count:0};rows.push([k,a.sum,a.count,t.sum,t.count]);});
        $('mv-output').innerHTML=table(['Region','View sum','View count','Latest truth sum','Latest truth count'],rows)+
          '<p><b>'+(r.correct?'View matches latest base data.':'View differs from latest base data.')+'</b> '+r.applied+' event applications. '+(mode==='lag'?'This is staleness, not duplicate corruption.':'')+
          (!$('mv-atomic').checked&&mode!=='lag'?' A crash is injected after the first e4 delta and before its marker; replay can apply it again.':'')+'</p><p>This lab orders events and uses exact integer amounts. Out-of-order updates, joins, concurrent refresh and distinct aggregates need more state and are not simulated.</p>';
      });
    }
  });
})();
