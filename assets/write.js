// 입뽀입뽀 쓰기 연습: (1) 한자·가나 따라 쓰기 칸에 마우스·손가락으로 쓰기, (2) 정답이 없는 빈칸에도 타자로 써 보기.
// 원고 마크업이 과마다 조금씩 달라서 모양(글자 크기·색)으로 칸을 찾는다. quiz.js보다 뒤에 실행한다.
(function () {
  var INK = '#12324a';

  function light(el) {                      // 흐린 회색 글자(따라 쓰기 견본)인지
    var m = getComputedStyle(el).color.match(/\d+/g);
    if (!m) return false;
    return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 > 0.7;
  }
  function big(el) { return parseFloat(getComputedStyle(el).fontSize) >= 34; }

  // ---------------------------------------------------------------- 따라 쓰기 칸
  function drawCells(root) {
    var cells = [];
    // 한자 쓰기 표: 첫 칸이 큰 글자인 줄의 나머지 칸 (흐린 견본 또는 빈칸)
    root.querySelectorAll('table tr').forEach(function (tr) {
      var tds = [].filter.call(tr.children, function (c) { return c.tagName === 'TD'; });
      if (tds.length < 3 || !tds[0].textContent.trim()) return;
      // 따라 쓰기 줄: 첫 칸이 큰 글자이거나, 뒤 칸에 첫 칸 낱말(루비·뜻 뺀 것)이 흐린 글자로 들어 있음 (가타카나 줄)
      var word = (function (c) { c = c.cloneNode(true); c.querySelectorAll('rt, small, .ko').forEach(function (x) { x.remove(); }); return c.textContent.replace(/\s/g, ''); })(tds[0]);
      var sample = tds.slice(1).some(function (td) { return light(td) && td.textContent.replace(/\s/g, '') === word; });
      if (!big(tds[0]) && !sample) return;
      tds.slice(1).forEach(function (td) {
        var t = td.textContent.trim();
        if (!td.querySelector('[data-ans], input') && (!t || light(td))) cells.push(td);
      });
    });
    // 1석 2조 코너: .trace 줄의 둘째 칸부터
    root.querySelectorAll('.trace > div:not(:first-child)').forEach(function (d) { cells.push(d); });
    return cells;
  }

  function pad(cell) {
    if (cell.querySelector('canvas.wr')) return;
    cell.classList.add('wr-cell');
    var c = document.createElement('canvas');
    c.className = 'wr';
    c.setAttribute('aria-label', '따라 쓰기 칸');
    cell.appendChild(c);
    var ctx = c.getContext('2d'), down = false, last = null, dpr = window.devicePixelRatio || 1;
    function fit() {
      var r = cell.getBoundingClientRect();
      if (!r.width) return;
      var keep = c.width ? c.toDataURL() : null;
      c.width = r.width * dpr; c.height = r.height * dpr;
      c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(3, Math.min(r.width, r.height) / 16) * dpr;
      if (keep) { var im = new Image(); im.onload = function () { ctx.drawImage(im, 0, 0, c.width, c.height); }; im.src = keep; }
    }
    fit();
    c._fit = fit;
    function pos(e) { var r = c.getBoundingClientRect(); return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; }
    c.addEventListener('pointerdown', function (e) {
      down = true; last = pos(e); c.setPointerCapture(e.pointerId); e.preventDefault();
      ctx.beginPath(); ctx.arc(last[0], last[1], ctx.lineWidth / 2, 0, 7); ctx.fillStyle = INK; ctx.fill();
      cell.classList.add('wr-used');
    });
    c.addEventListener('pointermove', function (e) {
      if (!down) return;
      var p = pos(e);
      ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
      last = p;
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { c.addEventListener(ev, function () { down = false; }); });
    c.addEventListener('dblclick', function () { ctx.clearRect(0, 0, c.width, c.height); cell.classList.remove('wr-used'); });
  }

  function clearBar(group) {                // 표·코너마다 ‘지우기’ 단추 하나
    if (!group || group.nextElementSibling && group.nextElementSibling.classList.contains('wr-bar')) return;
    var bar = document.createElement('div');
    bar.className = 'wr-bar';
    bar.innerHTML = '<span>✍ 칸 안에 마우스나 손가락으로 따라 써 보세요 (두 번 누르면 그 칸만 지워짐)</span><button type="button">모두 지우기</button>';
    bar.querySelector('button').onclick = function () {
      var scope = group.matches('.trace') ? group.parentNode : group;
      scope.querySelectorAll('canvas.wr').forEach(function (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); c.parentNode.classList.remove('wr-used'); });
    };
    group.after(bar);
  }

  // ---------------------------------------------------------------- 정답 없는 빈칸 → 자유 입력
  function freeInputs(root) {
    var sel = '.ans:not([data-ans]), .write:not([data-ans]), .blank:not([data-ans]), span[style*="border"]:not([data-ans]):not(.ox)';
    root.querySelectorAll(sel).forEach(function (el) {
      if (el.querySelector('input, canvas') || el.closest('.wr-cell, .ox, .qz-pick, aside, .bogi')) return;
      if (!el.classList.contains('ans') && (el.textContent.trim() || el.querySelector('img, svg'))) return;   // 글자·그림이 이미 든 칸(보기 줄·표지·그림 상자)은 그대로
      if (el.closest('.page.answer, .pair')) return;                // 회화 연습 쪽은 제외
      var i = document.createElement('input');
      i.className = 'qz-in qz-free-in'; i.type = 'text'; i.lang = 'ja'; i.autocomplete = 'off'; i.spellcheck = false;
      i.setAttribute('aria-label', '써 보기 (채점 없음)');
      // 문장 속 네모 칸(span)은 원래 칸 너비 그대로
      var w = el.getBoundingClientRect().width;
      if (el.tagName === 'SPAN' && w > 8) i.style.width = Math.max(w, 36) + 'px';
      if (!el.classList.contains('ans')) el.textContent = '';
      el.classList.add('qz-on');
      el.appendChild(i);
    });
  }

  function setup(root) {
    root = root || document;
    var cells = drawCells(root);
    cells.forEach(pad);
    var groups = [];
    cells.forEach(function (c) {
      var g = c.closest('table') || c.closest('.trace');
      if (g && g.matches('.trace')) { while (g.nextElementSibling && g.nextElementSibling.matches('.trace')) g = g.nextElementSibling; }
      if (groups.indexOf(g) < 0) groups.push(g);
    });
    groups.forEach(clearBar);
    freeInputs(root);
  }
  var t;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () { document.querySelectorAll('canvas.wr').forEach(function (c) { c._fit && c._fit(); }); }, 200);
  });
  function refit() { document.querySelectorAll('canvas.wr').forEach(function (c) { c._fit && c._fit(); }); }
  if (document.fonts) document.fonts.ready.then(refit);
  window.addEventListener('load', refit);
  window.jipWrite = function (root) { setup(root); setTimeout(refit, 600); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setup(); });
  else setup();
})();
