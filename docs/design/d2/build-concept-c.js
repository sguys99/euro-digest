(function(){
  var d=document.documentElement;
  var $=function(s,r){return (r||document).querySelector(s)};
  var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
  var store={get:function(k){try{return localStorage.getItem(k)}catch(e){return null}},set:function(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}}};
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var toastEl=$('[data-toast]'),toastT=$('[data-toast-t]'),timer;
  function toast(m){if(!toastEl)return;toastT.textContent=m;toastEl.hidden=false;toastEl.style.animation='none';void toastEl.offsetWidth;toastEl.style.animation='';clearTimeout(timer);timer=setTimeout(function(){toastEl.hidden=true},2400)}

  /* 테마 3상태 — 잉크 전환 */
  var L={system:'시스템 설정',light:'라이트',dark:'다크'};
  function cur(){return d.getAttribute('data-theme')||'system'}
  function setTheme(t){if(t==='system')d.removeAttribute('data-theme');else d.setAttribute('data-theme',t);store.set('ed-theme',t==='system'?null:t);$$('meta[name="theme-color"]').forEach(function(m){var md=m.getAttribute('data-m')||m.getAttribute('media');m.setAttribute('data-m',md);m.setAttribute('media',t==='system'?md:(md.indexOf(t)<0?'not all':'all'))});$$('[data-theme-toggle]').forEach(function(b){b.setAttribute('aria-label','테마: '+L[t]+' (눌러서 바꾸기)')})}
  $$('[data-theme-toggle]').forEach(function(b){b.addEventListener('click',function(){var o=['system','light','dark'];var nx=o[(o.indexOf(cur())+1)%3];setTheme(nx);toast('테마: '+L[nx])})});
  $$('[data-theme-toggle]').forEach(function(b){b.setAttribute('aria-label','테마: '+L[cur()]+' (눌러서 바꾸기)')});

  /* 결과 가리기 — 스코어·W/D/L 칸만, 펼치기 = 뜯김(D0) */
  var sw=$('[data-spoiler-toggle]');
  function setSp(on){if(on)d.setAttribute('data-spoiler','on');else d.removeAttribute('data-spoiler');if(sw)sw.setAttribute('aria-checked',on?'true':'false');store.set('ed-spoiler',on?'on':null);if(!on)$$('.spo.is-shown:not(.spo--force)').forEach(function(x){x.classList.remove('is-shown')})}
  if(sw){sw.setAttribute('aria-checked',d.getAttribute('data-spoiler')==='on'?'true':'false');sw.addEventListener('click',function(){var on=d.getAttribute('data-spoiler')!=='on';setSp(on);toast('결과 가리기: '+(on?'켬':'끔'))})}
  document.addEventListener('click',function(e){var v=e.target.closest('.spo__veil');if(!v)return;var s=v.closest('.spo');s.classList.add('is-shown');var val=s.querySelector('.spo__v');if(val){val.setAttribute('tabindex','-1');val.focus({preventScroll:true})}});

  /* 팔로우 — 한도 5(시안 가정) */
  var MAX=5;
  function used(){var s={};$$('.mg [data-follow][aria-pressed="true"]').forEach(function(b){s[b.getAttribute('data-follow')]=1});return Object.keys(s).length}
  function syncFollow(){var u=used();$$('[data-fol-count]').forEach(function(x){x.textContent=u+'/'+MAX});}
  document.addEventListener('click',function(e){var b=e.target.closest('.fol');if(!b)return;if(b.getAttribute('aria-disabled')==='true'){toast('팔로우는 5개까지 — 마이에서 정리하세요');return}
    var key=b.getAttribute('data-follow'),on=b.getAttribute('aria-pressed')!=='true';
    if(on&&key.indexOf('spec:')!==0&&used()>=MAX&&!$('.mg [data-follow="'+key+'"]')){toast('팔로우는 5개까지');return}
    $$('[data-follow="'+key+'"]').forEach(function(x){if(x.classList.contains('fol--limit'))return;x.setAttribute('aria-pressed',on?'true':'false');var t=x.querySelector('.fol__t');if(t)t.textContent=on?t.getAttribute('data-on'):t.getAttribute('data-off')});
    syncFollow();toast(on?'팔로우했어요':'팔로우를 껐어요')});

  /* 이적 색인(필터) — 묶음 안 OR, 묶음끼리 AND · 결과 진입 모션 없음(C) */
  var ix=$('[data-ix]');
  if(ix){
    var det=$('[data-ix-details]'),mq=window.matchMedia('(min-width:1024px)');
    function openWide(){if(mq.matches)det.open=true}
    openWide();if(mq.addEventListener)mq.addEventListener('change',openWide);
    var stys=$$('[data-stys] .sty'),res=$('[data-tr-res]'),emp=$('[data-tr-empty]'),sel=$('[data-ix-sel]'),selDef=sel.textContent;
    function apply(){
      var f={};$$('.ix__e[aria-pressed="true"]',ix).forEach(function(b){(f[b.getAttribute('data-f')]=f[b.getAttribute('data-f')]||[]).push(b.getAttribute('data-v'))});
      var keys=Object.keys(f),shown=0,labels=[];
      $$('.ix__e[aria-pressed="true"] .ix__l',ix).forEach(function(l){labels.push(l.textContent.trim())});
      stys.forEach(function(s){var ok=keys.every(function(k){var have=(s.getAttribute('data-'+k)||'').split(' ');return f[k].some(function(v){return have.indexOf(v)>=0})});s.hidden=!ok;if(ok)shown++});
      emp.hidden=shown>0;
      res.innerHTML=(keys.length?'색인 '+labels.length+'개 · ':'전체 ')+'<b class="n">'+shown+'</b>건 · 최근 갱신 순';
      sel.textContent=labels.length?'선택: '+labels.join(' · '):selDef;
    }
    ix.addEventListener('click',function(e){var b=e.target.closest('.ix__e');if(b){if(b.getAttribute('aria-disabled')==='true'){toast('이 항목은 지금 0건이에요');return}b.setAttribute('aria-pressed',b.getAttribute('aria-pressed')==='true'?'false':'true');apply();return}
      if(e.target.closest('[data-ix-clear]')){$$('.ix__e',ix).forEach(function(x){x.setAttribute('aria-pressed','false')});apply()}});
  }

  /* 구독 신청서 — 375는 한 칸씩, 1024 이상은 한 장 */
  var ob=$('[data-ob-form]');
  if(ob){
    var steps=$$('[data-ob-step]',ob),ind=$$('[data-ob-ind]',ob),i=0,prev=$('[data-ob-prev]',ob),next=$('[data-ob-next]',ob),TMAX=5;
    ob.classList.add('is-step');
    function go(k){i=Math.max(0,Math.min(steps.length-1,k));steps.forEach(function(s,j){s.classList.toggle('is-cur',j===i)});ind.forEach(function(x,j){if(j===i)x.setAttribute('aria-current','step');else x.removeAttribute('aria-current')});prev.hidden=i===0;next.innerHTML=i===steps.length-1?'마치기':'다음<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter"><path d="M9.5 6l6 6-6 6"/></svg>'}
    go(0);
    prev.addEventListener('click',function(){go(i-1);steps[i].querySelector('legend').scrollIntoView({block:'nearest'})});
    next.addEventListener('click',function(){if(i===steps.length-1){toast('내 지면이 생겼어요(시안)');return}go(i+1)});
    $('[data-ob-done]',ob).addEventListener('click',function(){toast('내 지면이 생겼어요(시안)')});
    $('[data-ob-skip]',ob).addEventListener('click',function(){toast('건너뛰었어요 — 마이에서 언제든 고를 수 있어요')});
    function tcount(){var n=$$('[data-ob="team"][aria-pressed="true"]',ob).length;$('[data-ob-tc]',ob).textContent=n+'/'+TMAX;$$('[data-ob="team"]',ob).forEach(function(b){if(b.getAttribute('aria-pressed')!=='true'){if(n>=TMAX)b.setAttribute('aria-disabled','true');else b.removeAttribute('aria-disabled')}})}
    ob.addEventListener('click',function(e){var b=e.target.closest('.ob__o');if(!b)return;if(b.getAttribute('aria-disabled')==='true'){toast('팀은 5개까지 고를 수 있어요');return}b.setAttribute('aria-pressed',b.getAttribute('aria-pressed')==='true'?'false':'true');if(b.getAttribute('data-ob')==='team')tcount()});
    tcount();
  }
  /* ARIA 탭(신청서 리그 탭) — ← → Home End, 색 면 전환만 */
  $$('[role="tablist"]').forEach(function(list){
    var tabs=$$('[role="tab"]',list);
    function sel(t,focus){tabs.forEach(function(x){var on=x===t;x.setAttribute('aria-selected',on?'true':'false');x.tabIndex=on?0:-1;var p=document.getElementById(x.getAttribute('aria-controls'));if(p)p.hidden=!on});if(focus)t.focus()}
    tabs.forEach(function(t,k){t.addEventListener('click',function(){sel(t)});t.addEventListener('keydown',function(e){var j=null;if(e.key==='ArrowRight')j=(k+1)%tabs.length;else if(e.key==='ArrowLeft')j=(k-1+tabs.length)%tabs.length;else if(e.key==='Home')j=0;else if(e.key==='End')j=tabs.length-1;if(j!==null){e.preventDefault();sel(tabs[j],true)}})});
  });

  /* 검색 오버레이 — 책 뒤 색인. combobox + listbox, ↑↓ Enter Esc */
  var QD=__QDATA__;
  var w=$('[data-sov]'),inp=$('[data-sov-q]'),out=$('[data-sov-r]'),idx=$('[data-sov-idx]'),aft=$('[data-sov-after]'),opener=null,act=-1;
  function opts(){return $$('[role="option"]',out)}
  function setAct(k){var o=opts();o.forEach(function(x,j){x.setAttribute('aria-selected',j===k?'true':'false')});act=k;if(k>=0&&o[k]){inp.setAttribute('aria-activedescendant',o[k].id);o[k].scrollIntoView({block:'nearest'})}else inp.removeAttribute('aria-activedescendant')}
  function render(){var q=inp.value.trim().toLowerCase();act=-1;inp.removeAttribute('aria-activedescendant');
    if(!q){idx.hidden=false;out.hidden=true;out.innerHTML='';aft.innerHTML='';inp.setAttribute('aria-expanded','false');return}
    idx.hidden=true;var h=QD[q];
    if(h){out.innerHTML=h.lb;out.hidden=!h.lb;aft.innerHTML=h.after}
    else{out.innerHTML='';out.hidden=true;aft.innerHTML='<p class="sres__0">시안에는 준비된 질의 5개(김민재 · Lee Kang-in · 토트넘 · 정우영 · Magdeburg)만 있어요. 실제 화면은 Pagefind 결과를 같은 묶음으로 보여 준다.</p>'}
    inp.setAttribute('aria-expanded',opts().length?'true':'false')}
  function openS(e){if(!w)return;opener=e&&e.currentTarget||document.activeElement;w.hidden=false;document.body.style.overflow='hidden';inp.value='';render();inp.focus()}
  function closeS(){w.hidden=true;document.body.style.overflow='';if(opener&&opener.focus)opener.focus()}
  $$('[data-search-open]').forEach(function(b){b.addEventListener('click',openS)});
  if(w){
    $$('[data-sov-close]',w).forEach(function(b){b.addEventListener('click',closeS)});
    inp.addEventListener('input',render);
    inp.addEventListener('keydown',function(e){var o=opts();if(e.key==='ArrowDown'){e.preventDefault();if(o.length)setAct((act+1)%o.length)}else if(e.key==='ArrowUp'){e.preventDefault();if(o.length)setAct((act-1+o.length)%o.length)}else if(e.key==='Enter'&&act>=0&&o[act]){e.preventDefault();o[act].click()}});
    w.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();closeS();return}if(e.key==='Tab'){var f=$$('input,button,a[href]',w).filter(function(x){return x.offsetParent!==null});if(!f.length)return;var a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}});
    w.addEventListener('click',function(e){var c=e.target.closest('[data-q]');if(c){inp.value=c.getAttribute('data-q');render();inp.focus();return}if(e.target.closest('a[href^="#"]'))closeS()});
  }
  $$('.gix [data-q]').forEach(function(c){if(c.closest('[data-sov]'))return;c.addEventListener('click',function(){openS();inp.value=c.getAttribute('data-q');render()})});
  document.addEventListener('keydown',function(e){var t=e.target,typing=t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable);if(w&&!w.hidden)return;if((e.key==='/'&&!typing)||((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K'))){e.preventDefault();openS()}});
  /* 시안 스크린샷용: ?search=김민재 → 오버레이 열고 입력 · ?ob=2 → 신청서 단계 */
  var qs=location.search;
  var m=qs.match(/[?&]search=([^&]*)/);if(m){openS();inp.value=decodeURIComponent(m[1]);render();var a=qs.match(/[?&]act=(\d+)/);if(a)setAct(+a[1])}
  var o2=qs.match(/[?&]ob=(\d)/);if(o2&&ob){go(+o2[1]-1)}
  var sp=qs.match(/[?&]spoiler=on/);if(sp)setSp(true);
})();
