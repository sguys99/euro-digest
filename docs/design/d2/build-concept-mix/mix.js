(function(){
  var d=document.documentElement;
  var $=function(s,r){return (r||document).querySelector(s)};
  var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
  var store={get:function(k){try{return localStorage.getItem(k)}catch(e){return null}},set:function(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}}};
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  function play(el,cls){if(reduce||!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls)}
  function stamp(el){play(el,'is-in')}
  var toastEl=$('[data-toast]'),toastT=$('[data-toast-t]'),timer;
  function toast(m){if(!toastEl)return;toastT.textContent=m;toastEl.hidden=false;toastEl.style.animation='none';void toastEl.offsetWidth;toastEl.style.animation='';clearTimeout(timer);timer=setTimeout(function(){toastEl.hidden=true},2400)}
  document.addEventListener('click',function(e){var b=e.target.closest('[data-toast-msg]');if(b)toast(b.getAttribute('data-toast-msg'))});

  /* 테마 3상태 */
  var L={system:'시스템 설정',light:'라이트',dark:'다크'};
  function cur(){return d.getAttribute('data-theme')||'system'}
  function setT(t){if(t==='system')d.removeAttribute('data-theme');else d.setAttribute('data-theme',t);store.set('ed-theme',t==='system'?null:t);$$('[data-theme-toggle]').forEach(function(b){b.setAttribute('aria-label','테마: '+L[t]+' (눌러서 바꾸기)')})}
  $$('[data-theme-toggle]').forEach(function(b){b.addEventListener('click',function(){var o=['system','light','dark'];var nx=o[(o.indexOf(cur())+1)%3];setT(nx);toast('테마: '+L[nx])})});
  setT(cur());

  /* 결과 가리기 — 결과 칸(.rc) 하나 = W/D/L · 스코어 · 골 · 도움. 출전 상태 · 분 · 홈/원정은 남긴다 */
  var sw=$('[data-spoiler-switch]');
  function setS(on){if(on)d.setAttribute('data-spoiler','on');else d.removeAttribute('data-spoiler');store.set('ed-spoiler',on?'on':null);if(sw)sw.setAttribute('aria-checked',on?'true':'false');$$('.rc.is-shown').forEach(function(x){if(!x.closest('.spo-demo'))x.classList.remove('is-shown')})}
  if(sw){sw.setAttribute('aria-checked',d.getAttribute('data-spoiler')==='on'?'true':'false');sw.addEventListener('click',function(){var on=sw.getAttribute('aria-checked')!=='true';setS(on);toast(on?'결과 가리기 켬 — 스코어 · 골 · 도움을 가렸어요':'결과 가리기 끔')})}
  document.addEventListener('click',function(e){var b=e.target.closest('.spo-b');if(!b)return;var s=b.closest('.rc');s.classList.add('is-shown');var v=s.querySelector('.spo-v');if(v){v.setAttribute('tabindex','-1');v.focus({preventScroll:true})}});

  /* ARIA 탭 — 보기 전환(data-view)과 패널 전환 */
  $$('[role="tablist"]').forEach(function(list){
    var tabs=$$('[role="tab"]',list);
    function sel(t,focus){tabs.forEach(function(x){var on=x===t;x.setAttribute('aria-selected',on?'true':'false');x.tabIndex=on?0:-1;
      var view=x.getAttribute('data-view');
      if(view){if(on){var tb=document.getElementById(x.getAttribute('aria-controls'));if(tb){tb.setAttribute('data-view',view);$$('tbody',tb).forEach(stamp)}}}
      else{var p=document.getElementById(x.getAttribute('aria-controls'));if(p){p.hidden=!on;if(on)stamp(p)}}});
      if(focus)t.focus()}
    tabs.forEach(function(t,i){t.addEventListener('click',function(){sel(t)});t.addEventListener('keydown',function(e){var k=e.key,j=null;if(k==='ArrowRight')j=(i+1)%tabs.length;else if(k==='ArrowLeft')j=(i-1+tabs.length)%tabs.length;else if(k==='Home')j=0;else if(k==='End')j=tabs.length-1;if(j!==null){e.preventDefault();sel(tabs[j],true)}})});
  });

  /* 이적 — 타임라인 펼침(찍힘) · 핫 리스트에서 오면 항목 도착(:target) */
  function openTl(b,open){var p=document.getElementById(b.getAttribute('aria-controls'));b.setAttribute('aria-expanded',open?'true':'false');p.hidden=!open;var row=b.closest('.xr');if(row)row.classList.toggle('is-open',open);if(open)$$('.tln__i',p).forEach(stamp)}
  document.addEventListener('click',function(e){var b=e.target.closest('.tlb');if(!b)return;openTl(b,b.getAttribute('aria-expanded')!=='true')});
  function arrive(){var h=decodeURIComponent(location.hash.slice(1));if(!h)return;var el=document.getElementById(h);if(!el)return;var box=el.closest('.xr__tl');if(box&&box.hidden){var b=$('[aria-controls="'+box.id+'"]');if(b)openTl(b,true)}
    if(el.classList.contains('tln__i')){el.scrollIntoView({block:'center',behavior:reduce?'auto':'smooth'});el.focus({preventScroll:true})}}
  window.addEventListener('hashchange',arrive);if(location.hash)setTimeout(arrive,0);

  /* 이적 필터 — 축 안은 OR, 축 사이는 AND. 남은 행은 찍힘 */
  var list=$('[data-xlist]');
  if(list){
    var rows=$$('.xr',list),empty=$('[data-xempty]'),shown=$('[data-xshown]'),resets=$$('[data-xreset]'),fcount=$('[data-fcount]');
    var tg=$('.xf__tg'),panel=$('#xf-panel');
    if(tg)tg.addEventListener('click',function(){var o=tg.getAttribute('aria-expanded')!=='true';tg.setAttribute('aria-expanded',o?'true':'false');panel.hidden=!o;if(o)stamp(panel)});
    function apply(){
      var f={};$$('.xf [data-f][aria-pressed="true"]').forEach(function(b){var k=b.getAttribute('data-f');(f[k]=f[k]||[]).push(b.getAttribute('data-v'))});
      var n=0,keys=Object.keys(f);
      rows.forEach(function(r){var ok=keys.every(function(k){var have=(r.getAttribute('data-'+k)||'').split(' ');return f[k].some(function(v){return have.indexOf(v)>=0})});r.hidden=!ok;if(ok){n++;stamp(r)}});
      shown.textContent=n;empty.hidden=n>0;resets.forEach(function(b){b.hidden=keys.length===0});
      if(fcount)fcount.textContent=$$('.xf__panel [data-f][aria-pressed="true"]').length;
    }
    $$('.xf [data-f]').forEach(function(b){b.addEventListener('click',function(){b.setAttribute('aria-pressed',b.getAttribute('aria-pressed')==='true'?'false':'true');apply()})});
    resets.forEach(function(b){b.addEventListener('click',function(){$$('.xf [data-f]').forEach(function(x){x.setAttribute('aria-pressed','false')});apply()})});
  }

  /* 팔로우 — 한도 5. 꺼진 버튼은 한도에 이르면 점선 비활성 + 이유 문장(#fol-lim) */
  var MAX=5;
  function isSpec(id){return id.indexOf('spec')===0}
  function used(){var s={};$$('[data-follow][aria-pressed="true"]').forEach(function(b){var id=b.getAttribute('data-follow');if(!isSpec(id))s[id]=1});return Object.keys(s).length}
  function paint(){var u=used(),full=u>=MAX;
    $$('[data-follow]').forEach(function(b){var id=b.getAttribute('data-follow');if(isSpec(id))return;var on=b.getAttribute('aria-pressed')==='true';var t=$('.fol__t',b);
      if(!on&&full){b.setAttribute('aria-disabled','true');b.setAttribute('aria-describedby','fol-lim');t.textContent='팔로우 5/5'}else{b.removeAttribute('aria-disabled');b.removeAttribute('aria-describedby');t.textContent=on?'팔로우 중':'팔로우'}});
    var lim=$('#fol-lim');if(lim)lim.classList.toggle('lim--x',!full);var c=$('.my-cnt .n');if(c)c.textContent=u}
  document.addEventListener('click',function(e){var b=e.target.closest('[data-follow]');if(!b)return;var id=b.getAttribute('data-follow');
    if(b.getAttribute('aria-disabled')==='true'){toast('팔로우는 '+MAX+'개까지예요 — 마이에서 하나를 풀어 주세요');return}
    var on=b.getAttribute('aria-pressed')!=='true';
    if(isSpec(id)){b.setAttribute('aria-pressed',on?'true':'false');var t=$('.fol__t',b);if(t)t.textContent=on?'팔로우 중':'팔로우';play(b,'is-fold');return}
    $$('[data-follow="'+id+'"]').forEach(function(x){x.setAttribute('aria-pressed',on?'true':'false');play(x,'is-fold')});
    paint();toast((b.getAttribute('data-name')||'')+(on?' 팔로우':' 팔로우 해제'));
  });
  paint();

  /* 온보딩 — 단계 펼침(찍힘), 팀 최대 5 */
  $$('.ob__hd').forEach(function(h){h.addEventListener('click',function(){var b=document.getElementById(h.getAttribute('aria-controls'));var o=h.getAttribute('aria-expanded')!=='true';h.setAttribute('aria-expanded',o?'true':'false');b.hidden=!o;if(o)stamp(b)})});
  document.addEventListener('change',function(e){var i=e.target;if(i.name!=='ob-t')return;if($$('input[name="ob-t"]:checked').length>5){i.checked=false;toast('팀은 5개까지 고를 수 있어요')}});

  /* 검색 오버레이 — 책 뒤 색인(C). combobox + listbox, ↑↓ Enter Esc, 포커스 가둠 */
  var QD=__QDATA__;
  var w=$('[data-sov]'),inp=$('[data-sov-q]'),out=$('[data-sov-r]'),idx=$('[data-sov-idx]'),aft=$('[data-sov-after]'),opener=null,act=-1;
  function opts(){return $$('[role="option"]',out)}
  function setAct(k){var o=opts();o.forEach(function(x,j){x.setAttribute('aria-selected',j===k?'true':'false')});act=k;if(k>=0&&o[k]){inp.setAttribute('aria-activedescendant',o[k].id);o[k].scrollIntoView({block:'nearest'})}else inp.removeAttribute('aria-activedescendant')}
  function render(){var q=inp.value.trim().toLowerCase();act=-1;inp.removeAttribute('aria-activedescendant');
    if(!q){idx.hidden=false;out.hidden=true;out.innerHTML='';aft.innerHTML='';inp.setAttribute('aria-expanded','false');return}
    idx.hidden=true;var h=QD[q];
    if(h){out.innerHTML=h.lb;out.hidden=!h.lb;aft.innerHTML=h.after;stamp(out)}
    else{out.innerHTML='';out.hidden=true;aft.innerHTML='<p class="sx-0">시안은 준비된 질의 5개만 결과가 나와요 — 아래 칩을 누르거나 그대로 입력</p>'}
    inp.setAttribute('aria-expanded',opts().length?'true':'false')}
  function openS(){if(!w||!w.hidden)return;opener=document.activeElement;w.hidden=false;document.body.style.overflow='hidden';inp.value='';render();inp.focus()}
  function closeS(){if(!w)return;w.hidden=true;document.body.style.overflow='';if(opener&&opener.focus)opener.focus()}
  if(w){
    $$('[data-search]').forEach(function(b){b.addEventListener('click',openS)});
    $$('[data-sov-close]',w).forEach(function(b){b.addEventListener('click',closeS)});
    inp.addEventListener('input',render);
    inp.addEventListener('keydown',function(e){var o=opts();if(e.key==='ArrowDown'){e.preventDefault();if(o.length)setAct((act+1)%o.length)}else if(e.key==='ArrowUp'){e.preventDefault();if(o.length)setAct((act-1+o.length)%o.length)}else if(e.key==='Enter'&&act>=0&&o[act]){e.preventDefault();o[act].click()}});
    w.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();closeS();return}if(e.key==='Tab'){var f=$$('input,button,a[href]',w).filter(function(x){return x.offsetParent!==null});if(!f.length)return;var a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}});
    w.addEventListener('click',function(e){var c=e.target.closest('[data-q]');if(c){inp.value=c.getAttribute('data-q');render();inp.focus();return}if(e.target.closest('a[href^="#"]'))closeS()});
    document.addEventListener('keydown',function(e){var t=e.target,typing=t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable);if(!w.hidden)return;if((e.key==='/'&&!typing)||((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K'))){e.preventDefault();openS()}});
  }

  /* 시안 스크린샷용 쿼리: ?search=김민재&act=1 · ?spoiler=on · ?tl=1 · ?ob=3 */
  var qs=location.search,m;
  if((m=qs.match(/[?&]search=([^&]*)/))&&w){openS();inp.value=decodeURIComponent(m[1]);render();var a=qs.match(/[?&]act=(\d+)/);if(a)setAct(+a[1])}
  if(/[?&]spoiler=on/.test(qs))setS(true);
  if(/[?&]tl=1/.test(qs))$$('#s3 ~ .shell .tlb, .layout--x .tlb').slice(0,1).forEach(function(b){openTl(b,true)});
  if((m=qs.match(/[?&]ob=(\d)/))){$$('.ob__hd').forEach(function(h,i){var o=i===(+m[1]-1);h.setAttribute('aria-expanded',o?'true':'false');document.getElementById(h.getAttribute('aria-controls')).hidden=!o})}
})();
