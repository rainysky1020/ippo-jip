// 입뽀입뽀 JIP 회원판: 로그인 → 승인 확인 → Supabase 비공개 버킷에서 쪽·그림·음원을 받아 보여 준다.
// 이 파일과 index.html에는 교재 내용이 없다. 접근 제한은 Supabase 쪽 보안 규칙(RLS)이 맡는다.
(function () {
  var SUPABASE_URL = 'https://benivfzkotlqukbdxyqm.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_EiY9PdDt-VNNxcgZZ4WIEQ_DnFOZJK0';   // 공개용 키
  var BUCKET = 'jip', TTL = 6 * 3600;

  var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  var view = document.getElementById('view');
  var me = null;            // { user, profile, admin }
  var pageCache = {}, urlCache = {};
  window.AUDIO_URLS = {};
  var CAMPUSES = ['종로', '강남'];   // 시작 값. 실제 목록은 campuses 표에서 받아 온다.
  sb.from('campuses').select('name').order('sort').then(function (r) {
    if (r.data && r.data.length) CAMPUSES = r.data.map(function (c) { return c.name; });
  });
  function campusTxt(cs) { return cs && cs.length ? cs.join(' · ') : '캠퍼스 미지정'; }

  // 신촌 캠퍼스는 Speedy 입뽀입뽀(입문·초급 × 평일반·주말반) 교재를 쓴다 — 단계 5~8, 쪽 경로 cs/…, sN/… (빌드: japanese_jip_cs/web).
  var CS_CAMPUS = '신촌';
  var STAGE_NAME = { 1: '1권', 2: '2권', 3: '3권', 4: '4권', 5: '평일반 입문', 6: '평일반 초급', 7: '주말반 입문', 8: '주말반 초급' };
  function stageTxt(ns) { return ns.map(function (n) { return STAGE_NAME[n] || n + '권'; }).join(', '); }
  function stagesFor(cs) { return cs && cs.indexOf(CS_CAMPUS) >= 0 ? [5, 6, 7, 8] : [1, 2, 3, 4]; }
  function hasCS() { return me.admin || me.campuses.indexOf(CS_CAMPUS) >= 0 || me.stages.some(function (n) { return n >= 5; }); }
  function hasJIP() { return me.admin || me.campuses.some(function (c) { return c !== CS_CAMPUS; }) || me.stages.some(function (n) { return n <= 4; }); }
  function csHome() { return !me.admin && hasCS() && !hasJIP(); }   // 첫 화면을 신촌 교재로

  // ---------------------------------------------------------------- 약관·개인정보 (가입 화면 동의 + #/terms, #/privacy 공개 쪽)
  // 문구를 바꾸면 VER을 올린다. 가입할 때 동의한 판(VER)과 시각이 회원 정보(user metadata)에 남는다.
  var DOC_VER = '2026-10-30';
  var DOCS = {
    terms: ['이용약관', [
      ['제1조 (목적)', '이 약관은 입뽀입뽀 JIP 웹 교재(이하 ‘서비스’)의 이용 조건과 절차를 정합니다.'],
      ['제2조 (회원가입)', '가입을 신청한 뒤 담당 선생님의 승인을 받아야 교재를 볼 수 있습니다. 수강생이 아니거나 신청 내용이 사실과 다르면 승인하지 않을 수 있습니다.'],
      ['제3조 (이용 범위)', '회원은 승인된 권의 교재를 본인의 학습 목적으로만 이용할 수 있습니다.'],
      ['제4조 (금지 행위)', '교재의 글·그림·음원을 복제, 녹음, 캡처하여 다른 사람에게 배포하거나, 계정을 다른 사람과 함께 쓰는 행위를 금지합니다. 위반하면 열람 권한이 제한될 수 있습니다.'],
      ['제5조 (저작권)', '교재와 음원의 저작권은 저작권자에게 있습니다.'],
      ['제6조 (서비스 변경·중단)', '수강 종료, 시스템 점검 등의 사유로 열람 권한이나 서비스가 변경되거나 중단될 수 있습니다.'],
      ['제7조 (탈퇴)', '회원은 ‘내 정보’에서 언제든지 탈퇴할 수 있으며, 탈퇴하면 계정 정보가 바로 삭제됩니다.'],
      ['부칙', '이 약관은 2026년 10월 30일부터 적용합니다.']]],
    privacy: ['개인정보 수집·이용 안내', [
      ['수집 항목', '(필수) 이름, 이메일, 비밀번호, 캠퍼스 · (선택) 소속·메모 · (자동) 로그인 일시 등 접속 기록'],
      ['이용 목적', '회원 확인과 로그인, 교재 열람 권한 관리(가입 승인, 캠퍼스별 관리), 비밀번호 재설정 등 안내 메일 발송'],
      ['보유 기간', '회원 탈퇴 시까지. 탈퇴하면 바로 삭제합니다. 단, 법령에 따라 보관해야 하는 정보는 그 기간 동안 보관합니다.'],
      ['열람 범위', '회원의 이름·이메일·캠퍼스·메모는 담당 캠퍼스 선생님과 전체 관리자만 볼 수 있습니다. 비밀번호는 암호화되어 누구도 볼 수 없습니다.'],
      ['처리 위탁', 'Supabase Inc. — 회원 정보 저장과 로그인 처리 (저장 위치: 대한민국 서울)'],
      ['동의 거부', '동의하지 않을 수 있습니다. 다만 동의하지 않으면 회원가입과 교재 이용이 불가능합니다.'],
      ['문의', '개인정보 열람·정정·삭제 요청은 다니는 캠퍼스의 담당 선생님께 해 주세요. 탈퇴는 ‘내 정보’에서 직접 할 수 있습니다.']]]
  };
  function docHtml(k) {
    return DOCS[k][1].map(function (s) { return '<dt>' + s[0] + '</dt><dd>' + s[1] + '</dd>'; }).join('');
  }
  function agreeBlock() {
    var item = function (k, label) {
      return '<div class="agree-item"><label class="chk"><input type="checkbox" name="agree_' + k + '" required>'
        + '<span><b>[필수]</b> ' + label + '</span></label>'
        + '<details><summary>보기</summary><dl class="doc">' + docHtml(k) + '</dl></details></div>';
    };
    return '<div class="agree"><label class="chk all"><input type="checkbox" data-agree-all><span>전체 동의</span></label>'
      + item('terms', '이용약관에 동의합니다') + item('privacy', '개인정보 수집·이용에 동의합니다') + '</div>';
  }
  function docView(k) {
    window.cipPlayer.reset();
    view.dataset.path = k;
    view.innerHTML = bar(DOCS[k][0]) + '<div class="gate"><div class="card"><h2>' + DOCS[k][0] + '</h2>'
      + '<dl class="doc full">' + docHtml(k) + '</dl>'
      + '<p class="row back"><a class="lnk" href="#/">← 처음으로</a></p></div></div>';
    if (me) addUserMenu();
    document.title = DOCS[k][0] + ' · 입뽀입뽀 JIP';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function bar(crumb) {
    return '<header class="top"><a class="brand" href="#/"><b>입뽀입뽀</b> JIP</a>'
      + '<nav class="crumbs">' + (crumb ? '<span class="sep">/</span>' + crumb : '') + '</nav></header>';
  }

  // ---------------------------------------------------------------- 주소 ↔ 쪽 경로
  // #/ → index.html, #/s1/ → s1/index.html, #/s1/u03 → s1/u03.html
  function routePath() {
    var h = location.hash.replace(/^#\/?/, '');
    if (h === 'admin' || h === 'me' || h === 'terms' || h === 'privacy') return h;
    if (!h || /\/$/.test(h)) return h + 'index.html';
    return h + '.html';
  }
  function hashOf(path) {
    return '#/' + path.replace(/index\.html$/, '').replace(/\.html$/, '');
  }
  function resolve(base, href) {
    var parts = base.split('/'); parts.pop();
    href.split('/').forEach(function (p) {
      if (p === '..') parts.pop(); else if (p && p !== '.') parts.push(p);
    });
    return parts.join('/');
  }

  // ---------------------------------------------------------------- 서명 URL
  function signed(paths) {
    var now = Date.now(), need = paths.filter(function (p) {
      return !urlCache[p] || urlCache[p].exp < now + 30 * 60e3;
    });
    if (!need.length) return Promise.resolve();
    return sb.storage.from(BUCKET).createSignedUrls(need, TTL).then(function (r) {
      if (r.error) throw r.error;
      r.data.forEach(function (d) {
        if (d.signedUrl) urlCache[d.path] = { url: d.signedUrl, exp: now + TTL * 1000 };
      });
    });
  }

  // ---------------------------------------------------------------- 교재 쪽
  function loadPage(path) {
    if (pageCache[path]) return Promise.resolve(pageCache[path]);
    return sb.storage.from(BUCKET).download('pages/' + path).then(function (r) {
      if (r.error) throw r.error;
      return r.data.text();
    }).then(function (t) { pageCache[path] = t; return t; });
  }

  function showPage(path) {
    window.cipPlayer.reset();
    return loadPage(path).then(function (html) {
      view.innerHTML = html;
      view.dataset.path = path;
      addUserMenu();
      var imgs = [].map.call(view.querySelectorAll('img[data-img]'), function (i) { return i.dataset.img; });
      var auds = {};   // 음원 이름은 'sN/tNN' (버킷 audio/sN/tNN.mp3)
      view.querySelectorAll('[data-a]').forEach(function (el) { auds['audio/' + el.dataset.a + '.mp3'] = 1; });
      var crumbs = view.querySelector('.crumbs');
      var parts = crumbs ? crumbs.textContent.split('/').map(function (x) { return x.trim(); }).filter(Boolean) : [];
      var cs = !!view.querySelector('.cs');
      document.body.classList.toggle('cs-on', cs);
      document.body.classList.toggle('cs-teacher', cs && me.teacher);
      document.title = parts.concat(cs ? 'Speedy 입뽀입뽀' : '입뽀입뽀 JIP').join(' · ');
      window.scrollTo(0, 0);
      onlyMine(view);
      var home = view.querySelector('main.index');
      if (home && path === 'index.html' && hasCS()) {              // 전체 첫 화면: 종로·강남(입뽀입뽀 1~4권) 아래에 신촌(입문/초급)
        var jst = home.querySelector('.stages');
        if (jst) jst.insertAdjacentHTML('beforebegin', '<h2 class="campus-h"><span class="en">JONGNO · GANGNAM · 입뽀입뽀</span>종로 · 강남</h2>');
        loadPage('cs/index.html').then(function (t) {
          var box = document.createElement('div');
          box.innerHTML = t;
          var lv = box.querySelector('.cs-levels');
          if (!lv || view.dataset.path !== 'index.html' || home.querySelector('.cs-levels')) return;
          var wrap = document.createElement('div');
          wrap.className = 'cs'; wrap.appendChild(lv);
          home.appendChild(wrap);
          onlyMine(wrap);
        });
      }
      if (home && path === 'cs/index.html' && hasJIP()) home.insertAdjacentHTML('beforeend', '<a class="xbook" href="../index.html"><small>종로·강남</small><b>입뽀입뽀</b> 1~4권 · 전체 첫 화면 ›</a>');
      if (!me.teacher && /^cs\/(in|cho)\.html$/.test(path)) {      // 학생: 고를 반이 하나뿐이면 바로 그 반 목차로
        var one = [].filter.call(view.querySelectorAll('.lvl-pick a.stage'), function (a) { return !a.hidden; });
        if (one.length === 1) { location.replace(hashOf(resolve(path, one[0].getAttribute('href')))); return; }
      }
      window.cipPlayer.scan();
      if (window.jipApply) window.jipApply();
      if (window.jipQuiz) window.jipQuiz(view);
      if (window.csApply) window.csApply(view);
      if (window.jipWrite) setTimeout(function () { window.jipWrite(view); }, 50);   // 글꼴·그림 배치 뒤 칸 크기를 잰다
      return signed(imgs.concat(Object.keys(auds))).then(function () {
        view.querySelectorAll('img[data-img]').forEach(function (i) {
          if (urlCache[i.dataset.img]) i.src = urlCache[i.dataset.img].url;
        });
        Object.keys(auds).forEach(function (p) {
          if (urlCache[p]) window.AUDIO_URLS[p.slice(6, -4)] = urlCache[p].url;
        });
      });
    }).catch(function (e) {
      console.error(e);
      view.innerHTML = bar() + '<div class="gate"><div class="card"><h2>쪽을 열 수 없습니다</h2>'
        + '<p class="msg">잠시 뒤 다시 시도해 주세요. 계속되면 관리자에게 문의하세요.</p>'
        + '<p><a class="btn" href="#/">처음으로</a></p></div></div>';
    });
  }

  // 학생에게는 볼 수 있는 교재 카드만 남긴다 (선생님·관리자는 담당 캠퍼스 교재 모두).
  //   a.stage.sN: 그 권·반 / [data-st="5,7"]: 그 단계 중 하나라도 있으면 / .staff-only: 선생님·관리자만
  function onlyMine(root) {
    if (me.teacher) return;
    var has = function (list) { return list.some(function (n) { return me.stages.indexOf(+n) >= 0; }); };
    root.querySelectorAll('.stages a.stage').forEach(function (a) {
      var st = (a.className.match(/\bs(\d)\b/) || [])[1];
      if (st && !has([st])) a.hidden = true;
    });
    root.querySelectorAll('[data-st]').forEach(function (el) { if (!has(el.dataset.st.split(','))) el.hidden = true; });
    root.querySelectorAll('.staff-only').forEach(function (el) { el.hidden = true; });
  }

  function addUserMenu() {
    var top = view.querySelector('header.top');
    if (!top || top.querySelector('.who')) return;
    var who = document.createElement('div');
    who.className = 'who';
    who.innerHTML = '<a class="nm" href="#/me" title="내 정보 · 캠퍼스 변경">' + esc(me.profile && me.profile.name || me.user.email) + '</a>'
      + (me.teacher ? '<a href="#/admin">회원 관리</a>' : '')
      + '<button type="button" data-act="logout">로그아웃</button>';
    top.appendChild(who);
  }

  // ---------------------------------------------------------------- 로그인·가입
  var flash = '';
  function authView(mode, note) {
    mode = mode || 'login';
    var ok = !note && !!flash;
    note = note || flash; flash = '';
    view.dataset.path = '';
    var f = {
      login: '<label>이메일<input name="email" type="email" autocomplete="email" required></label>'
        + '<label>비밀번호<input name="pw" type="password" autocomplete="current-password" required></label>'
        + '<button class="btn" type="submit">로그인</button>'
        + '<p class="alt"><button type="button" class="lnk" data-mode="reset">비밀번호를 잊었어요</button></p>',
      signup: '<label>이름<input name="name" required maxlength="40" autocomplete="name"></label>'
        + '<label>이메일<input name="email" type="email" autocomplete="email" required></label>'
        + '<label>비밀번호 <small>8자 이상</small><input name="pw" type="password" minlength="8" autocomplete="new-password" required></label>'
        + '<fieldset class="pick"><legend>캠퍼스</legend>' + CAMPUSES.map(function (c, i) {
          return '<label><input type="radio" name="campus" value="' + esc(c) + '" required' + (i ? '' : '') + '><span>' + esc(c) + '</span></label>';
        }).join('') + '</fieldset>'
        + '<fieldset class="pick want"><legend>신청 단계 <small>수강할 권(과정) 또는 강사</small></legend>' + wantOpts('') + '</fieldset>'
        + '<label>소속·메모 <small>선택 · 승인에 참고합니다</small><input name="note" maxlength="100" placeholder="예: 화목 저녁반"></label>'
        + agreeBlock()
        + '<button class="btn" type="submit">가입 신청</button>',
      reset: '<p class="msg">가입한 이메일로 비밀번호 재설정 링크를 보내 드립니다.</p>'
        + '<label>이메일<input name="email" type="email" autocomplete="email" required></label>'
        + '<button class="btn" type="submit">재설정 메일 받기</button>',
      newpw: '<p class="msg">새 비밀번호를 정해 주세요.</p>'
        + '<label>새 비밀번호 <small>8자 이상</small><input name="pw" type="password" minlength="8" autocomplete="new-password" required></label>'
        + '<button class="btn" type="submit">비밀번호 바꾸기</button>'
    }[mode];
    var tabs = (mode === 'login' || mode === 'signup')
      ? '<div class="tabs"><button type="button" data-mode="login"' + (mode === 'login' ? ' class="on"' : '') + '>로그인</button>'
        + '<button type="button" data-mode="signup"' + (mode === 'signup' ? ' class="on"' : '') + '>회원가입</button></div>'
      : '<div class="tabs"><button type="button" data-mode="login">← 로그인으로</button></div>';
    view.innerHTML = bar() + '<div class="gate"><div class="hero home"><div class="k">JAPANESE · 일본어</div><h1>입뽀입뽀</h1>'
      + '<p>교재를 보면서 원어민 음성을 듣는 회원 전용 웹 교재입니다.<br>가입 후 관리자 승인을 받으면 열람할 수 있습니다.</p>'
      + '<p class="sm">종로·강남: 입뽀입뽀 1~4권 · 신촌: Speedy 입뽀입뽀 입문·초급</p></div>'
      + '<div class="card">' + tabs + '<form data-form="' + mode + '">' + f + '<p class="note' + (ok ? ' ok' : '') + '" role="status">' + (note || '') + '</p></form></div>'
      + '<p class="legal"><a href="#/terms">이용약관</a> · <a href="#/privacy">개인정보 수집·이용 안내</a></p></div>';
  }

  // 가입 때 신청 단계(캠퍼스마다 다름) 또는 강사를 꼭 고른다 → 회원 정보 want (승인 대기 명단의 단계별 보기)
  function wantOpts(campus) {
    if (!campus) return '<p class="msg sm">캠퍼스를 먼저 골라 주세요.</p>';
    return stagesFor([campus]).map(function (n) { return [String(n), STAGE_NAME[n]]; }).concat([['teacher', '강사']]).map(function (o) {
      return '<label><input type="radio" name="want" value="' + o[0] + '" required><span>' + o[1] + '</span></label>';
    }).join('');
  }
  function csNote(form) {   // 신촌 가입자는 고른 반·과정을 메모 앞에 붙여 승인에 참고하게 한다 (예: [주말반 입문])
    var c = form.querySelector('input[name=campus]:checked'), w = form.querySelector('input[name=want]:checked');
    return c && c.value === CS_CAMPUS && w && STAGE_NAME[w.value] ? '[' + STAGE_NAME[w.value] + '] ' : '';
  }

  function submit(form) {
    var mode = form.dataset.form, v = function (n) { return form.elements[n] ? form.elements[n].value.trim() : ''; };
    var out = form.querySelector('.note'), btn = form.querySelector('button[type=submit]');
    var say = function (t, ok) { out.textContent = t; out.className = 'note' + (ok ? ' ok' : ' err'); };
    btn.disabled = true;
    var here = location.origin + location.pathname;
    var p;
    if (mode === 'login') {
      p = sb.auth.signInWithPassword({ email: v('email'), password: form.elements.pw.value }).then(function (r) {
        if (r.error) say(/confirm/i.test(r.error.message) ? '이메일 인증을 먼저 마쳐 주세요. 받은편지함(스팸함 포함)을 확인해 주세요.'
          : '이메일 또는 비밀번호가 맞지 않습니다.');
      });
    } else if (mode === 'signup') {
      p = sb.auth.signUp({
        email: v('email'), password: form.elements.pw.value,
        options: { emailRedirectTo: here, data: { name: v('name'), note: csNote(form) + v('note'), campus: (form.querySelector('input[name=campus]:checked') || {}).value,
          want: (form.querySelector('input[name=want]:checked') || {}).value,
          agreed: { terms: DOC_VER, privacy: DOC_VER, at: new Date().toISOString() } } }
      }).then(function (r) {
        if (r.error) return say(/registered|exists/i.test(r.error.message) ? '이미 가입된 이메일입니다. 로그인해 주세요.'
          : /password/i.test(r.error.message) ? '비밀번호가 너무 약합니다. 더 길게 정해 주세요.'
          : /rate/i.test(r.error.message) ? '잠시 뒤 다시 시도해 주세요. (메일 발송 한도)' : '가입 실패: ' + r.error.message);
        if (!r.data.session) say('가입 신청이 접수되었습니다. 받은 인증 메일의 링크를 누른 뒤, 관리자 승인을 기다려 주세요.', true);
      });
    } else if (mode === 'reset') {
      p = sb.auth.resetPasswordForEmail(v('email'), { redirectTo: here }).then(function (r) {
        say(r.error ? '보내지 못했습니다: ' + r.error.message : '재설정 메일을 보냈습니다. 메일의 링크를 눌러 주세요.', !r.error);
      });
    } else if (mode === 'newpw') {
      p = sb.auth.updateUser({ password: form.elements.pw.value }).then(function (r) {
        if (r.error) return say('바꾸지 못했습니다: ' + r.error.message);
        location.hash = '#/'; route();
      });
    }
    p.finally(function () { btn.disabled = false; });
  }

  function lockedView(st) {
    window.cipPlayer.reset();
    view.dataset.path = '';
    var nm = STAGE_NAME[st] || st + '권';
    view.innerHTML = bar(nm) + '<div class="gate"><div class="card"><h2>' + nm + ' 열람 권한이 없습니다</h2>'
      + '<p class="msg">지금 열람할 수 있는 과정: <b>' + stageTxt(me.stages) + '</b><br>'
      + nm + ' 교재가 필요하면 담당 선생님께 요청해 주세요.</p>'
      + '<p class="row"><a class="btn" href="#/">처음으로</a><button class="btn ghost" type="button" data-act="recheck">권한 다시 확인</button></p></div></div>';
    addUserMenu();
  }

  function pendingView() {
    view.dataset.path = '';
    view.innerHTML = bar() + '<div class="gate"><div class="card"><h2>승인 대기 중입니다</h2>'
      + '<p class="msg"><b>' + esc(me.user.email) + '</b> 계정으로 <b>' + esc(campusTxt(me.campuses)) + '</b> 캠퍼스에 가입 신청이 접수되었습니다.<br>'
      + '담당 선생님이 볼 수 있는 권(과정)을 열어 주면 교재가 열립니다. 연락을 받으면 ‘승인 확인’을 눌러 주세요.</p>'
      + '<p class="row"><button class="btn" type="button" data-act="recheck">승인 확인</button>'
      + '<a class="btn ghost" href="#/me">캠퍼스 변경</a>'
      + '<button class="btn ghost" type="button" data-act="logout">로그아웃</button></p></div></div>';
  }

  // 휴강: 마지막 승인 뒤 4개월 동안 다음 단계 승인이 없으면 서버가 열람을 막는다(on_leave). 학생이 재수강을 눌러 스스로 푼다.
  function dateTxt(t) { return t ? new Date(t).toLocaleDateString('ko-KR', { dateStyle: 'long' }) : '-'; }
  function leaveView() {
    window.cipPlayer.reset();
    view.dataset.path = '';
    view.innerHTML = bar() + '<div class="gate"><div class="card"><h2>휴강 중입니다</h2>'
      + '<p class="msg">마지막 승인(<b>' + dateTxt(me.profile.active_at) + '</b>) 뒤 4개월 동안 다음 단계 승인이 없어 <b>휴강</b>으로 바뀌었습니다.<br>'
      + '다시 공부하려면 ‘재수강’을 눌러 주세요. 이전에 열린 교재(<b>' + esc(stageTxt(me.stages)) + '</b>)가 바로 다시 열립니다.</p>'
      + '<p class="row"><button class="btn" type="button" data-act="resume">재수강</button>'
      + '<a class="btn ghost" href="#/me">내 정보</a>'
      + '<button class="btn ghost" type="button" data-act="logout">로그아웃</button></p><p class="note" role="status"></p></div></div>';
    document.title = '휴강 중 · 입뽀입뽀 JIP';
  }
  function resume(btn) {
    btn.disabled = true;
    sb.rpc('resume_study').then(function (r) {
      if (r.error) { btn.disabled = false; var n = view.querySelector('.note'); n.textContent = '재수강하지 못했습니다: ' + r.error.message; n.className = 'note err'; return; }
      view.dataset.path = ''; pageCache = {};
      return loadMe(me.user).then(route);
    });
  }

  // ---------------------------------------------------------------- 내 정보 (본인 캠퍼스 변경)
  function meView() {
    window.cipPlayer.reset();
    view.dataset.path = 'me';
    var role = me.admin ? '전체 관리자' : me.teacher ? '선생님' : '학생';
    var multi = me.profile.role === 'teacher';
    var pick = me.admin ? '<p class="msg">전체 관리자는 모든 캠퍼스를 관리하므로 캠퍼스를 따로 고르지 않습니다.</p>'
      : '<form data-form="campus"><fieldset class="pick"><legend>' + (multi ? '담당 캠퍼스 <small>여러 곳 고를 수 있습니다</small>' : '소속 캠퍼스') + '</legend>'
        + CAMPUSES.map(function (c) {
          return '<label><input type="' + (multi ? 'checkbox' : 'radio') + '" name="campus" value="' + esc(c) + '"'
            + (me.campuses.indexOf(c) >= 0 ? ' checked' : '') + '><span>' + esc(c) + '</span></label>';
        }).join('') + '</fieldset>'
        + '<p class="msg sm">' + (multi ? '담당 캠퍼스의 학생만 보이고 관리할 수 있습니다.'
          : '캠퍼스를 옮기면 새 캠퍼스 선생님이 관리합니다. 열람 중인 권은 그대로 유지됩니다.') + '</p>'
        + '<button class="btn" type="submit">저장</button><p class="note" role="status"></p></form>';
    view.innerHTML = bar('내 정보') + '<div class="gate"><div class="card"><h2>내 정보</h2>'
      + '<dl class="kv"><dt>이름</dt><dd>' + esc(me.profile.name || '-') + '</dd><dt>이메일</dt><dd>' + esc(me.user.email) + '</dd>'
      + '<dt>등급</dt><dd>' + role + '</dd>'
      + (me.teacher ? '' : '<dt>열람 교재</dt><dd>' + (me.stages.length ? stageTxt(me.stages) + (me.profile.on_leave ? ' <b class="leave-t">(휴강 중)</b>' : '') : '승인 대기') + '</dd>')
      + '<dt>캠퍼스</dt><dd class="cur">' + esc(me.admin ? '전체' : campusTxt(me.campuses)) + '</dd></dl>'
      + pick + '<p class="row back"><a class="lnk" href="#/">← 처음으로</a></p></div>'
      + (me.admin ? '' : '<details class="card leave"><summary>회원 탈퇴</summary>'
        + '<form data-form="leave"><p class="msg sm">탈퇴하면 계정과 열람 권한이 바로 삭제되며 되돌릴 수 없습니다. '
        + '같은 이메일로 다시 가입하면 새 회원으로 처음부터 승인을 받아야 합니다.</p>'
        + '<label>비밀번호 확인<input name="pw" type="password" autocomplete="current-password" required></label>'
        + '<button class="btn danger" type="submit">탈퇴하기</button><p class="note" role="status"></p></form></details>')
      + '</div>';
    addUserMenu();
    document.title = '내 정보 · 입뽀입뽀 JIP';
  }

  // 탈퇴: 비밀번호를 한 번 더 확인한 뒤 delete_my_account (전체 관리자는 서버에서 거절)
  function leave(form) {
    var out = form.querySelector('.note'), btn = form.querySelector('button[type=submit]');
    var say = function (t) { out.textContent = t; out.className = 'note err'; };
    if (!confirm('정말 탈퇴할까요? 계정과 열람 권한이 모두 삭제됩니다.')) return;
    btn.disabled = true;
    sb.auth.signInWithPassword({ email: me.user.email, password: form.elements.pw.value }).then(function (r) {
      if (r.error) { btn.disabled = false; return say('비밀번호가 맞지 않습니다.'); }
      return sb.rpc('delete_my_account').then(function (d) {
        if (d.error) { btn.disabled = false; return say('탈퇴하지 못했습니다: ' + d.error.message); }
        flash = '탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.';   // 로그아웃 뒤 로그인 화면에 표시
        location.hash = '#/';
        return sb.auth.signOut({ scope: 'local' });
      });
    });
  }

  function saveCampus(form) {
    var picked = [].map.call(form.querySelectorAll('input[name=campus]:checked'), function (i) { return i.value; });
    var out = form.querySelector('.note'), btn = form.querySelector('button[type=submit]');
    if (!picked.length) { out.textContent = '캠퍼스를 한 곳 이상 골라 주세요.'; out.className = 'note err'; return; }
    btn.disabled = true;
    sb.rpc('set_my_campuses', { campuses: picked }).then(function (r) {
      btn.disabled = false;
      if (r.error) { out.textContent = '바꾸지 못했습니다: ' + r.error.message; out.className = 'note err'; return; }
      me.campuses = r.data; me.profile.campuses = r.data;
      view.querySelector('.kv .cur').textContent = campusTxt(r.data);
      out.textContent = campusTxt(r.data) + ' 캠퍼스로 저장했습니다.'; out.className = 'note ok';
    });
  }

  // ---------------------------------------------------------------- 회원 관리 (선생님·전체 관리자)
  // 선생님: 학생마다 1~4권 열람 권한을 켜고 끈다. 전체 관리자: 여기에 더해 선생님 지정·해제.
  // 탭: 승인 대기(단계를 꼭 골라 봄: 그 단계가 ‘다음 차례’인 학생 = 열린 가장 높은 단계 + 1, 새 가입자는 신청 단계)
  //      · 수강생 · 휴강생(4개월 무승인, 서버 계산 on_leave) · 선생님 · 전체.  이름 검색은 모든 탭에 걸린다.
  var adminFilter = 'wait', campusFilter = '', waitStage = 0, nameQuery = '', COLS = '*,on_leave,wait_stage';
  function waitChoices(mine) {   // 고른 캠퍼스(없으면 담당 캠퍼스 전부)의 단계 + 강사 신청(전체 관리자만)
    var cs = campusFilter ? [campusFilter] : mine, list = [];
    cs.forEach(function (c) { stagesFor([c]).forEach(function (n) { if (list.indexOf(n) < 0) list.push(n); }); });
    list.sort(function (a, b) { return a - b; });
    return me.admin ? list.concat('t') : list;
  }
  function adminView() {
    window.cipPlayer.reset();
    var tabs = [['wait', '승인 대기'], ['ok', '수강생'], ['leave', '휴강생'], ['teacher', '선생님'], ['all', '전체']];
    var mine = me.admin ? CAMPUSES : me.campuses;
    if (mine.indexOf(campusFilter) < 0) campusFilter = '';
    var wc = waitChoices(mine);
    if (wc.indexOf(waitStage) < 0) waitStage = wc[0];
    view.innerHTML = bar('회원 관리') + '<main class="index admin"><div class="card wide"><h2>회원 관리</h2>'
      + '<p class="msg">' + (me.admin ? '<b>전체 관리자</b> 계정입니다. 모든 캠퍼스의 회원을 관리합니다. 선생님은 먼저 회원가입(신청 단계 ‘강사’)을 한 뒤, 승인 대기의 ‘강사’에서 ‘선생님 지정’을 누르고 담당 캠퍼스를 고르면 됩니다.'
        : mine.length ? '<b>' + esc(mine.join(' · ')) + '</b> 캠퍼스 담당 선생님입니다. 담당 캠퍼스의 학생만 보이고 관리할 수 있습니다.'
        : '<b>담당 캠퍼스가 아직 지정되지 않았습니다.</b> 전체 관리자에게 캠퍼스 지정을 요청해 주세요.')
      + ' 학생 줄의 권·과정 단추를 누르면 그 교재가 열리거나 닫힙니다. 마지막 승인 뒤 4개월 동안 다음 단계가 열리지 않으면 휴강생이 되고, 학생이 직접 ‘재수강’을 눌러야 풀립니다.</p>'
      + (mine.length > 1 ? '<div class="cfilter"><span>캠퍼스</span>' + [''].concat(mine).map(function (c) {
          return '<button type="button" data-cfilter="' + esc(c) + '"' + (c === campusFilter ? ' class="on"' : '') + '>' + (c ? esc(c) : '전체') + '</button>';
        }).join('') + '</div>' : '')
      + '<div class="tabs">' + tabs.map(function (t) { return '<button type="button" data-filter="' + t[0] + '"' + (t[0] === adminFilter ? ' class="on"' : '') + '>' + t[1] + '</button>'; }).join('') + '</div>'
      + (adminFilter === 'wait' ? '<div class="cfilter sfilter"><span>단계</span>' + wc.map(function (n) {
          return '<button type="button" data-sfilter="' + n + '"' + (n === waitStage ? ' class="on"' : '') + '>' + (n === 't' ? '강사' : STAGE_NAME[n]) + '</button>';
        }).join('') + '</div>' : '')
      + '<div class="search"><input type="search" data-search placeholder="이름으로 찾기" value="' + esc(nameQuery) + '" aria-label="이름으로 찾기"></div>'
      + '<div class="list"><p class="msg">불러오는 중…</p></div></div></main>';
    view.dataset.path = 'admin';
    addUserMenu();
    document.title = '회원 관리 · 입뽀입뽀 JIP';
    loadList();
  }
  var listSeq = 0;
  function loadList() {
    if (adminFilter === 'wait' && waitStage == null) { view.querySelector('.list').innerHTML = '<p class="msg">담당 캠퍼스가 정해지면 볼 수 있습니다.</p>'; return; }
    var q = sb.from('profiles').select(COLS).order('created_at', { ascending: false });
    if (adminFilter === 'wait') q = waitStage === 't' ? q.eq('role', 'student').eq('want_teacher', true).eq('stages', '{}')
      : q.eq('role', 'student').eq('on_leave', false).eq('wait_stage', waitStage);
    if (adminFilter === 'ok') q = q.eq('role', 'student').neq('stages', '{}').eq('on_leave', false);
    if (adminFilter === 'leave') q = q.eq('role', 'student').eq('on_leave', true);
    if (adminFilter === 'teacher') q = q.eq('role', 'teacher');
    if (campusFilter) q = q.contains('campuses', [campusFilter]);
    if (nameQuery) q = q.ilike('name', '%' + nameQuery.replace(/[\\%_]/g, '\\$&') + '%');
    var seq = ++listSeq;
    q.then(function (r) {
      if (seq !== listSeq) return;            // 검색어를 빨리 바꾸면 늦게 온 이전 결과는 버린다
      var box = view.querySelector('.list');
      if (!box) return;
      if (r.error) { box.innerHTML = '<p class="note err">' + esc(r.error.message) + '</p>'; return; }
      var rows = r.data.filter(function (p) { return p.id !== me.user.id; });
      if (!rows.length) { box.innerHTML = '<p class="msg">' + (nameQuery ? '‘' + esc(nameQuery) + '’ 이름의 회원이 없습니다.' : '해당하는 회원이 없습니다.') + '</p>'; return; }
      box.innerHTML = rows.map(memberRow).join('');
    });
  }

  function memberRow(p) {
    var d = new Date(p.created_at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
    var ctl;
    if (p.role === 'admin') {
      ctl = '<span class="badge">전체 관리자</span>';
    } else if (p.role === 'teacher') {
      ctl = '<span class="badge">선생님 · 전 단계</span>'
        + (me.admin ? '<div class="stg camp">' + CAMPUSES.map(function (c) {      // 담당 캠퍼스: 여러 곳
            var on = p.campuses.indexOf(c) >= 0;
            return '<button type="button" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '" data-tcampus="' + esc(c) + '" data-id="' + p.id
              + '" data-cur="' + esc(p.campuses.join(',')) + '">' + esc(c) + '</button>';
          }).join('') + '</div>'
          + '<button class="lnk" type="button" data-role="student" data-id="' + p.id + '" data-cur="' + esc(p.campuses.join(',')) + '">선생님 해제</button>'
          : '');
    } else {
      ctl = (p.on_leave ? '<span class="badge leave">휴강 중 · 학생 재수강 대기</span>' : '')
        + '<div class="stg' + (stagesFor(p.campuses)[0] > 4 ? ' cs' : '') + '">' + stagesFor(p.campuses).map(function (n) {
        var on = p.stages.indexOf(n) >= 0;
        return '<button type="button" class="' + (on ? 'on' : '') + (n === p.wait_stage && !p.on_leave ? ' next' : '') + '" aria-pressed="' + on + '" data-stage="' + n + '" data-id="' + p.id
          + '" data-cur="' + p.stages.join(',') + '"' + (p.on_leave && !on ? ' disabled title="휴강 중에는 새 단계를 열 수 없습니다"' : '') + '>' + STAGE_NAME[n] + '</button>';
      }).join('') + '</div>'
        + '<div class="mrow"><label class="cmp">캠퍼스 <select data-scampus data-id="' + p.id + '" data-cur="' + esc(p.campuses[0] || '') + '">'
        + (p.campuses.length ? '' : '<option value="" selected>미지정</option>')
        + CAMPUSES.map(function (c) { return '<option' + (p.campuses[0] === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('')
        + '</select></label>'
        + (me.admin ? '<button class="lnk" type="button" data-role="teacher" data-id="' + p.id + '">선생님 지정</button>' : '') + '</div>';
    }
    var st = p.role !== 'student' ? ''
      : p.want_teacher && !p.stages.length ? '<span class="tbadge">강사 신청</span>'
      : !p.stages.length && p.want_stage ? '<span class="want">신청: ' + esc(STAGE_NAME[p.want_stage] || p.want_stage) + '</span>' : '';
    return '<div class="mem"><div class="info"><b>' + esc(p.name || '(이름 없음)') + '</b>'
      + (p.role !== 'admin' ? '<span class="tags"><span class="cbadge' + (p.campuses.length ? '' : ' none') + '">' + esc(campusTxt(p.campuses)) + '</span>' + st + '</span>' : '')
      + '<span>' + esc(p.email) + '</span>' + (p.note ? '<span class="memo">' + esc(p.note) + '</span>' : '')
      + '<small>가입 ' + d + (p.role === 'student' && p.stages.length && p.active_at ? ' · 마지막 승인 ' + dateTxt(p.active_at) : '') + '</small></div><div class="ctl">' + ctl + '</div></div>';
  }

  // 저장 후 그 줄만 다시 그린다. 지금 탭 조건에서 벗어나면(예: 대기 → 수강생) 흐리게 한 뒤 뺀다.
  function saveMember(btn, patch, confirmMsg) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    btn.disabled = true;
    // 저장과 다시 읽기를 나눈다: 담당 밖 캠퍼스로 옮기면 저장 결과를 돌려받을 권한이 없어(RETURNING에도 조회 규칙 적용) 한 번에 하면 거절된다.
    var id = btn.dataset.id, row = btn.closest('.mem');
    var write = btn.matches('[data-scampus]')        // 학생 캠퍼스 이동은 서버 함수로
      ? sb.rpc('move_student_campus', { target: id, campus: patch.campuses[0] })
      : sb.from('profiles').update(patch).eq('id', id);
    write.then(function (u) {
      if (u.error) return u;
      return sb.from('profiles').select(COLS).eq('id', id);
    }).then(function (r) {
      if (r.error) { alert('바꾸지 못했습니다: ' + r.error.message); btn.disabled = false; if (btn.dataset.cur != null && btn.tagName === 'SELECT') btn.value = btn.dataset.cur; return; }
      if (!r.data.length) {   // 담당 밖 캠퍼스로 옮겨져 이제 볼 수 없음
        row.classList.add('moved');
        row.querySelector('.ctl').innerHTML = '<span class="badge out">' + esc(patch.campuses && patch.campuses[0] || '') + ' 캠퍼스로 이동됨</span>';
        return;
      }
      var p = r.data[0];
      if (campusFilter && p.campuses.indexOf(campusFilter) < 0) { row.outerHTML = memberRow(p).replace('class="mem"', 'class="mem moved"'); return; }
      var keep = adminFilter === 'all'
        || (adminFilter === 'teacher' && p.role === 'teacher')
        || (adminFilter === 'wait' && p.role === 'student' && !p.on_leave && (waitStage === 't' ? p.want_teacher && !p.stages.length : p.wait_stage === waitStage))
        || (adminFilter === 'ok' && p.role === 'student' && p.stages.length > 0 && !p.on_leave)
        || (adminFilter === 'leave' && p.role === 'student' && p.on_leave);
      if (keep) row.outerHTML = memberRow(p);
      else { row.outerHTML = memberRow(p).replace('class="mem"', 'class="mem moved"'); }
    });
  }

  function changeCampus(sel) {
    var to = sel.value, from = sel.dataset.cur;
    if (!to || to === from) return;
    var away = !me.admin && me.campuses.indexOf(to) < 0;
    var msg = (from ? from + ' → ' : '') + to + ' 캠퍼스로 옮길까요?' + (away ? '\n옮기면 담당 캠퍼스가 아니어서 더 이상 이 학생을 관리할 수 없습니다.' : '');
    if (!confirm(msg)) { sel.value = from; return; }
    saveMember(sel, { campuses: [to] });
  }

  function toggleTeacherCampus(btn) {
    var cur = btn.dataset.cur ? btn.dataset.cur.split(',') : [], c = btn.dataset.tcampus;
    saveMember(btn, { campuses: cur.indexOf(c) >= 0 ? cur.filter(function (x) { return x !== c; }) : cur.concat(c) });
  }

  function toggleStage(btn) {
    var cur = btn.dataset.cur ? btn.dataset.cur.split(',').map(Number) : [], n = +btn.dataset.stage;
    var next = cur.indexOf(n) >= 0 ? cur.filter(function (x) { return x !== n; }) : cur.concat(n);
    saveMember(btn, { stages: next });
  }

  // ---------------------------------------------------------------- 흐름
  function loadMe(user) {
    return Promise.all([
      sb.from('profiles').select('*,on_leave').eq('id', user.id).maybeSingle(),
      sb.rpc('is_admin')
    ]).then(function (r) {
      var p = r[0].data || {}, admin = r[1].data === true;
      me = { user: user, profile: p, admin: admin, teacher: admin || p.role === 'teacher', stages: p.stages || [], campuses: p.campuses || [] };
    });
  }

  function route() {
    var path = routePath();
    if (!/^(cs|s[5-8])\//.test(path)) document.body.classList.remove('cs-on', 'cs-teacher');   // 신촌 교재 화면 밖
    if (DOCS[path]) return docView(path);           // 약관은 로그인 없이도 볼 수 있다
    if (!me) return authView();
    if (path === 'me') return meView();
    if (!me.teacher && !me.stages.length) return pendingView();
    if (!me.teacher && me.profile.on_leave) return leaveView();
    if (path === 'admin') return me.teacher ? adminView() : (location.hash = '#/');
    if (path === 'index.html' && csHome()) path = 'cs/index.html';
    var st = +(path.match(/^s(\d)\//) || [])[1];
    if (st && !me.teacher && me.stages.indexOf(st) < 0) return lockedView(st);
    if (view.dataset.path === path && view.querySelector('main')) return;
    showPage(path);
  }

  var recovering = false;
  sb.auth.onAuthStateChange(function (ev, session) {
    if (ev === 'PASSWORD_RECOVERY') { recovering = true; return setTimeout(function () { authView('newpw'); }); }
    if (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') {
      setTimeout(function () {   // 콜백 안에서 다른 supabase 호출을 바로 하지 않는다 (잠금 교착 방지)
        if (recovering) return;
        if (/access_token|error_description/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/');
        if (!session) { me = null; view.dataset.path = ''; pageCache = {}; return route(); }
        if (me && me.user.id === session.user.id) return;
        loadMe(session.user).then(route);
      });
    }
  });

  window.addEventListener('hashchange', function () {
    if (/^#\/?sec\d+$/.test(location.hash)) return;
    route();
  });

  view.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (ev.target.dataset.form === 'campus') return saveCampus(ev.target);
    if (ev.target.dataset.form === 'leave') return leave(ev.target);
    submit(ev.target);
  });
  var searchTimer;
  view.addEventListener('input', function (ev) {      // 회원 관리: 이름 검색 (목록만 다시 불러온다 — 입력칸 포커스 유지)
    if (!ev.target.matches('[data-search]')) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { nameQuery = ev.target.value.trim(); loadList(); }, 300);
  });
  view.addEventListener('change', function (ev) {
    if (ev.target.matches('[data-scampus]')) return changeCampus(ev.target);
    if (ev.target.name === 'campus' && ev.target.type === 'radio' && ev.target.form && ev.target.form.dataset.form === 'signup') {
      var fs = ev.target.form.querySelector('fieldset.want');   // 캠퍼스에 맞는 신청 단계로 바꾼다
      fs.innerHTML = fs.querySelector('legend').outerHTML + wantOpts(ev.target.value);
      return;
    }
    var box = ev.target.closest('.agree');                 // 전체 동의 ↔ 항목 동의 맞추기
    if (!box) return;
    var items = box.querySelectorAll('.agree-item input'), all = box.querySelector('[data-agree-all]');
    if (ev.target === all) items.forEach(function (i) { i.checked = all.checked; });
    else all.checked = [].every.call(items, function (i) { return i.checked; });
  });
  view.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-mode],[data-act],[data-filter],[data-cfilter],[data-sfilter],[data-stage],[data-tcampus],[data-role],a[href]');
    if (!t) return;
    if (t.dataset.mode) return authView(t.dataset.mode);
    if (t.dataset.sfilter) { waitStage = t.dataset.sfilter === 't' ? 't' : +t.dataset.sfilter; return adminView(); }
    if (t.dataset.filter) { adminFilter = t.dataset.filter; return adminView(); }
    if (t.dataset.cfilter != null) { campusFilter = t.dataset.cfilter; return adminView(); }
    if (t.dataset.stage) return toggleStage(t);
    if (t.dataset.tcampus) return toggleTeacherCampus(t);
    if (t.dataset.role === 'teacher') return saveMember(t, { role: 'teacher' },
      '이 회원을 선생님으로 지정할까요? 모든 권을 볼 수 있고, 담당 캠퍼스 학생에게 권 열람 권한을 줄 수 있게 됩니다.\n(지금 캠퍼스가 담당 캠퍼스로 지정되며, 나중에 바꿀 수 있습니다)');
    if (t.dataset.role === 'student') return saveMember(t, { role: 'student', campuses: (t.dataset.cur || '').split(',').filter(Boolean).slice(0, 1) },
      '선생님 권한을 해제할까요? 학생 계정으로 돌아가며(캠퍼스는 한 곳만 남습니다), 볼 수 있는 권은 따로 열어 주어야 합니다.');
    if (t.dataset.act === 'logout') return sb.auth.signOut();
    if (t.dataset.act === 'resume') return resume(t);
    if (t.dataset.act === 'recheck') { view.dataset.path = ''; return loadMe(me.user).then(route); }
    var href = t.getAttribute('href');
    if (/^#sec\d+$/.test(href)) {                     // 꼭지 바로가기
      ev.preventDefault();
      var h = document.getElementById(href.slice(1));
      if (h) h.scrollIntoView({ behavior: 'smooth' });
    } else if (/\.html$/.test(href) && !/^[a-z]+:/i.test(href)) {   // 교재 쪽 사이 이동
      ev.preventDefault();
      location.hash = hashOf(resolve(view.dataset.path || 'index.html', href));
    }
  });
})();
