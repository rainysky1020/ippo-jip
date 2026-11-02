// Speedy 입뽀입뽀 (신촌) 웹판 보조 기능. 교재 내용은 없다. quiz.js 뒤에 읽는다.
//   1) 발음 3단계: 모두 보기 → 한글 발음 숨기기(후리가나만) → 모두 숨기기   [data-act=rt3]
//   2) 선생님 도구(body.cs-teacher): 정답 모두 보기 · 스크립트 모두 펼치기 · 전체 다시 풀기
//   3) 학습 기록(이 브라우저): 써 넣은 답·고른 보기를 쪽마다 저장해 다시 열면 되살리고, ‘정답 확인’ 점수를 과 목록에 보여 준다.
// 회원판(app.js)은 쪽을 넣을 때마다 window.csApply(view)를 부른다. 정적판은 읽을 때 한 번.
(function () {
  var RT = 'cs.rt', STATES = ['all', 'ko', 'none'];
  var LABEL = { all: '발음 · 모두', ko: '발음 · 후리가나만', none: '발음 · 숨김' };
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }

  // ---------------------------------------------------------------- 1) 발음
  function rtApply() {
    var s = store(RT) || 'all';
    document.body.classList.toggle('cs-rt-ko', s === 'ko');
    document.body.classList.toggle('cs-rt-all', s === 'none');
    document.querySelectorAll('[data-act=rt3]').forEach(function (b) {
      b.textContent = LABEL[s]; b.setAttribute('aria-pressed', String(s !== 'all'));
      b.title = '눌러서 바꾸기: 모두 보기 → 한글 발음 숨기기 → 모두 숨기기';
    });
  }

  // ---------------------------------------------------------------- 공통: 지금 쪽의 과 열쇠 (sV/cNN)
  function pageKey(root) {
    var m = root.querySelector('main.book[data-key]');
    return m ? m.dataset.key : null;
  }
  function inputs(sec) { return [].slice.call(sec.querySelectorAll('input.qz-in')); }
  function picks(sec) { return [].slice.call(sec.querySelectorAll('ol.qz-pick > li, .ox[data-ans] button, .pick[data-ans] button')); }

  // ---------------------------------------------------------------- 3) 학습 기록
  function save(root) {
    var key = pageKey(root); if (!key) return;
    var data = {};
    root.querySelectorAll('section.page').forEach(function (sec, i) {
      var ins = inputs(sec).map(function (x) { return x.value; });
      var on = picks(sec).map(function (x) { return x.classList.contains('on') ? 1 : 0; });
      if (ins.some(Boolean) || on.some(Boolean)) data[i] = { i: ins, p: on };
    });
    store('cs.ans.' + key, data);
  }
  function restore(root) {
    var key = pageKey(root); if (!key) return;
    var data = store('cs.ans.' + key) || {};
    root.querySelectorAll('section.page').forEach(function (sec, i) {
      var d = data[i]; if (!d) return;
      inputs(sec).forEach(function (x, k) { if (d.i[k]) x.value = d.i[k]; });
      picks(sec).forEach(function (x, k) { if (d.p[k]) x.classList.add('on'); });
    });
  }
  function score(sec) {
    var root = sec.closest('main.book'), key = root && root.dataset.key; if (!key) return;
    var t = (sec.querySelector('.qz-score') || {}).textContent || '', m = t.match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return;
    var all = store('cs.score') || {}, ch = all[key] || {};
    ch[sec.dataset.src || '?'] = [+m[1], +m[2]];
    all[key] = ch; store('cs.score', all);
  }
  // 과 목록에 진도 표시: 확인한 문제 수 / 맞힌 수
  function progress(root) {
    var all = store('cs.score') || {}, seen = store('cs.seen') || {};
    root.querySelectorAll('a.lesson[data-key]').forEach(function (a) {
      var k = a.dataset.key, ch = all[k], r = 0, t = 0;
      if (ch) Object.keys(ch).forEach(function (s) { r += ch[s][0]; t += ch[s][1]; });
      var tag = a.querySelector('.prog'); if (!tag) return;
      if (t) { tag.textContent = '정답 ' + r + '/' + t; tag.className = 'prog done'; }
      else if (seen[k]) { tag.textContent = '학습함'; tag.className = 'prog seen'; }
    });
  }

  // ---------------------------------------------------------------- 2) 선생님 도구
  function revealAll(root) {
    root.querySelectorAll('section.page').forEach(function (sec) {
      if (!sec.querySelector('[data-ans]')) return;
      sec.querySelectorAll('[data-ans]').forEach(function (el) {
        var a = (el.dataset.ans || '').split('|')[0];
        if (el.matches('ol.choices')) {
          var want = el.dataset.ans.split(',');
          [].forEach.call(el.children, function (li, k) { li.classList.toggle('on', want.indexOf(String(k + 1)) >= 0); });
        } else if (el.matches('.ox, .pick')) {
          el.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === a); });
        } else {
          var i = el.querySelector(':scope > input.qz-in'); if (i) i.value = a;
        }
      });
      var c = sec.querySelector('.qz-check'); if (c) c.click();
    });
  }
  function teacherBar(root) {
    var main = root.querySelector('main.book.cs-ch');
    if (!main || !document.body.classList.contains('cs-teacher') || root.querySelector('.cs-tbar')) return;
    var bar = document.createElement('div');
    bar.className = 'cs-tbar';
    bar.innerHTML = '<span class="lb">선생님</span>'
      + '<button type="button" data-tact="reveal">정답 모두 보기</button>'
      + '<button type="button" data-tact="scripts">스크립트 모두 펼치기</button>'
      + '<button type="button" data-tact="reset">전체 다시 풀기</button>';
    main.parentNode.insertBefore(bar, main);
  }

  // ---------------------------------------------------------------- 묶기
  window.csApply = function (root) {
    root = root || document;
    rtApply();
    restore(root);
    teacherBar(root);
    progress(root);
    var key = pageKey(root);
    if (key) { var seen = store('cs.seen') || {}; seen[key] = Date.now(); store('cs.seen', seen); }
  };

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act=rt3]');
    if (b) { var s = store(RT) || 'all'; store(RT, STATES[(STATES.indexOf(s) + 1) % 3]); return rtApply(); }
    var t = ev.target.closest('[data-tact]');
    if (t) {
      var root = t.closest('#view') || document;
      if (t.dataset.tact === 'reveal') revealAll(root);
      if (t.dataset.tact === 'scripts') {
        var ds = root.querySelectorAll('details.script'), open = [].some.call(ds, function (d) { return !d.open; });
        ds.forEach(function (d) { d.open = open; });
        t.textContent = open ? '스크립트 모두 접기' : '스크립트 모두 펼치기';
      }
      if (t.dataset.tact === 'reset') root.querySelectorAll('.qz-reset').forEach(function (r) { r.click(); });
      return;
    }
    // quiz.js가 먼저 처리한 뒤(같은 click) 저장·점수 기록
    var q = ev.target.closest('.qz-check, .qz-reset, ol.qz-pick > li, .ox button, .pick button');
    if (q) setTimeout(function () {
      var root = q.closest('#view') || document;
      if (q.matches('.qz-check')) score(q.closest('section.page'));
      save(root);
    });
  }, false);
  var timer;
  document.addEventListener('input', function (ev) {
    if (!ev.target.matches('input.qz-in')) return;
    clearTimeout(timer);
    var root = ev.target.closest('#view') || document;
    timer = setTimeout(function () { save(root); }, 400);
  });

  if (!document.getElementById('view')) {          // 정적판: ?teacher 로 선생님 도구 확인
    if (/[?&]teacher\b/.test(location.search)) document.body.classList.add('cs-teacher');
    window.csApply(document);
  } else rtApply();
})();
