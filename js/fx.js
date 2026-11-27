/* Small celebrations, in the manner of the owner's Throughline: a burst of gold sparks where
   something good just happened, a card that springs up for an achievement, and a little loaf
   that grows as a bake's photos come in. All of it is decoration: nothing here blocks a tap,
   and it stands down when the phone asks for less motion. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};
  var doc = root.document;

  // honey, toffee, butter, crust: the app's own golds and browns
  var GOLD = ['#E8A532', '#C27C3A', '#F8E9C4', '#E8A532', '#A35F1F'];
  var SPARK = '<svg viewBox="0 0 12 12"><path d="M6 0l1.4 4.6L12 6l-4.6 1.4L6 12l-1.4-4.6L0 6l4.6-1.4z" fill="currentColor"/></svg>';

  /** No celebrations at all. The flows under test set this, so nothing moves under them. */
  function quiet() { return !!root.__lgtQuiet; }
  /** The phone asked for less motion: cards still show, nothing flies. */
  function calm() { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function still() { return quiet() || calm() || !doc || !doc.body; }
  /** A tap in the hand, where the phone can give one (an iPhone cannot). */
  function buzz(pattern) { try { if (!quiet() && root.navigator && root.navigator.vibrate) root.navigator.vibrate(pattern); } catch (e) { /* no matter */ } }

  if (doc && quiet()) doc.documentElement.classList.add('quiet');

  function later(fn, ms) { return root.setTimeout(fn, ms); }
  /** The middle of an element, if any of it is on screen. */
  function center(el) {
    if (!el || !el.getBoundingClientRect) return null;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > root.innerHeight) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r };
  }
  function put(el, x, y, life) {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(el);
    later(function () { el.remove(); }, life);
    return el;
  }

  /**
   * A burst of four-point sparks from a point, flung outwards and fading.
   * opts: colors, spread (how far, px), emojis (a few of the sparks are these instead)
   */
  function sparkle(x, y, n, opts) {
    if (still()) return;
    opts = opts || {};
    var colors = opts.colors || GOLD, spread = opts.spread || 50, emojis = opts.emojis || [];
    for (var i = 0; i < n; i++) {
      var s = doc.createElement('span'), a = Math.random() * Math.PI * 2, r = spread * (0.6 + Math.random() * 0.8);
      var emoji = emojis.length && i % 4 === 3 ? emojis[Math.floor(i / 4) % emojis.length] : '';
      s.className = 'spark' + (emoji ? ' em' : '');
      s.style.setProperty('--dx', Math.cos(a) * r + 'px');
      s.style.setProperty('--dy', Math.sin(a) * r + 'px');
      s.style.setProperty('--rot', (Math.random() * 180 - 90) + 'deg');
      if (emoji) s.textContent = emoji;
      else {
        var size = 7 + Math.random() * 9;
        s.style.width = s.style.height = size + 'px';
        s.style.margin = (-size / 2) + 'px 0 0 ' + (-size / 2) + 'px';
        s.style.color = colors[i % colors.length];
        s.innerHTML = SPARK;
      }
      put(s, x, y, 900);
    }
  }
  /** Sparks from the middle of an element (or a point inside it: at = [fraction across, fraction down]). */
  function sparkleAt(el, n, opts, at) {
    var c = center(el);
    if (!c) return false;
    if (at) sparkle(c.r.left + c.r.width * at[0], c.r.top + c.r.height * at[1], n, opts);
    else sparkle(c.x, c.y, n, opts);
    return true;
  }
  /** One emoji that rises from a point and fades. */
  function float(x, y, emoji) {
    if (still() || !emoji) return;
    var e = doc.createElement('span');
    e.className = 'floaty';
    e.textContent = emoji;
    put(e, x, y, 1300);
  }
  /** Play a one-shot animation class on an element again. */
  function replay(el, cls) {
    if (!el || still()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    later(function () { el.classList.remove(cls); }, 900);
  }

  // ---------- what a bread looks like ----------
  var KINDS = [
    [/baguette|ficelle|[ée]pi\b/i, '🥖'], [/croissant/i, '🥐'], [/pretzel|brezel/i, '🥨'], [/bagel/i, '🥯'],
    [/pancake|cr[eê]pe/i, '🥞'], [/waffle/i, '🧇'], [/pizza/i, '🍕'], [/do(ugh)?nut/i, '🍩'],
    [/noodle|ramen/i, '🍜'], [/pasta|spaghetti|lasagn/i, '🍝'], [/naan|pita|flatbread|tortilla|focaccia|roti/i, '🫓'],
    [/cake|muffin|banana bread/i, '🧁'], [/cookie|biscuit/i, '🍪'], [/\bpie\b/i, '🥧'], [/queijo|cheese/i, '🧀']
  ];
  /** The emoji closest to what was baked, going by its name. */
  function breadEmoji(name) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i][0].test(String(name || ''))) return KINDS[i][1];
    return '🍞';
  }

  // ---------- greeting what was just added ----------
  /**
   * Find what was just added on screen (the piece marked data-fresh), bring it into view and
   * throw sparks from it. If it is not on this screen, the sparks come from its tab instead.
   * kind: 'bread' | 'recipe'; opts: emoji (floats up from it), flag (joins the sparks)
   */
  function greet(kind, opts) {
    if (still()) return;
    opts = opts || {};
    var tries = 0, extras = [opts.emoji, opts.flag].filter(Boolean);
    function celebrate(x, y, n, spread) {
      sparkle(x, y, n, { spread: spread, emojis: extras });
      if (opts.emoji) float(x, y - 6, opts.emoji);
      buzz(12);
    }
    function look() {
      // only what is on the page in front counts: a tile under an open page cannot be seen
      var screens = doc.querySelectorAll('.screen'), top = screens[screens.length - 1] || null;
      var list = Array.prototype.filter.call(doc.querySelectorAll('[data-fresh="' + kind + '"]'), function (el) {
        return (el.closest('.screen') || null) === top;
      });
      var el = list[list.length - 1];
      if (el) {
        var r = el.getBoundingClientRect(), seen = r.top >= 60 && r.bottom <= root.innerHeight - 90;
        var go = function () { var c = center(el); if (c) celebrate(c.x, c.y, 14, 70); };
        if (seen || !el.scrollIntoView) go();
        else {
          try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); }
          later(go, 420);
        }
        return;
      }
      if (++tries < 4) { later(look, 100); return; }
      // not on this page: its tab catches it, or failing that the middle of the screen
      var tab = top ? null : doc.querySelector('.tabbar .tab[data-tab="' + (kind === 'recipe' ? 'recipes' : 'gallery') + '"] .icon');
      var c = center(tab);
      if (c) { celebrate(c.x, c.y, 10, 44); replay(tab, 'hop'); }
      else celebrate(root.innerWidth / 2, root.innerHeight * 0.42, 14, 80);
    }
    later(look, 150);
  }

  // ---------- a bake's photos: the loaf grows with each one ----------
  // The owner takes them at kneading, proofing, shaped before the bake, and baked.
  var DOUGH = 'fill="#F6E8CB" stroke="#D9BF8F" stroke-width="2"';
  var STAGES = [
    // kneading: a ball of dough on a floured board
    '<ellipse cx="32" cy="51" rx="23" ry="3.5" fill="#EADCC1"/>' +
    '<g class="part"><path d="M13 43c0-11 8-19 19-19s19 8 19 19c0 5-8 8-19 8s-19-3-19-8z" ' + DOUGH + '/>' +
    '<path d="M24 33c3-3 7-4 11-3" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".9"/></g>' +
    '<circle cx="9" cy="47" r="1.6" fill="#D9BF8F"/><circle cx="56" cy="49" r="1.4" fill="#D9BF8F"/><circle cx="50" cy="55" r="1.2" fill="#D9BF8F"/>',
    // proofing: risen over the rim of a bowl
    '<g class="part"><path d="M12 36c0-12 8-21 20-21s20 9 20 21z" ' + DOUGH + '/>' +
    '<path d="M23 26c3-4 7-5 11-4" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".9"/></g>' +
    '<path d="M9 35h46c0 12-9 20-23 20S9 47 9 35z" fill="#B9C39C" stroke="#8C9A6C" stroke-width="2" stroke-linejoin="round"/>' +
    '<path class="up" d="M32 11V4M28.5 7.5L32 4l3.5 3.5" fill="none" stroke="#C27C3A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    // shaped and scored, on its tray, before the bake
    '<rect x="7" y="47" width="50" height="5" rx="2.5" fill="#B5A898"/>' +
    '<path d="M10 44c0-12 8-20 22-20s22 8 22 20c0 2-2 3-4 3H14c-2 0-4-1-4-3z" ' + DOUGH + '/>' +
    '<path class="score" d="M21 31l5 8M30 29l5 8M39 31l5 8" fill="none" stroke="#C9AD7C" stroke-width="2.6" stroke-linecap="round"/>',
    // baked: golden, with steam
    '<rect x="7" y="47" width="50" height="5" rx="2.5" fill="#B5A898"/>' +
    '<path d="M10 44c0-12 8-20 22-20s22 8 22 20c0 2-2 3-4 3H14c-2 0-4-1-4-3z" fill="#D18B3D" stroke="#A35F1F" stroke-width="2"/>' +
    '<path d="M21 31l5 8M30 29l5 8M39 31l5 8" fill="none" stroke="#F6DDAE" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path class="steam" d="M24 19c-2-3 2-5 0-8M32 17c-2-3 2-5 0-8M40 19c-2-3 2-5 0-8" fill="none" stroke="#B9AB98" stroke-width="2" stroke-linecap="round"/>'
  ];
  /** The little loaf at its nth stage (1 to 4, the last for any after), over an element. */
  function stage(el, n) {
    if (still()) return;
    var c = center(el);
    if (!c) return;
    var i = Math.max(1, Math.min(STAGES.length, n)), s = doc.createElement('span');
    s.className = 'stagefx s' + i;
    s.innerHTML = '<svg viewBox="0 0 64 64">' + STAGES[i - 1] + '</svg>';
    put(s, c.x, c.y, 1500);
    if (i === STAGES.length) later(function () { sparkle(c.x, c.y, 12, { spread: 58 }); }, 260);
    else sparkle(c.x, c.y, 5, { spread: 44 });
    buzz(8);
  }

  /** Sparks from a star as it is picked: more of them for five. */
  function star(el, value) {
    if (!value) return;
    sparkleAt(el, value >= 5 ? 16 : value >= 4 ? 9 : 6, { spread: value >= 5 ? 62 : 34 });
    buzz(value >= 5 ? [8, 30, 12] : 6);
  }

  // ---------- achievements ----------
  var showing = null;
  function dismiss(card) {
    if (!card || card.gone) return;
    card.gone = true;
    card.classList.add('out');
    later(function () { card.remove(); if (showing === card) showing = null; }, 340);
  }
  function line(a) {
    var row = doc.createElement('div'), e = doc.createElement('span'), t = doc.createElement('span'), b = doc.createElement('b'), g = doc.createElement('i');
    row.className = 'urow';
    e.className = 'uemoji';
    e.textContent = a.emoji;
    b.textContent = a.name;
    g.textContent = a.goal;
    t.appendChild(b);
    t.appendChild(g);
    row.appendChild(e);
    row.appendChild(t);
    return row;
  }
  /**
   * The card that springs up when achievements are earned: one, or several at once. It leaves
   * by itself (sooner for one), or at a tap. Shown even when little should move; never when quiet.
   */
  function unlock(list) {
    if (quiet() || !doc || !doc.body || !list || !list.length) return;
    if (showing) dismiss(showing);
    var card = doc.createElement('div');
    card.className = 'unlock' + (list.length > 1 ? ' many' : '');
    card.setAttribute('role', 'status');
    list.forEach(function (a) { card.appendChild(line(a)); });
    doc.body.appendChild(card);
    showing = card;
    var c = center(card);
    if (c) sparkle(c.x, c.y, 26, { spread: 130 });
    buzz([10, 40, 18]);
    card.addEventListener('click', function () { dismiss(card); });
    later(function () { dismiss(card); }, list.length > 1 ? Math.min(9000, 3200 + list.length * 700) : 3000);
  }

  /** The loaf in the corner of the Gallery likes being tapped; now and then it throws bread. */
  var taps = 0;
  function mark(el) {
    replay(el, 'hop');
    taps++;
    if (taps % 5 === 0) sparkleAt(el, 20, { spread: 120, emojis: ['🍞', '🥖', '🥐', '🥨', '🥯'] });
    else sparkleAt(el, 6, { spread: 36 });
    buzz(6);
  }

  LGT.fx = {
    quiet: quiet, calm: calm, sparkle: sparkle, sparkleAt: sparkleAt, float: float, replay: replay, buzz: buzz,
    breadEmoji: breadEmoji, greet: greet, stage: stage, star: star, unlock: unlock, mark: mark
  };
})(typeof window !== 'undefined' ? window : globalThis);
