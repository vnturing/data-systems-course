/* Reusable quiz widget.
   <div class="quiz" data-lesson-id="0001"></div>
   <script type="application/json" id="quiz-data">[{"q":"..","options":[".."],"answer":2,"why":".."}]</script>
   Authoring rules (checked by tools/check-quiz.py): all options in a question share a word count;
   correct-answer positions vary across questions. Options are never shuffled. */
(function(){
  document.addEventListener('DOMContentLoaded',function(){
    var root=document.querySelector('.quiz'); var raw=document.getElementById('quiz-data');
    if(!root||!raw) return;
    var data=JSON.parse(raw.textContent); var correct=0,answered=0;
    var score=document.createElement('div'); score.className='score';
    function upd(){score.textContent=answered+' / '+data.length+' answered, '+correct+' correct';}
    data.forEach(function(item,qi){
      var box=document.createElement('div'); box.className='q';
      box.innerHTML='<div class="n">Question '+(qi+1)+'</div><div class="p"></div>';
      box.querySelector('.p').textContent=item.q;
      var fb=document.createElement('div'); fb.className='fb';
      var btns=[];
      item.options.forEach(function(txt,i){
        var b=document.createElement('button'); b.className='o'; b.type='button'; b.textContent=txt;
        b.onclick=function(){
          if(box.dataset.done) return; box.dataset.done='1'; answered++;
          btns.forEach(function(x,j){x.disabled=true; if(j===item.answer) x.classList.add('right');});
          if(i===item.answer){correct++; fb.innerHTML='<b style="color:var(--ok)">Correct.</b> ';}
          else{b.classList.add('wrong'); fb.innerHTML='<b style="color:var(--bad)">Not quite.</b> ';}
          var s=document.createElement('span'); s.textContent=item.why; fb.appendChild(s);
          upd();
          if(answered===data.length && window.DSC){
            DSC.set('dsc:score:'+root.dataset.lessonId, correct+'/'+data.length);
            DSC.markDone(root.dataset.lessonId);
            score.innerHTML+=' &mdash; <b>lesson recorded as complete.</b>'+
              (correct<data.length?' Revisit the ones you missed tomorrow; spacing beats cramming.':'');
          }
        };
        btns.push(b); box.appendChild(b);
      });
      box.appendChild(fb); root.appendChild(box);
    });
    root.appendChild(score); upd();
  });
})();
