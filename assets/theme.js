/* Theme toggle and progress helpers shared by all pages. Safe if storage is blocked. */
(function(){
  var K='dsc:theme';
  function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function set(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  var t=get(K); if(t) document.documentElement.setAttribute('data-theme',t);
  window.DSC={
    get:get,set:set,
    markDone:function(id){set('dsc:done:'+id,'1')},
    isDone:function(id){return get('dsc:done:'+id)==='1'},
    toggleTheme:function(){
      var cur=document.documentElement.getAttribute('data-theme');
      var dark=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches;
      var next=cur?(cur==='dark'?'light':'dark'):(dark?'light':'dark');
      document.documentElement.setAttribute('data-theme',next); set(K,next);
    }
  };
  document.addEventListener('DOMContentLoaded',function(){
    var b=document.getElementById('theme-btn'); if(b) b.onclick=DSC.toggleTheme;
    document.querySelectorAll('[data-lesson-id]').forEach(function(el){
      if(el.classList.contains('quiz')) return;
      if(DSC.isDone(el.dataset.lessonId)) el.insertAdjacentHTML('afterbegin','<span class="status-built" title="quiz completed">&#10003; </span>');
    });
  });
})();
