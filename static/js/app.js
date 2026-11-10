
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

  // ==============================
  // STATE
  // ==============================

  let fortunesCache = null;

  let fortunePromise = null;

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

    const response = await fetch(FORTUNES_FILE, {
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-cache'
    });

    if (!response.ok) {
      throw new Error(
        `Could not load fortunes: HTTP ${response.status}`
      );
    }

    const data = await response.json();

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
    const fortunes = await loadFortunesDatabase();

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
    titleNode.textContent = fortune.title;

    poemNode.replaceChildren();

    // هر دو مصراع یک بیت‌اند.
    // مصراع اول راست‌چین و مصراع دوم چپ‌چین.

    for (let i = 0; i < fortune.poem.length; i += 2) {
      const beyt = document.createElement('p');

      beyt.className = 'beyt';

      fortune.poem.slice(i, i + 2).forEach((line) => {
        const misra = document.createElement('span');

        misra.className = 'misra';

        misra.textContent = line;

        beyt.append(misra);
      });

      poemNode.append(beyt);
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
    letter.getAnimations().forEach(
      (animation) => animation.cancel()
    );

    envelope.getAnimations().forEach(
      (animation) => animation.cancel()
    );

    envelope.classList.add('is-instant');

    envelope.classList.remove(
      'is-rising',
      'is-leaving'
    );

    envelope.removeAttribute('style');

    pocket.before(letter);

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

    fortunePromise = requestFortune().then((fortune) => {
      fillLetter(fortune);

      fitLetterToEnvelope();

      dialog.classList.remove('is-loading');

      return fortune;
    });

    fortunePromise.catch((error) => {
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

    hero.inert = true;

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
    } catch {
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

    if (reduceMotion.matches) {
      envelope.hidden = true;
    } else {
      Object.assign(envelope.style, {
        left: `${envelopeBox.left}px`,
        top: `${envelopeBox.top}px`,
        width: `${envelopeBox.width}px`
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
      if (!reduceMotion.matches) {
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

        await Promise.all([
          letter.animate(fade, options).finished,
          actions.animate(fade, options).finished
        ]);

        actions.getAnimations().forEach(
          (animation) => animation.cancel()
        );
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

  scroller.addEventListener('click', (event) => {
    if (
      event.target === scroller &&
      dialog.dataset.state === 'sealed'
    ) {
      closeDialog();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (
      event.key === 'Escape' &&
      !dialog.hidden
    ) {
      closeDialog();
    }
  });

  window.addEventListener(
    'resize',
    fitLetterToEnvelope
  );

})();
