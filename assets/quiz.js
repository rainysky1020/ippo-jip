// 입뽀입뽀 연습문제 풀이: 정답은 쪽 조각의 data-ans에만 있다(회원판은 비공개 버킷).
//   .ans[data-ans]     답 줄 → 입력칸 (여러 답은 |, data-kana는 빌드가 넣은 가나 읽기)
//   .blank[data-ans]   빈칸 → 짧은 입력칸 (표 칸 td, .write 줄 등 data-ans가 붙은 다른 요소도 입력칸이 됨)
//   ol.choices[data-ans="2"]  보기 고르기 (1부터, 여러 개면 data-ans="2,4")
//   .ox[data-ans="o|x"]       ○× 고르기
//   [data-free]        정해진 답이 없는 문제 → ‘모범 답안’만 보여 줌
//   [data-set]         순서 없는 목록 답 (예: 1그룹 동사 모두 쓰기) → 낱말 묶음이 같으면 맞음
// 쪽(section)마다 ‘정답 확인’ 단추. 채점은 띄어쓰기·문장부호를 무시하고, 가나만으로 쓴 답도 맞게 본다.
(function () {
  function norm(s) {
    s = (s || '').normalize('NFKC').toLowerCase();
    s = s.replace(/[\s。、，．,.!?！？「」『』（）()・…〜~ー-]/g, '');
    return s.replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  }
  function answers(el) {
    var a = (el.dataset.ans || '').split('|').concat((el.dataset.kana || '').split('|'));
    return a.map(norm).filter(Boolean);
  }
  // 입력칸이 되는 것: 보기 고르기·○× 말고 data-ans가 붙은 모든 요소 (.ans 답 줄, .blank 빈칸, 표 칸 td, .write 줄 …)
  var INPUTS = '[data-ans]:not(ol):not(.ox)';
  function shown(el) { return (el.dataset.ans || '').split('|')[0]; }

  function setup(root) {
    root = root || document;
    root.querySelectorAll(INPUTS).forEach(function (el) {
      if (el.querySelector(':scope > input.qz-in')) return;
      var i = document.createElement('input');
      i.className = 'qz-in'; i.type = 'text'; i.lang = 'ja'; i.autocomplete = 'off'; i.spellcheck = false;
      i.setAttribute('aria-label', '답 입력');
      if (!el.classList.contains('ans')) {
        i.placeholder = el.textContent.trim(); el.textContent = '';   // 빈칸·표 칸·.write 줄은 입력칸만 (있던 글자 ★ 등은 흐린 안내 글자로)
        // 칸 너비 = 가장 긴 정답 길이 (전각 1, 반각 0.6) + 여유. 표 칸·줄보다 넓어지지는 않는다.
        var n = Math.max.apply(null, (el.dataset.ans || '').split('|').map(function (a) {
          return [].reduce.call(a.replace(/\s/g, ''), function (s, ch) { return s + (ch.charCodeAt(0) > 0xff ? 1 : 0.6); }, 0);
        }));
        i.style.width = 'calc(' + Math.max(2, n + 1.2).toFixed(1) + 'em + 8px)';
      }
      el.classList.add('qz-on');
      el.appendChild(i);
    });
    root.querySelectorAll('ol.choices[data-ans]').forEach(function (ol) {
      ol.classList.add('qz-pick');
      [].forEach.call(ol.children, function (li, k) { li.dataset.k = k + 1; li.tabIndex = 0; li.setAttribute('role', 'button'); });
    });
    root.querySelectorAll('.ox[data-ans]').forEach(function (el) {
      if (el.querySelector('button')) return;
      el.innerHTML = '<button type="button" data-v="o">○</button><button type="button" data-v="x">×</button>';
    });
    root.querySelectorAll('section.page').forEach(function (sec) {
      if (!sec.querySelector('[data-ans]') || sec.querySelector('.qz-bar')) return;
      var bar = document.createElement('div');
      bar.className = 'qz-bar';
      bar.innerHTML = '<button type="button" class="qz-check">정답 확인</button><button type="button" class="qz-reset">다시 풀기</button><span class="qz-score"></span>';
      sec.appendChild(bar);
    });
  }

  function mark(el, ok, sol) {
    el.classList.remove('qz-ok', 'qz-ng', 'qz-free');
    el.classList.add(ok === null ? 'qz-free' : ok ? 'qz-ok' : 'qz-ng');
    var s = el.nextElementSibling && el.nextElementSibling.classList.contains('qz-sol') ? el.nextElementSibling : null;
    if (sol) {
      if (!s) { s = document.createElement(el.tagName === 'SPAN' ? 'span' : 'div'); s.className = 'qz-sol'; el.after(s); }
      s.textContent = (ok === null ? '모범 답안: ' : '정답: ') + sol;
    } else if (s) s.remove();
  }

  function check(sec) {
    var right = 0, total = 0;
    sec.querySelectorAll('[data-ans]').forEach(function (el) {
      var free = el.hasAttribute('data-free'), ok;
      if (el.matches('ol.choices')) {
        var want = el.dataset.ans.split(','), got = [].map.call(el.querySelectorAll('li.on'), function (li) { return li.dataset.k; });
        ok = got.length === want.length && want.every(function (k) { return got.indexOf(k) >= 0; });
        el.querySelectorAll('li').forEach(function (li) { li.classList.toggle('right', want.indexOf(li.dataset.k) >= 0); });
        mark(el, ok, null);
      } else if (el.matches('.ox')) {
        var b = el.querySelector('button.on');
        ok = !!b && b.dataset.v === el.dataset.ans;
        mark(el, ok, ok ? null : (el.dataset.ans === 'o' ? '○' : '×'));
      } else {
        var raw = (el.querySelector(':scope > input.qz-in') || {}).value || '', v = norm(raw);
        if (el.hasAttribute('data-set')) {      // 순서 없는 목록 답 (data-set): 、・, 공백으로 나눈 낱말 묶음이 같으면 맞음
          var bag = function (t) { return t.split(/[、,，・\s]+/).map(norm).filter(Boolean).sort().join('|'); };
          ok = !!v && el.dataset.ans.split('|').some(function (a) { return bag(a.replace(/／/g, '|').split('|')[0]) === bag(raw); });
        } else ok = !!v && answers(el).indexOf(v) >= 0;
        if (free) { mark(el, ok ? true : null, ok ? null : shown(el)); if (!ok) return; }
        else mark(el, ok, ok ? null : shown(el));
      }
      total++; if (ok) right++;
    });
    sec.querySelector('.qz-score').textContent = total ? right + ' / ' + total : '';
  }

  function reset(sec) {
    sec.querySelectorAll('.qz-ok, .qz-ng, .qz-free').forEach(function (el) { el.classList.remove('qz-ok', 'qz-ng', 'qz-free'); });
    sec.querySelectorAll('.qz-sol').forEach(function (el) { el.remove(); });
    sec.querySelectorAll('input.qz-in').forEach(function (i) { i.value = ''; });
    sec.querySelectorAll('.qz-pick li.on, .qz-pick li.right, .ox button.on').forEach(function (el) { el.classList.remove('on', 'right'); });
    sec.querySelector('.qz-score').textContent = '';
  }

  document.addEventListener('click', function (ev) {
    var li = ev.target.closest('ol.qz-pick > li');
    if (li) {
      if (li.parentNode.dataset.ans.indexOf(',') >= 0) li.classList.toggle('on');   // 여러 개 고르기 (data-ans="2,4")
      else [].forEach.call(li.parentNode.children, function (x) { x.classList.toggle('on', x === li); });
      return;
    }
    var ob = ev.target.closest('.ox[data-ans] button');
    if (ob) { ob.parentNode.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b === ob); }); return; }
    var c = ev.target.closest('.qz-check');
    if (c) return check(c.closest('section.page'));
    var r = ev.target.closest('.qz-reset');
    if (r) return reset(r.closest('section.page'));
  });
  document.addEventListener('keydown', function (ev) {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('ol.qz-pick > li')) { ev.preventDefault(); ev.target.click(); }
  });
  window.jipQuiz = setup;
  setup();
})();
