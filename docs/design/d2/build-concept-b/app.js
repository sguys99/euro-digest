(function(){
  var d=document.documentElement;
  var $=function(s,r){return (r||document).querySelector(s)};
  var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
  var store={get:function(k){try{return localStorage.getItem(k)}catch(e){return null}},set:function(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}}};
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var Q={};try{new URLSearchParams(location.search).forEach(function(v,k){Q[k]=v})}catch(e){}
  function play(el,cls){if(!el||reduce)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls)}

  /* 토스트 */
  var toastEl=$('[data-toast]'),toastT=$('[data-toast-t]'),timer;
  function toast(m){if(!toastEl)return;toastT.textContent=m;toastEl.hidden=false;toastEl.style.animation='none';void toastEl.offsetWidth;toastEl.style.animation='';clearTimeout(timer);timer=setTimeout(function(){toastEl.hidden=true},2400)}
  $$('[data-toast-msg]').forEach(function(b){b.addEventListener('click',function(){toast(b.getAttribute('data-toast-msg'))})});

  /* 테마 3상태 (DESIGN §8) */
  var L={system:'시스템 설정',light:'라이트',dark:'다크'};
  function cur(){return d.getAttribute('data-theme')||'system'}
  function setT(t){if(t==='system')d.removeAttribute('data-theme');else d.setAttribute('data-theme',t);store.set('ed-theme',t==='system'?null:t);$$('[data-theme-toggle]').forEach(function(b){b.setAttribute('aria-label','테마: '+L[t]+' (눌러서 바꾸기)')})}
  $$('[data-theme-toggle]').forEach(function(b){b.addEventListener('click',function(){var o=['system','light','dark'];var nx=o[(o.indexOf(cur())+1)%3];setT(nx);toast('테마: '+L[nx])})});
  setT(cur());

  /* ARIA 탭 — 자동 활성화, ← → Home End */
  $$('[role="tablist"]').forEach(function(list){
    var tabs=$$('[role="tab"]',list);
    function sel(t,focus){tabs.forEach(function(x){var on=x===t;x.setAttribute('aria-selected',on?'true':'false');x.tabIndex=on?0:-1;var p=document.getElementById(x.getAttribute('aria-controls'));if(p){p.hidden=!on;if(on)play(p,'is-in')}});if(focus)t.focus()}
    tabs.forEach(function(t,i){t.addEventListener('click',function(){sel(t)});t.addEventListener('keydown',function(e){var k=e.key,j=null;if(k==='ArrowRight'||k==='ArrowDown')j=(i+1)%tabs.length;else if(k==='ArrowLeft'||k==='ArrowUp')j=(i-1+tabs.length)%tabs.length;else if(k==='Home')j=0;else if(k==='End')j=tabs.length-1;if(j!==null){e.preventDefault();sel(tabs[j],true)}})});
  });

  /* 팔로우 — 표본 5/5(한도). 접힘 모션 200ms */
  var MAX=5,follow={'bayern-munchen':1,'atletico-madrid':1,'arsenal':1,'kim-min-jae':1,'lee-kang-in':1};
  function count(){return Object.keys(follow).length}
  function paint(){
    var n=count();
    $$('[data-follow]').forEach(function(b){
      var k=b.getAttribute('data-follow');if(/^spec-|-spec$/.test(k))return;
      var on=!!follow[k];b.setAttribute('aria-pressed',on?'true':'false');
      var lim=!on&&n>=MAX;if(lim)b.setAttribute('aria-disabled','true');else b.removeAttribute('aria-disabled');
      $('.fol__t',b).textContent=on?'팔로우 중':lim?'팔로우 5/5':'팔로우';
    });
    $$('[data-unfollow]').forEach(function(b){var k=b.getAttribute('data-unfollow');b.firstChild.textContent=follow[k]?'해제':'다시 팔로우'});
    var l=$('[data-lim]'),lt=$('[data-lim-t]');if(l)l.textContent=n;if(lt)lt.textContent=n>=MAX?'한도 도달':'한도까지 '+(MAX-n)+'개';
  }
  function flip(b,on){b.setAttribute('aria-pressed',on?'true':'false');$('.fol__t',b).textContent=on?'팔로우 중':'팔로우';play(b,'is-fold')}
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-follow]');if(!b)return;
    var k=b.getAttribute('data-follow'),name=b.getAttribute('data-name');
    if(k==='spec-lim'){toast('팔로우는 5개까지예요');return}
    if(/^spec-|-spec$/.test(k)){flip(b,b.getAttribute('aria-pressed')!=='true');return}
    if(follow[k]){delete follow[k];toast(name+' 팔로우 해제')}
    else{if(count()>=MAX){toast('팔로우는 5개까지예요');return}follow[k]=1;toast(name+' 팔로우')}
    $$('[data-follow="'+k+'"]').forEach(function(x){play(x,'is-fold')});paint();
  });
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-unfollow]');if(!b)return;var k=b.getAttribute('data-unfollow');
    if(follow[k])delete follow[k];else if(count()<MAX)follow[k]=1;else{toast('팔로우는 5개까지예요');return}
    $$('[data-follow="'+k+'"]').forEach(function(x){play(x,'is-fold')});paint();
  });
  paint();

  /* 지갑 — 한 장씩 펼침 */
  function openW(btn,on){var p=document.getElementById(btn.getAttribute('aria-controls'));btn.setAttribute('aria-expanded',on?'true':'false');if(p){p.hidden=!on;if(on)play(p,'is-tear')}}
  $$('.wt__h').forEach(function(b){b.addEventListener('click',function(){var on=b.getAttribute('aria-expanded')!=='true';$$('.wt__h').forEach(function(x){if(x!==b&&x.getAttribute('aria-expanded')==='true')openW(x,false)});openW(b,on)})});
  if(Q.wallet){var wb=$('[aria-controls="w-'+Q.wallet+'-p"]');if(wb){$$('.wt__h').forEach(function(x){openW(x,false)});openW(wb,true)}}

  /* 이적 타임라인 펼침 — 뜯김 */
  $$('.xt__btn').forEach(function(b){b.addEventListener('click',function(){var on=b.getAttribute('aria-expanded')!=='true';var p=document.getElementById(b.getAttribute('aria-controls'));b.setAttribute('aria-expanded',on?'true':'false');p.hidden=!on;if(on)play(p,'is-tear')})});

  /* 이적 필터 — 리그 · 팀 · 상태 · Tier · 한국 선수 */
  var F={};
  function applyF(){
    var items=$$('.xlist [data-x]'),n=0;
    items.forEach(function(it){
      var ok=Object.keys(F).every(function(a){var vs=F[a];if(!vs.length)return true;var have=(it.getAttribute('data-'+a)||'').split(' ');return vs.some(function(v){return have.indexOf(v)>=0})});
      it.hidden=!ok;if(ok){n++;play(it,'is-in')}
    });
    $$('[data-xcount]').forEach(function(x){x.textContent=n});$$('[data-xcount-m]').forEach(function(x){x.textContent=n+'건'});
    var em=$('[data-xempty]');if(em)em.hidden=n>0;
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-f]');if(!b)return;
    if(b.getAttribute('aria-disabled')==='true'){toast('0건 — 실데이터 없음');return}
    var a=b.getAttribute('data-f'),v=b.getAttribute('data-v');F[a]=F[a]||[];
    var i=F[a].indexOf(v),on=i<0;if(on)F[a].push(v);else F[a].splice(i,1);
    $$('[data-f="'+a+'"][data-v="'+v+'"]').forEach(function(x){x.setAttribute('aria-pressed',on?'true':'false')});
    applyF();
  });

  /* 온보딩 — 단계마다 스텁 1장, 다음 = 뜯어 넘김 */
  var ob=$('[data-ob]');
  if(ob){
    var MAXT=5;
    function steps(){return $$('[data-ob-step]',ob)}
    function names(no){var b=$('[data-ob-body="'+no+'"]',ob);return $$('.pick[aria-pressed="true"] .l',b).map(function(l){return l.firstChild.textContent.trim()})}
    function setStep(n){steps().forEach(function(s){var no=+s.getAttribute('data-ob-step');var st=no<n?'done':no===n?'open':'next';s.className='tkt ob__st is-'+st;$('[data-ob-body]',s).hidden=st!=='open';$('.ob__ok',s).textContent=st==='done'?'완료':st==='next'?'다음':'지금';if(st==='done'){var nm=names(no);$('[data-ob-sum="'+no+'"]',s).textContent=nm.length?nm.join(' · '):'건너뜀'}});var cur=$('[data-ob-body="'+n+'"]',ob);if(cur)play(cur,'is-tear')}
    function cntT(){var c=$$('[data-pick="team"][aria-pressed="true"]',ob).length;var el=$('[data-ob-cnt]',ob);if(el)el.textContent=c;$$('[data-pick="team"]',ob).forEach(function(p){if(p.getAttribute('aria-pressed')!=='true'&&c>=MAXT)p.setAttribute('aria-disabled','true');else p.removeAttribute('aria-disabled')})}
    ob.addEventListener('click',function(e){
      var p=e.target.closest('.pick');
      if(p){if(p.getAttribute('aria-disabled')==='true'){toast('팀은 5개까지 고를 수 있어요');return}p.setAttribute('aria-pressed',p.getAttribute('aria-pressed')==='true'?'false':'true');cntT();return}
      var nx=e.target.closest('[data-ob-next]');
      if(nx){var n=+nx.getAttribute('data-ob-next');var body=$('[data-ob-body="'+n+'"]',ob);
        var go=function(){body.classList.remove('is-tearoff');if(n<3){setStep(n+1);var h=$('[data-ob-step="'+(n+1)+'"] .ob__t b',ob);if(h){h.setAttribute('tabindex','-1');h.focus()}}else{setStep(4);toast('고른 항목을 팔로우했어요 (시안)')}};
        if(reduce)go();else{body.classList.add('is-tearoff');setTimeout(go,200)}return}
      var sk=e.target.closest('[data-ob-skip]');if(sk){e.preventDefault();toast('건너뛰기 — 홈 그대로 (시안)')}
    });
    cntT();
    var startN=+(Q.ob||2);if(startN>=1&&startN<=3)setStep(startN);
  }

  /* 결과 가림 — 스위치 + 칸별 보기 */
  $$('[data-spoil-box]').forEach(function(box){
    var sw=$('[data-spoil-sw]',box);
    function set(on){box.setAttribute('data-spoil',on?'on':'off');sw.setAttribute('aria-checked',on?'true':'false');$$('.ms',box).forEach(function(m){m.removeAttribute('data-spoil')})}
    sw.addEventListener('click',function(){set(sw.getAttribute('aria-checked')!=='true')});
    box.addEventListener('click',function(e){var b=e.target.closest('[data-spoil-one]');if(!b)return;var m=b.closest('.ms');m.setAttribute('data-spoil','off');var v=$('.spoil-v',m);if(v){play(v,'is-tear');v.setAttribute('tabindex','-1');v.focus()}});
    if(Q.spoil==='off')set(false);
  });

  /* 검색 오버레이 — / · ⌘K · Ctrl+K, ↑↓ Enter Esc */
  var sov=$('#sov'),inp=$('#sov-in'),res=$('#sov-res'),opener=null,act=-1;
  function opts(){return $$('[role="option"]',res)}
  function mark(i){var o=opts();act=i;o.forEach(function(x,j){x.setAttribute('aria-selected',j===i?'true':'false')});if(o[i]){inp.setAttribute('aria-activedescendant',o[i].id);o[i].scrollIntoView({block:'nearest'})}else inp.removeAttribute('aria-activedescendant')}
  function render(){var q=inp.value.trim().toLowerCase();act=-1;inp.removeAttribute('aria-activedescendant');
    if(!q){res.innerHTML='<p class="note" style="padding-top:12px">시안: 준비된 질의 5개만 결과가 나온다.</p>';return}
    var t=$('template[data-q="'+q.replace(/"/g,'')+'"]',sov);
    res.innerHTML=t?t.innerHTML:'<p class="note" style="padding-top:12px">시안에 준비되지 않은 질의예요 — 위 질의 칩을 눌러 보세요.</p>';
    $$('[role="option"]',res).forEach(function(o){o.addEventListener('click',function(ev){ev.preventDefault();toast('이동: '+(o.querySelector('b,.sr-t')||o).textContent.trim().slice(0,24))})});
  }
  function openS(q){opener=document.activeElement;sov.hidden=false;d.style.overflow='hidden';if(q!=null){inp.value=q}render();setTimeout(function(){inp.focus()},0)}
  function closeS(){sov.hidden=true;d.style.overflow='';if(opener&&opener.focus)opener.focus()}
  $$('[data-search-open]').forEach(function(b){b.addEventListener('click',function(){openS()})});
  $$('[data-search-close]').forEach(function(b){b.addEventListener('click',closeS)});
  $$('[data-q-pick]').forEach(function(b){b.addEventListener('click',function(){inp.value=b.getAttribute('data-q-pick');render();inp.focus()})});
  inp.addEventListener('input',render);
  inp.addEventListener('keydown',function(e){var o=opts();if(e.key==='ArrowDown'){e.preventDefault();mark(Math.min(o.length-1,act+1))}else if(e.key==='ArrowUp'){e.preventDefault();mark(Math.max(0,act-1))}else if(e.key==='Enter'&&o[act]){e.preventDefault();o[act].click()}});
  sov.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();closeS()}else if(e.key==='Tab'){var f=$$('input,button,[href]',sov).filter(function(x){return x.offsetParent!==null});if(!f.length)return;var a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}});
  sov.addEventListener('click',function(e){if(e.target===sov)closeS()});
  document.addEventListener('keydown',function(e){if(!sov.hidden)return;var tag=(e.target.tagName||'').toLowerCase();if(tag==='input'||tag==='textarea')return;if(e.key==='/'||((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K'))){e.preventDefault();openS()}});
  if(Q.search)openS(Q.search);
})();
