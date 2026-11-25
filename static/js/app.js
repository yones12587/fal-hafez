(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // ==============================
  // DOM ELEMENTS
  // ==============================

  const hero = $('hero');
  const getButton = $('getFortune');
  const dialog = $('fortune');
  const scroller = $('fortuneScroll');
  const closeButton = $('closeFortune');
  const hint = $('hint');

  const envelope = $('envelope');
  const pocket = envelope.querySelector('.env-pocket');
  const hit = $('envelopeHit');
  const letter = $('letter');

  const actions = $('actions');
  const newFortuneButton = $('newFortune');
  const backButton = $('backToScene');

  const shareButton = $('shareFortune');
  const shareStatus = $('shareStatus');
  const shareText = $('shareText');

  const errorBox = $('fortuneError');
  const retryButton = $('retryFortune');

  const titleNode = $('fortuneTitle');
  const poemNode = $('fortunePoem');
  const interpretationNode = $('fortuneInterpretation');
  const adviceNode = $('fortuneAdvice');

  // ==============================
  // SETTINGS
  // ==============================

  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  );

  const HINT_SEALED = 'نیت کنید، سپس مُهر پاکت را بشکنید';

  const FORTUNES_FILE = './static/data/fortunes.json';

  const FORTUNES_COOKIE_KEY = 'hafez_seen_fortunes_v1';

  const NASTALIQ_FILE = './static/data/nastaliq.json?v=20261125';

  const SITE_URL = 'https://falefafez12.ir/';

  const FETCH_TIMEOUT_MS = 15000;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // انیمیشن‌های جاوااسکریپتی فقط وقتی اجرا می‌شوند که لغو کردنشان هم ممکن باشد.
  const canAnimate =
    typeof Element.prototype.animate === 'function' &&
    typeof Element.prototype.getAnimations === 'function';

  // ==============================
  // STATE
  // ==============================

  let fortunesCache = null;

  let fortunePromise = null;

  let nastaliqData = null;

  let nastaliqRequest = null;

  let currentFortune = null;

  // فقط پاسخ آخرین درخواست روی صفحه اعمال می‌شود.
  let requestToken = 0;

  let busy = false;

  // هر بار باز یا بسته شدن پنجره، شمارنده افزایش پیدا می‌کند.
  // این کار مانع ادامه انیمیشن‌های مربوط به نشست قبلی می‌شود.

  let session = 0;

  // ==============================
  // BASIC HELPERS
  // ==============================

  const wait = (ms) => new Promise((resolve) => {
    window.setTimeout(
      resolve,
      reduceMotion.matches ? 0 : ms
    );
  });

  function cancelAnimations(element) {
    if (canAnimate) {
      element.getAnimations().forEach(
        (animation) => animation.cancel()
      );
    }
  }

  // fetch با مهلت زمانی؛ شبکهٔ کند نباید صفحه را بی‌پاسخ نگه دارد.
  // بدنهٔ پاسخ هم داخل همین مهلت خوانده می‌شود.
  async function fetchJson(url) {
    const controller =
      typeof AbortController === 'function'
        ? new AbortController()
        : null;

    let timer = 0;

    const timeout = new Promise((resolve, reject) => {
      timer = window.setTimeout(() => {
        reject(new Error(`Timed out: ${url}`));
        if (controller) controller.abort();
      }, FETCH_TIMEOUT_MS);
    });

    const request = (async () => {
      const options = {
        headers: { Accept: 'application/json' },
        cache: 'no-cache'
      };

      if (controller) options.signal = controller.signal;

      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${url}`);
      }

      return response.json();
    })();

    try {
      return await Promise.race([request, timeout]);
    } finally {
      window.clearTimeout(timer);
    }
  }

  // ==============================
  // NASTALIQ OUTLINES
  // ==============================

  // متن‌های نستعلیق از پیش به مسیر SVG تبدیل شده‌اند (tools/build-nastaliq.mjs)
  // تا شکل‌دهی حروف در همهٔ موتورهای مرورگر یکسان باشد.
  // اگر این داده نرسد، همان متن با قلم وب نمایش داده می‌شود.

  function loadNastaliq() {
    if (!nastaliqRequest) {
      nastaliqRequest = fetchJson(NASTALIQ_FILE).then(
        (data) => {
          nastaliqData =
            data && data.lines && data.glyphs ? data : null;
        },
        (error) => {
          console.warn('Nastaliq outlines unavailable:', error);
          nastaliqRequest = null;
        }
      );
    }

    return nastaliqRequest;
  }

  function setNastaliq(node, text, lineHeight) {
    node.textContent = '';

    const data = nastaliqData;
    const line = data && data.lines[text];

    node.classList.toggle('is-text', !line);

    if (!line) {
      node.textContent = text;
      return;
    }

    const upem = data.upem;
    const width = line[0];
    const glyphs = line[1];

    // جای خط کرسی مثل متن معمولی: نیم‌فاصلهٔ سطر به‌اضافهٔ ascender
    const baseline =
      (lineHeight * upem - data.ascender - data.descender) / 2 +
      data.ascender;

    const svg = document.createElementNS(SVG_NS, 'svg');

    svg.setAttribute('class', 'nast');
    svg.setAttribute(
      'viewBox',
      `0 ${-baseline} ${width} ${lineHeight * upem}`
    );
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    svg.style.width = `${(width / upem).toFixed(4)}em`;
    svg.style.height = `${lineHeight}em`;

    const group = document.createElementNS(SVG_NS, 'g');

    group.setAttribute('transform', 'scale(1 -1)');

    glyphs.forEach(([id, x, y]) => {
      const path = document.createElementNS(SVG_NS, 'path');

      path.setAttribute('d', data.glyphs[id]);
      path.setAttribute('transform', `translate(${x} ${y})`);

      group.appendChild(path);
    });

    svg.appendChild(group);

    const label = document.createElement('span');

    label.className = 'sr-only';
    label.textContent = text;

    node.appendChild(svg);
    node.appendChild(label);
  }

  // ==============================
  // FORTUNE HISTORY
  // ==============================

  // ابتدا سابقه فال‌ها از Cookie خوانده می‌شود.
  // در صورت در دسترس نبودن Cookie، از sessionStorage استفاده می‌کنیم.

  function readSeenFortunes() {
    try {
      const prefix = `${FORTUNES_COOKIE_KEY}=`;

      const cookieItem = document.cookie
        .split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith(prefix));

      if (cookieItem) {
        const saved = JSON.parse(
          decodeURIComponent(cookieItem.slice(prefix.length))
        );

        if (Array.isArray(saved)) {
          return saved.filter(
            (id) => typeof id === 'string'
          );
        }
      }
    } catch (error) {
      console.warn('Could not read fortune cookie:', error);
    }

    // پشتیبان در صورت محدودیت Cookie

    try {
      const saved = JSON.parse(
        sessionStorage.getItem(FORTUNES_COOKIE_KEY) || '[]'
      );

      return Array.isArray(saved)
        ? saved.filter((id) => typeof id === 'string')
        : [];
    } catch (error) {
      console.warn('Could not read fortune history:', error);
      return [];
    }
  }

  function saveSeenFortunes(ids) {
    const serialized = JSON.stringify(ids);

    // ذخیره به‌صورت Cookie نشست مرورگر

    try {
      const secure =
        location.protocol === 'https:' ? '; Secure' : '';

      document.cookie =
        `${FORTUNES_COOKIE_KEY}=${encodeURIComponent(serialized)}` +
        `; Path=/; SameSite=Lax${secure}`;
    } catch (error) {
      console.warn('Could not save fortune cookie:', error);
    }

    // ذخیره پشتیبان در sessionStorage

    try {
      sessionStorage.setItem(
        FORTUNES_COOKIE_KEY,
        serialized
      );
    } catch (error) {
      console.warn('Could not save fortune history:', error);
    }
  }

  // ==============================
  // LOAD FORTUNE DATABASE
  // ==============================

  async function loadFortunesDatabase() {
    if (fortunesCache) {
      return fortunesCache;
    }

    const data = await fetchJson(FORTUNES_FILE);

    // بررسی سلامت بانک فال‌ها

    if (
      !Array.isArray(data) ||
      data.length === 0 ||
      data.some((item) =>
        !item ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        typeof item.title !== 'string' ||
        !item.title.trim() ||
        !Array.isArray(item.poem) ||
        item.poem.length === 0 ||
        item.poem.some((line) => typeof line !== 'string')
      )
    ) {
      throw new Error('Invalid fortunes database');
    }

    // جلوگیری از شناسه‌های تکراری

    const ids = data.map((item) => item.id);

    if (new Set(ids).size !== ids.length) {
      throw new Error('Duplicate fortune IDs detected');
    }

    fortunesCache = data;

    return fortunesCache;
  }

  // ==============================
  // SELECT RANDOM FORTUNE
  // ==============================

  async function requestFortune() {
    const [fortunes] = await Promise.all([
      loadFortunesDatabase(),
      loadNastaliq()
    ]);

    // سابقه فال‌های قبلی

    let seen = readSeenFortunes();

    // حذف شناسه‌هایی که دیگر در بانک وجود ندارند

    const validIds = new Set(
      fortunes.map((item) => item.id)
    );

    seen = seen.filter((id) => validIds.has(id));

    // فقط فال‌هایی که قبلاً نمایش داده نشده‌اند

    let available = fortunes.filter(
      (item) => !seen.includes(item.id)
    );

    // وقتی همه فال‌ها نمایش داده شدند،
    // چرخه دوباره از ابتدا شروع می‌شود.

    if (available.length === 0) {
      seen = [];
      available = fortunes.slice();
    }

    // انتخاب تصادفی

    const index = Math.floor(
      Math.random() * available.length
    );

    const fortune = available[index];

    // ثبت فال انتخاب‌شده

    seen.push(fortune.id);

    saveSeenFortunes(seen);

    return fortune;
  }

  // ==============================
  // DISPLAY FORTUNE
  // ==============================

  function fillLetter(fortune) {
    currentFortune = fortune;

    setNastaliq(titleNode, fortune.title, 1.2);

    poemNode.textContent = '';

    // هر دو مصراع یک بیت‌اند.
    // مصراع اول راست‌چین و مصراع دوم چپ‌چین.

    for (let i = 0; i < fortune.poem.length; i += 2) {
      const beyt = document.createElement('p');

      beyt.className = 'beyt';

      fortune.poem.slice(i, i + 2).forEach((line) => {
        const misra = document.createElement('span');

        misra.className = 'misra';

        setNastaliq(misra, line, 1.85);

        beyt.appendChild(misra);
      });

      poemNode.appendChild(beyt);
    }

    interpretationNode.textContent =
      fortune.interpretation || '';

    adviceNode.textContent =
      fortune.advice || '';
  }

  // ==============================
  // FIT LETTER INSIDE ENVELOPE
  // ==============================

  // نامه با عرض واقعی خواندن چیده می‌شود
  // و فقط کوچک می‌شود تا داخل پاکت جا بگیرد.

  function fitLetterToEnvelope() {
    if (letter.parentElement !== envelope) return;

    const width = envelope.offsetWidth;
    const height = envelope.offsetHeight;

    const letterWidth = letter.offsetWidth;

    if (!width || !height || !letterWidth) return;

    const scale = (width * 0.9) / letterWidth;

    if (!Number.isFinite(scale) || scale <= 0) return;

    letter.style.setProperty(
      '--s',
      scale.toFixed(4)
    );

    letter.style.setProperty(
      '--lh',
      `${(height * 0.94) / scale}px`
    );

    letter.style.setProperty(
      '--rise',
      `${-height * 0.44}px`
    );
  }

  // ==============================
  // ANIMATION HELPERS
  // ==============================

  function replay(element, className) {
    element.classList.remove(className);

    void element.offsetWidth;

    element.classList.add(className);
  }

  // ==============================
  // RESET ENVELOPE
  // ==============================

  function resetToEnvelope() {
    cancelAnimations(letter);

    cancelAnimations(envelope);

    resetShare();

    envelope.classList.add('is-instant');

    envelope.classList.remove(
      'is-rising',
      'is-leaving'
    );

    envelope.removeAttribute('style');

    envelope.insertBefore(letter, pocket);

    dialog.dataset.state = 'sealed';

    envelope.hidden = false;

    hint.hidden = false;

    hint.textContent = HINT_SEALED;

    hit.hidden = false;

    actions.hidden = true;

    errorBox.hidden = true;

    scroller.scrollTop = 0;

    fitLetterToEnvelope();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        envelope.classList.remove('is-instant');
      });
    });

    replay(envelope, 'is-arriving');
  }

  // ==============================
  // LOAD NEXT FORTUNE
  // ==============================

  function loadNext() {
    dialog.classList.add('is-loading');

    requestToken += 1;

    const token = requestToken;

    currentFortune = null;

    fortunePromise = requestFortune().then((fortune) => {
      if (token !== requestToken) return fortune;

      fillLetter(fortune);

      fitLetterToEnvelope();

      dialog.classList.remove('is-loading');

      return fortune;
    });

    fortunePromise.catch((error) => {
      if (token !== requestToken) return;

      console.error(
        'Could not load Hafez fortune:',
        error
      );

      dialog.classList.remove('is-loading');

      envelope.hidden = true;

      hint.hidden = true;

      errorBox.hidden = false;

      retryButton.focus({
        preventScroll: true
      });
    });
  }

  // ==============================
  // OPEN DIALOG
  // ==============================

  function openDialog() {
    session += 1;

    busy = false;

    dialog.hidden = false;

    // inert در مرورگرهای قدیمی نیست؛ aria-hidden و حلقهٔ Tab جای آن را می‌گیرند.
    hero.inert = true;

    hero.setAttribute('aria-hidden', 'true');

    document.documentElement.classList.add(
      'is-locked'
    );

    resetToEnvelope();

    loadNext();

    hit.focus({
      preventScroll: true
    });
  }

  // ==============================
  // CLOSE DIALOG
  // ==============================

  function closeDialog() {
    if (dialog.hidden) return;

    session += 1;

    busy = false;

    dialog.hidden = true;

    hero.inert = false;

    hero.removeAttribute('aria-hidden');

    document.documentElement.classList.remove(
      'is-locked'
    );

    getButton.focus({
      preventScroll: true
    });
  }

  // ==============================
  // BREAK ENVELOPE SEAL
  // ==============================

  async function breakSeal() {
    if (
      busy ||
      dialog.dataset.state !== 'sealed'
    ) {
      return;
    }

    busy = true;

    const run = session;

    try {
      await fortunePromise;
    } catch (error) {
      busy = false;
      return;
    }

    if (run !== session) return;

    hit.hidden = true;

    dialog.dataset.state = 'opening';

    await wait(780);

    if (run !== session) return;

    envelope.classList.add('is-rising');

    await wait(1150);

    if (run !== session) return;

    showLetter();

    busy = false;
  }

  // ==============================
  // SHOW LETTER
  // ==============================

  // نامه از جای خودش در پاکت به اندازه کامل باز می‌شود.
  // این انیمیشن با روش FLIP انجام می‌شود.

  function showLetter() {
    const first = letter.getBoundingClientRect();

    const envelopeBox = envelope.getBoundingClientRect();

    letter.removeAttribute('style');

    actions.before(letter);

    dialog.dataset.state = 'reading';

    hint.hidden = true;

    actions.hidden = false;

    scroller.scrollTop = 0;

    if (reduceMotion.matches || !canAnimate) {
      envelope.hidden = true;
    } else {
      Object.assign(envelope.style, {
        left: `${envelopeBox.left}px`,
        top: `${envelopeBox.top}px`,
        width: `${envelopeBox.width}px`,
        height: `${envelopeBox.height}px`
      });

      envelope.classList.add('is-leaving');

      envelope.addEventListener(
        'animationend',
        () => {
          if (
            envelope.classList.contains('is-leaving')
          ) {
            envelope.hidden = true;
          }
        },
        { once: true }
      );

      const last = letter.getBoundingClientRect();

      const scale = first.width / last.width;

      const hiddenBelow = Math.max(
        0,
        last.height - first.height / scale
      );

      letter.animate(
        [
          {
            transformOrigin: '0 0',

            transform:
              `translate(${first.left - last.left}px, ` +
              `${first.top - last.top}px) scale(${scale})`,

            clipPath: `inset(0 0 ${hiddenBelow}px 0)`
          },

          {
            transformOrigin: '0 0',
            transform: 'none',
            clipPath: 'inset(0 0 0 0)'
          }
        ],
        {
          duration: 1000,
          easing: 'cubic-bezier(.22, 1, .36, 1)'
        }
      );
    }

    letter.focus({
      preventScroll: true
    });
  }

  // ==============================
  // DRAW ANOTHER FORTUNE
  // ==============================

  async function drawAgain() {
    if (busy) return;

    busy = true;

    const run = session;

    try {
      if (!reduceMotion.matches && canAnimate) {
        const fade = [
          { opacity: 1 },
          {
            opacity: 0,
            transform: 'translateY(18px)'
          }
        ];

        const options = {
          duration: 340,
          easing: 'ease-in',
          fill: 'forwards'
        };

        letter.animate(fade, options);
        actions.animate(fade, options);

        await wait(options.duration);

        cancelAnimations(actions);
      }
    } catch (error) {
      console.warn('Fortune transition was interrupted:', error);
    }

    if (run !== session) return;

    resetToEnvelope();

    loadNext();

    hit.focus({
      preventScroll: true
    });

    busy = false;
  }

  // ==============================
  // SHARE
  // ==============================

  function buildShareText(fortune) {
    const beyts = [];

    for (let i = 0; i < fortune.poem.length; i += 2) {
      beyts.push(fortune.poem.slice(i, i + 2).join('\n'));
    }

    return [
      `فال حافظ شب یلدا — ${fortune.title}`,
      beyts.join('\n\n'),
      fortune.interpretation
        ? `تعبیر فال: ${fortune.interpretation}`
        : '',
      fortune.advice ? `پیام حافظ: ${fortune.advice}` : ''
    ].filter(Boolean).join('\n\n');
  }

  function resetShare() {
    shareStatus.textContent = '';
    shareText.hidden = true;
    shareText.value = '';
  }

  // آخرین راه: متن در کادر انتخاب‌شده نمایش داده می‌شود تا دستی کپی شود.
  function offerManualCopy(text) {
    shareText.value = text;
    shareText.hidden = false;
    shareStatus.textContent =
      'متن فال آماده است؛ آن را انتخاب و کپی کنید.';
    shareText.focus();
    shareText.select();
  }

  async function copyFortune(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        shareText.hidden = true;
        shareStatus.textContent =
          'متن فال کپی شد؛ هر جا خواستید بچسبانید.';
        return;
      } catch (error) {
        console.warn('Clipboard write failed:', error);
      }
    }

    offerManualCopy(text);
  }

  async function shareFortune() {
    if (!currentFortune) return;

    const run = session;
    const body = buildShareText(currentFortune);

    shareStatus.textContent = '';

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'فال حافظ شب یلدا',
          text: body,
          url: SITE_URL
        });
        return;
      } catch (error) {
        // کاربر خودش پنجرهٔ هم‌رسانی را بسته است.
        if (error && error.name === 'AbortError') return;
        console.warn('Web Share failed:', error);
      }
    }

    if (run !== session) return;

    await copyFortune(`${body}\n\n${SITE_URL}`);
  }

  // فوکوس صفحه‌کلید داخل پنجرهٔ فال می‌ماند.
  function trapFocus(event) {
    const items = Array.prototype.filter.call(
      dialog.querySelectorAll(
        'button, textarea, [tabindex]:not([tabindex="-1"])'
      ),
      (item) => !item.disabled && item.getClientRects().length > 0
    );

    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (!dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // ==============================
  // RETRY AFTER ERROR
  // ==============================

  function retry() {
    resetToEnvelope();

    loadNext();

    hit.focus({
      preventScroll: true
    });
  }

  // ==============================
  // EVENT LISTENERS
  // ==============================

  getButton.addEventListener(
    'click',
    openDialog
  );

  hit.addEventListener(
    'click',
    breakSeal
  );

  closeButton.addEventListener(
    'click',
    closeDialog
  );

  backButton.addEventListener(
    'click',
    closeDialog
  );

  newFortuneButton.addEventListener(
    'click',
    drawAgain
  );

  retryButton.addEventListener(
    'click',
    retry
  );

  shareButton.addEventListener(
    'click',
    shareFortune
  );

  scroller.addEventListener('click', (event) => {
    if (
      event.target === scroller &&
      dialog.dataset.state === 'sealed'
    ) {
      closeDialog();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (dialog.hidden) return;

    // «Esc» نام این کلید در مرورگرهای قدیمی است.
    if (event.key === 'Escape' || event.key === 'Esc') {
      closeDialog();
    } else if (event.key === 'Tab') {
      trapFocus(event);
    }
  });

  window.addEventListener(
    'resize',
    fitLetterToEnvelope
  );

  // ==============================
  // ART FALLBACK
  // ==============================

  // اگر تصویر صحنه نرسد، دکمه باید همچنان دیده شود.
  const art = hero.querySelector('.stage__art img');

  function showWithoutArt() {
    hero.classList.add('no-art');
  }

  if (art) {
    art.addEventListener('error', showWithoutArt);

    if (art.complete && art.naturalWidth === 0) {
      showWithoutArt();
    }
  }

  // ==============================
  // IDLE PRELOAD
  // ==============================

  // پس از کامل شدن صفحه، داده‌های فال از پیش گرفته می‌شوند
  // تا بارگذاری تصویرهای اصلی عقب نیفتد.
  function warmUp() {
    loadNastaliq();
    loadFortunesDatabase().catch((error) => {
      console.warn('Fortune preload failed:', error);
    });
  }

  if (document.readyState === 'complete') {
    warmUp();
  } else {
    window.addEventListener('load', warmUp, { once: true });
  }

})();
