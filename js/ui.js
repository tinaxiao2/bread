/* Small shared pieces of interface: icons, stars, photos, sheets, dialogs. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};
  var H = root.htmPreact, html = H.html, useState = H.useState, useEffect = H.useEffect;
  var U = LGT.util, P = LGT.platform;

  var STAR = 'M12 2.4l2.95 6 6.6.95-4.78 4.66 1.13 6.58L12 17.5l-5.9 3.1 1.13-6.59L2.45 9.35l6.6-.96z';
  var ICONS = {
    plus: function () { return html`<path d="M12 5v14M5 12h14"/>`; },
    back: function () { return html`<path d="M14.5 5.5L8 12l6.5 6.5"/>`; },
    close: function () { return html`<path d="M6 6l12 12M18 6L6 18"/>`; },
    edit: function () { return html`<path d="M16.5 4.2a2.4 2.4 0 013.4 3.4L8 19.5l-4.5 1 1-4.5L16.5 4.2zM14.5 6.2l3.4 3.4"/>`; },
    camera: function () { return html`<path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3a1 1 0 011 1V18a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5a1 1 0 011-1z"/><circle cx="12" cy="13.3" r="3.3"/>`; },
    image: function () { return html`<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="M4.5 17.5l4.7-4.7 3.3 3.3 2.7-2.7 4.3 4.3"/>`; },
    link: function () { return html`<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>`; },
    clock: function () { return html`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`; },
    gallery: function () { return html`<rect class="fillable" x="3.5" y="3.5" width="7" height="7" rx="2"/><rect class="fillable" x="13.5" y="3.5" width="7" height="7" rx="2"/><rect class="fillable" x="3.5" y="13.5" width="7" height="7" rx="2"/><rect class="fillable" x="13.5" y="13.5" width="7" height="7" rx="2"/>`; },
    recipes: function () { return html`<rect class="fillable" x="3.5" y="5" width="17" height="14.5" rx="2.5"/><path d="M3.5 9.5h17M7.5 13h6M7.5 16h9"/>`; },
    stats: function () { return html`<rect class="fillable" x="4" y="12" width="4" height="8" rx="1.2"/><rect class="fillable" x="10" y="5" width="4" height="15" rx="1.2"/><rect class="fillable" x="16" y="9" width="4" height="11" rx="1.2"/>`; },
    sort: function () { return html`<path d="M4 7h16M7 12h10M10 17h4"/>`; },
    flag: function () { return html`<path d="M5.5 21V4.5M5.5 4.5h11l-2.2 4 2.2 4h-11"/>`; },
    loaf: function () { return html`<path d="M5 19V11.5C3 10.5 2.5 7 5.5 5.5c3-2 10-2 13 0 3 1.5 2.5 5 .5 6V19a1 1 0 01-1 1H6a1 1 0 01-1-1z"/><path d="M9 7.5l1.5 2M12 7l1.5 2M15 7.5l1.5 2"/>`; }
  };

  function Icon(props) {
    var body = ICONS[props.name];
    return html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${body ? body() : null}</svg>`;
  }

  /** One star, filled to `fill` (0, 0.5 or 1). */
  function Star(props) {
    var w = props.fill >= 1 ? '100%' : props.fill > 0 ? '50%' : '0%';
    return html`<span class="star" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d=${STAR}/></svg>
      <span class="fill" style=${'width:' + w}><svg viewBox="0 0 24 24"><path d=${STAR}/></svg></span>
    </span>`;
  }
  function fillOf(v, n) { return v >= n ? 1 : v >= n - 0.5 ? 0.5 : 0; }
  function label(x) { return String(x).replace('.5', '½') + ' of 5'; }

  /** Ratings go in half stars. To pick one, tap the left half of a star for a half, the right for a whole. */
  function Stars(props) {
    var v = Math.round((U.num(props.value) || 0) * 2) / 2, five = [1, 2, 3, 4, 5];
    if (!props.onChange) {
      return html`<span class="stars" role="img" aria-label=${label(v)}>
        ${five.map(function (n) { return html`<${Star} key=${n} fill=${fillOf(v, n)}/>`; })}
      </span>`;
    }
    function pick(x) { props.onChange(x === v ? 0 : x); }
    return html`<span class="stars pick" role="group" aria-label=${props.label}>
      ${five.map(function (n) {
        return html`<span class="slot" key=${n}>
          <${Star} fill=${fillOf(v, n)}/>
          <button type="button" class="half l" aria-label=${label(n - 0.5)} aria-pressed=${v === n - 0.5} onClick=${function () { pick(n - 0.5); }}></button>
          <button type="button" class="half r" aria-label=${label(n)} aria-pressed=${v === n} onClick=${function () { pick(n); }}></button>
        </span>`;
      })}
    </span>`;
  }

  /** A name with its flag in front, when it has one. */
  function Named(props) {
    var e = U.flagEmoji(props.flag);
    return e ? html`<span class="flagged"><span class="fl" aria-hidden="true">${e}</span>${props.name}</span>` : props.name;
  }

  function Score(props) {
    if (props.value === null || props.value === undefined) return null;
    return html`<span class="score"><svg viewBox="0 0 24 24" aria-hidden="true"><path d=${STAR}/></svg>${U.fmtRating(props.value)}</span>`;
  }

  /** A stored photo, by asset id. */
  function Photo(props) {
    if (!props.id) return null;
    return html`<img src=${P.blobUrl(props.id)} alt="" loading="lazy" decoding="async"/>`;
  }

  /** An object URL for a Blob, released when the blob changes or the component goes away. */
  function useObjectUrl(blob) {
    var s = useState('');
    useEffect(function () {
      if (!blob) { s[1](''); return undefined; }
      var url = URL.createObjectURL(blob);
      s[1](url);
      return function () { URL.revokeObjectURL(url); };
    }, [blob]);
    return s[0];
  }
  function BlobImage(props) {
    var url = useObjectUrl(props.blob);
    return url ? html`<img src=${url} alt=""/>` : null;
  }

  function useStore() {
    var s = useState(LGT.store.getState());
    useEffect(function () { s[1](LGT.store.getState()); return LGT.store.subscribe(s[1]); }, []);
    return s[0];
  }

  function Sheet(props) {
    function close(e) { if (e.target === e.currentTarget) props.onClose(); }
    return html`<div class="dim" onClick=${close}>
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="grab"></div>
        ${props.title ? html`<h2 class="serif">${props.title}</h2>` : null}
        ${props.children}
      </div>
    </div>`;
  }

  function Confirm(props) {
    return html`<div class="dim center">
      <div class="dialog" role="alertdialog" aria-modal="true">
        <h2 class="serif">${props.title}</h2>
        <div class="cols">
          <button type="button" class="btn ghost" onClick=${props.onCancel}>Cancel</button>
          <button type="button" class="btn primary" onClick=${props.onConfirm}>${props.action}</button>
        </div>
      </div>
    </div>`;
  }

  /** Full-size look at a photo: a stored one (id) or one not yet saved (blob). */
  function Viewer(props) {
    return html`<div class="viewer" onClick=${props.onClose}>
      ${props.blob ? html`<${BlobImage} blob=${props.blob}/>` : html`<${Photo} id=${props.id}/>`}
      <button type="button" class="round" aria-label="Close" onClick=${props.onClose}><${Icon} name="close"/></button>
    </div>`;
  }

  /** A full-screen page with a title bar: back on the left, an optional action on the right. */
  function Screen(props) {
    return html`<div class="screen">
      <div class="bar"><div class="wrap">
        <button type="button" onClick=${props.onBack}>${props.backLabel || 'Cancel'}</button>
        <h2 class="serif">${props.title}</h2>
        ${props.onGo
          ? html`<button type="button" class="go" disabled=${!!props.goDisabled} onClick=${props.onGo}>${props.goLabel || 'Save'}</button>`
          : html`<span></span>`}
      </div></div>
      <div class="scroll"><div class="wrap">${props.children}</div></div>
    </div>`;
  }

  /** `list` with the item at `from` moved to `to`. */
  function moved(list, from, to) {
    var out = list.slice(), item = out.splice(from, 1)[0];
    out.splice(to, 0, item);
    return out;
  }

  /**
   * Reorder a list by dragging. With a mouse, drag; on a phone, hold an item a moment, then
   * drag, so a quick swipe still scrolls the page. The new order is reported once, on letting go.
   *   keys      the items' keys, in their saved order
   *   onCommit  called with the new order of keys
   * Returns { box, order, dragging, item(key) }: put `box` on the container as its ref, spread
   * `item(key)` on each item, and render in `order`.
   */
  function useDragOrder(keys, onCommit) {
    var ts = useState(null), temp = ts[0], setTemp = ts[1];
    var ds = useState(null), dragging = ds[0], setDragging = ds[1];
    var el = H.useRef(null), live = H.useRef({}), latest = H.useRef(null), box = H.useRef(null);
    var order = temp || keys;
    latest.current = { order: order, keys: keys, onCommit: onCommit };

    // Once the saved order catches up, stop showing the dragged one.
    var sig = keys.join('\n');
    useEffect(function () { setTemp(null); }, [sig]);

    // The container can come and go (a tab switched off and on), so listen on whichever is there.
    if (!box.current) {
      var block = function (e) { if (live.current.key) e.preventDefault(); };      // no scrolling while moving one
      var swallow = function (e) {                                                  // the click that ends a drag
        if (live.current.justDragged) { live.current.justDragged = false; e.stopPropagation(); e.preventDefault(); }
      };
      box.current = function (node) {
        if (el.current === node) return;
        if (el.current) { el.current.removeEventListener('touchmove', block); el.current.removeEventListener('click', swallow, true); }
        el.current = node;
        if (node) { node.addEventListener('touchmove', block, { passive: false }); node.addEventListener('click', swallow, true); }
      };
    }

    function start(key) {
      try { live.current.el.setPointerCapture(live.current.id); } catch (e) { /* already released */ }
      live.current.key = key;
      setDragging(key);
    }
    function end() {
      var L = live.current;
      clearTimeout(L.timer);
      live.current = { justDragged: !!L.key };
      setDragging(null);
      if (!L.key) return;
      var now = latest.current.order, was = latest.current.keys;
      if (now.join('\n') !== was.join('\n')) {
        latest.current.onCommit(now);
        setTimeout(function () { setTemp(null); }, 4000);   // in case the save never comes back
      } else setTemp(null);
    }
    function down(e, key) {
      if (e.button > 0 || e.target.closest('.x, input, select, textarea')) return;
      live.current = { x: e.clientX, y: e.clientY, pending: key, id: e.pointerId, el: e.currentTarget };
      if (e.pointerType !== 'mouse') {
        live.current.timer = setTimeout(function () { if (live.current.pending === key) start(key); }, 260);
      }
    }
    function move(e) {
      var L = live.current;
      if (!L.key) {
        if (!L.pending) return;
        var far = Math.abs(e.clientX - L.x) + Math.abs(e.clientY - L.y);
        if (e.pointerType === 'mouse' && far > 5) start(L.pending);
        else if (e.pointerType !== 'mouse' && far > 8) { clearTimeout(L.timer); L.pending = null; return; }
        else return;
      }
      if (!el.current) return;
      var items = el.current.querySelectorAll('[data-drag]'), list = latest.current.order;
      for (var n = 0; n < items.length; n++) {
        var r = items[n].getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          var to = list.indexOf(items[n].getAttribute('data-drag')), from = list.indexOf(live.current.key);
          if (to >= 0 && from >= 0 && to !== from) {
            var next = moved(list, from, to);
            latest.current.order = next;
            setTemp(next);
          }
          break;
        }
      }
    }
    function item(key) {
      return {
        'data-drag': key,
        onPointerDown: function (e) { down(e, key); }, onPointerMove: move,
        onPointerUp: end, onPointerCancel: end,
        onContextMenu: function (e) { e.preventDefault(); }
      };
    }
    return { box: box.current, order: order, dragging: dragging, item: item };
  }

  LGT.ui = {
    moved: moved, useDragOrder: useDragOrder, Icon: Icon, Stars: Stars, Named: Named, Score: Score, Photo: Photo, BlobImage: BlobImage,
    useObjectUrl: useObjectUrl, useStore: useStore,
    Sheet: Sheet, Confirm: Confirm, Viewer: Viewer, Screen: Screen
  };
})(typeof window !== 'undefined' ? window : globalThis);
