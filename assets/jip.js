// 입뽀입뽀 웹판 보조 기능: 발음(루비) 보이기·숨기기. 정적판·회원판 모두에서 쓴다.
(function () {
  var KEY = 'jip.rt';
  function get() { try { return localStorage.getItem(KEY) === 'off'; } catch (e) { return false; } }
  function set(off) { try { localStorage.setItem(KEY, off ? 'off' : 'on'); } catch (e) {} }
  function apply(off) {
    document.body.classList.toggle('no-rt', off);
    document.querySelectorAll('[data-act=rt]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(!off));
      b.textContent = off ? '발음 보기' : '발음 숨기기';
    });
  }
  window.jipApply = function () { apply(get()); };   // 회원판: 쪽을 바꿀 때마다 단추 표시를 맞춘다
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act=rt]');
    if (!b) return;
    var off = !document.body.classList.contains('no-rt');
    set(off); apply(off);
  });
  apply(get());
})();
