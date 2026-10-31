(function(){
  var d=document.documentElement;
  var $=function(s,r){return (r||document).querySelector(s)};
  var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
  var store={get:function(k){try{return localStorage.getItem(k)}catch(e){return null}},set:function(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}}};
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  function stamp(el){if(reduce||!el)return;el.classList.remove('is-in');void el.offsetWidth;el.classList.add('is-in')}
  var toastEl=$('[data-toast]'),toastT=$('[data-toast-t]'),timer;
  function toast(m){if(!toastEl)return;toastT.textContent=m;toastEl.hidden=false;toastEl.style.animation='none';void toastEl.offsetWidth;toastEl.style.animation='';clearTimeout(timer);timer=setTimeout(function(){toastEl.hidden=true},2400)}

  /* 테마 3상태 */
  var L={system:'시스템 설정',light:'라이트',dark:'다크'};
  function cur(){return d.getAttribute('data-theme')||'system'}
  function setT(t){if(t==='system')d.removeAttribute('data-theme');else d.setAttribute('data-theme',t);store.set('ed-theme',t==='system'?null:t);$$('[data-theme-toggle]').forEach(function(b){b.setAttribute('aria-label','테마: '+L[t]+' (눌러서 바꾸기)')})}
  $$('[data-theme-toggle]').forEach(function(b){b.addEventListener('click',function(){var o=['system','light','dark'];var nx=o[(o.indexOf(cur())+1)%3];setT(nx);toast('테마: '+L[nx])})});
  setT(cur());

  /* 결과 가리기 스위치 */
  var sw=$('[data-spoiler-switch]');
  function setS(on){if(on)d.setAttribute('data-spoiler','on');else d.removeAttribute('data-spoiler');store.set('ed-spoiler',on?'on':null);if(sw)sw.setAttribute('aria-checked',on?'true':'false');$$('.spo.is-shown').forEach(function(x){x.classList.remove('is-shown')})}
  if(sw){sw.setAttribute('aria-checked',d.getAttribute('data-spoiler')==='on'?'true':'false');sw.addEventListener('click',function(){var on=sw.getAttribute('aria-checked')!=='true';setS(on);toast(on?'결과 가리기 켬 — 스코어 칸을 가렸어요':'결과 가리기 끔')})}
  document.addEventListener('click',function(e){var b=e.target.closest('.spo-b');if(!b)return;var s=b.closest('.spo');if(s.closest('.spo-demo')){s.closest('.spo-demo').classList.remove('spo-demo')}s.classList.add('is-shown');var v=s.querySelector('.spo-v');if(v){v.setAttribute('tabindex','-1');v.focus()}});

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

  /* 이적 — 타임라인 펼침(찍힘) */
  document.addEventListener('click',function(e){var b=e.target.closest('.tlb');if(!b)return;var p=document.getElementById(b.getAttribute('aria-controls'));var open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',open?'true':'false');p.hidden=!open;var row=b.closest('.xr');if(row)row.classList.toggle('is-open',open);if(open)$$('li',p).forEach(stamp)});

  /* 이적 필터 — 축 안은 OR, 축 사이는 AND. 남은 행은 찍힘 */
  var list=$('[data-xlist]');
  if(list){
    var rows=$$('.xr',list),empty=$('[data-xempty]'),shown=$('[data-xshown]'),resets=$$('[data-xreset]'),fcount=$('[data-fcount]');
    var tg=$('.xf__tg'),panel=$('#xf-panel');
    if(tg)tg.addEventListener('click',function(){var o=tg.getAttribute('aria-expanded')!=='true';tg.setAttribute('aria-expanded',o?'true':'false');panel.hidden=!o;if(o)stamp(panel)});
    function apply(){
      var f={};$$('.xf [data-f][aria-pressed="true"]').forEach(function(b){var k=b.getAttribute('data-f');(f[k]=f[k]||[]).push(b.getAttribute('data-v'))});
      var n=0,keys=Object.keys(f);
      rows.forEach(function(r){var ok=keys.every(function(k){var have=(r.getAttribute('data-'+(k==='kr'?'kr':k))||'').split(' ');return f[k].some(function(v){return have.indexOf(v)>=0})});var was=!r.hidden;r.hidden=!ok;if(ok){n++;stamp(r)}});
      shown.textContent=n;empty.hidden=n>0;resets.forEach(function(b){b.hidden=keys.length===0});
      if(fcount){var c=$$('.xf__panel [data-f][aria-pressed="true"]').length;fcount.textContent=c}
    }
    $$('.xf [data-f]').forEach(function(b){b.addEventListener('click',function(){b.setAttribute('aria-pressed',b.getAttribute('aria-pressed')==='true'?'false':'true');apply()})});
    resets.forEach(function(b){b.addEventListener('click',function(){$$('.xf [data-f]').forEach(function(x){x.setAttribute('aria-pressed','false')});apply()})});
  }

  /* 팔로우 — 한도 5 */
  var MAX=5;
  function used(){var s={};$$('[data-follow][aria-pressed="true"]').forEach(function(b){var id=b.getAttribute('data-follow');if(id.indexOf('spec')!==0)s[id]=1});return Object.keys(s).length}
  document.addEventListener('click',function(e){var b=e.target.closest('[data-follow]');if(!b)return;var id=b.getAttribute('data-follow');
    if(b.getAttribute('aria-disabled')==='true'){toast('팔로우는 '+MAX+'개까지예요 — 마이에서 하나를 풀어 주세요');return}
    var on=b.getAttribute('aria-pressed')!=='true';
    if(id.indexOf('spec')===0){b.setAttribute('aria-pressed',on?'true':'false');return}
    if(on&&used()>=MAX){toast('팔로우는 '+MAX+'개까지예요');return}
    $$('[data-follow="'+id+'"]').forEach(function(x){x.setAttribute('aria-pressed',on?'true':'false')});
    var u=used();var lim=$('#lim-note');if(lim)lim.classList.toggle('lim--x',u<MAX);
    var c=$('.my-cnt .n');if(c)c.textContent=u;
    toast(on?'팔로우했어요':'팔로우를 풀었어요');
  });

  /* 온보딩 — 단계 펼침(찍힘), 팀 최대 5 */
  $$('.ob__hd').forEach(function(h){h.addEventListener('click',function(){var b=document.getElementById(h.getAttribute('aria-controls'));var o=h.getAttribute('aria-expanded')!=='true';h.setAttribute('aria-expanded',o?'true':'false');b.hidden=!o;if(o)stamp(b)})});
  document.addEventListener('change',function(e){var i=e.target;if(i.name!=='ob-t')return;var c=$$('input[name="ob-t"]:checked');if(c.length>5){i.checked=false;toast('팀은 5개까지 고를 수 있어요')}});

  /* 검색 오버레이 — / · ⌘K · Esc · ↑↓ */
  var ov=$('#ov'),inp=$('#ov-i'),opener=null;
  function show(q){var k=(q||'').trim().toLowerCase();var any=false;$$('.ov__res',ov).forEach(function(p){var on=k&&p.getAttribute('data-q')===k;p.hidden=!on;if(on){any=true;stamp(p)}});var none=$('[data-ov-none]',ov);none.hidden=!k||any}
  function openOv(){if(!ov||ov.open)return;opener=document.activeElement;if(ov.showModal)ov.showModal();else ov.setAttribute('open','');inp.focus();show(inp.value)}
  function closeOv(){if(!ov)return;if(ov.close)ov.close();else ov.removeAttribute('open')}
  if(ov){
    ov.addEventListener('close',function(){if(opener&&opener.focus)opener.focus()});
    $$('[data-search]').forEach(function(b){b.addEventListener('click',openOv)});
    $('[data-ov-close]',ov).addEventListener('click',closeOv);
    inp.addEventListener('input',function(){show(inp.value)});
    $$('[data-ov-q]',ov).forEach(function(b){b.addEventListener('click',function(){inp.value=b.getAttribute('data-ov-q');show(inp.value);inp.focus()})});
    document.addEventListener('keydown',function(e){var t=e.target,typing=t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable);
      if((e.key==='/'&&!typing)||(e.key==='k'&&(e.metaKey||e.ctrlKey))){e.preventDefault();openOv()}});
    ov.addEventListener('keydown',function(e){if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;var items=$$('.ov__res:not([hidden]) .sx-r, .ov__res:not([hidden]) .nr__t a',ov);if(!items.length)return;e.preventDefault();var i=items.indexOf(document.activeElement);var j=e.key==='ArrowDown'?(i+1)%items.length:(i<=0?items.length-1:i-1);if(i<0&&e.key==='ArrowDown')j=0;items.forEach(function(x){x.classList.remove('is-act')});items[j].focus();if(items[j].classList.contains('sx-r'))items[j].classList.add('is-act')});
  }
})();
