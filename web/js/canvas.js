// Infinite canvas: the rendered SVG sits in a world layer whose origin is the
// diagram's center, so the diagram grows around the middle of the screen.
// Pan with drag / two-finger scroll, zoom with pinch or ⌘ + scroll.
(function (g) {
  const SD = (g.SD = g.SD || {});

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 4;
  const FIT_MAX_ZOOM = 1;
  const GRID = 22;

  const view = { x: 0, y: 0, k: 1 };
  let el;
  let world;
  let content = { width: 0, height: 0 };
  let following = true; // re-fit after changes until the user moves the view
  let anim = null;
  const listeners = { change: [], click: [] };

  function emit(type, arg) {
    listeners[type].forEach((fn) => fn(arg));
  }

  function apply() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
    let step = GRID * view.k;
    while (step < 11) step *= 2;
    el.style.backgroundSize = `${step}px ${step}px`;
    el.style.backgroundPosition = `${view.x}px ${view.y}px`;
    emit('change', view);
  }

  function stopAnim() {
    if (anim) cancelAnimationFrame(anim);
    anim = null;
  }

  function animateTo(target, duration) {
    stopAnim();
    const from = { x: view.x, y: view.y, k: view.k };
    const d = duration || 280;
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / d);
      const e = ease(t);
      view.x = from.x + (target.x - from.x) * e;
      view.y = from.y + (target.y - from.y) * e;
      view.k = from.k + (target.k - from.k) * e;
      apply();
      anim = t < 1 ? requestAnimationFrame(tick) : null;
    };
    anim = requestAnimationFrame(tick);
  }

  // The part of the window not covered by floating panels.
  function viewport() {
    const r = el.getBoundingClientRect();
    const pad = 20;
    let left = r.left + pad;
    let right = r.right - pad;
    let top = r.top + pad;
    let bottom = r.bottom - pad;
    const side = document.getElementById('sidebar');
    if (side && !side.hidden) left = Math.max(left, side.getBoundingClientRect().right + pad);
    const insp = document.getElementById('inspector');
    if (insp && !insp.hidden) right = Math.min(right, insp.getBoundingClientRect().left - pad);
    const bar = document.getElementById('topbar');
    if (bar) top = Math.max(top, bar.getBoundingClientRect().bottom + 8);
    const ai = document.getElementById('ai');
    if (ai) bottom = Math.min(bottom, ai.getBoundingClientRect().top - 8);
    if (right - left < 120) {
      left = r.left + pad;
      right = r.right - pad;
    }
    if (bottom - top < 120) {
      top = r.top + pad;
      bottom = r.bottom - pad;
    }
    return { left, right, top, bottom, width: right - left, height: bottom - top, cx: (left + right) / 2 - r.left, cy: (top + bottom) / 2 - r.top };
  }

  function fitTarget() {
    const vp = viewport();
    const w = Math.max(content.width, 1);
    const hgt = Math.max(content.height, 1);
    const k = Math.max(MIN_ZOOM, Math.min(FIT_MAX_ZOOM, vp.width / w, vp.height / hgt));
    return { x: vp.cx, y: vp.cy, k };
  }

  function fit(opts) {
    following = true;
    const t = fitTarget();
    if (opts && opts.animate === false) {
      stopAnim();
      Object.assign(view, t);
      apply();
    } else animateTo(t);
  }

  function setContent(svg, size) {
    const old = world.querySelector('svg');
    svg.style.position = 'absolute';
    svg.style.left = -size.width / 2 + 'px';
    svg.style.top = -size.height / 2 + 'px';
    if (old) old.replaceWith(svg);
    else world.appendChild(svg);
    content = { width: size.width, height: size.height };
  }

  // After a re-render: keep following the default view, otherwise make sure
  // the given element (e.g. the component just added) is on screen.
  function afterRender(focusEl, opts) {
    if (following || (opts && opts.fit)) {
      fit({ animate: !(opts && opts.instant) });
      return;
    }
    if (focusEl) ensureVisible(focusEl.getBoundingClientRect());
    apply();
  }

  function ensureVisible(rect) {
    const vp = viewport();
    let dx = 0;
    let dy = 0;
    if (rect.left < vp.left) dx = vp.left - rect.left + 24;
    else if (rect.right > vp.right) dx = vp.right - rect.right - 24;
    if (rect.top < vp.top) dy = vp.top - rect.top + 24;
    else if (rect.bottom > vp.bottom) dy = vp.bottom - rect.bottom - 24;
    if (dx || dy) animateTo({ x: view.x + dx, y: view.y + dy, k: view.k }, 240);
  }

  function zoomAt(factor, px, py) {
    stopAnim();
    following = false;
    const r = el.getBoundingClientRect();
    const cx = px === undefined ? r.width / 2 : px - r.left;
    const cy = py === undefined ? r.height / 2 : py - r.top;
    const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.k * factor));
    const f = k / view.k;
    view.x = cx - (cx - view.x) * f;
    view.y = cy - (cy - view.y) * f;
    view.k = k;
    apply();
  }

  function zoomStep(dir) {
    const levels = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4];
    const cur = view.k;
    const next = dir > 0 ? levels.find((l) => l > cur + 0.001) || MAX_ZOOM : [...levels].reverse().find((l) => l < cur - 0.001) || MIN_ZOOM;
    const vp = viewport();
    following = false;
    const f = next / cur;
    animateTo({ x: vp.cx - (vp.cx - view.x) * f, y: vp.cy - (vp.cy - view.y) * f, k: next }, 180);
  }

  function panBy(dx, dy) {
    stopAnim();
    following = false;
    view.x += dx;
    view.y += dy;
    apply();
  }

  function init(canvasEl) {
    el = canvasEl;
    world = el.querySelector('#world');
    const r = el.getBoundingClientRect();
    view.x = r.width / 2;
    view.y = r.height / 2;
    apply();

    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.target.closest('#overlay button, .popover')) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, target: e.target, shift: e.shiftKey, meta: e.metaKey || e.ctrlKey };
      el.focus({ preventScroll: true });
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) {
        drag.moved = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add('panning');
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
      panBy(dx, dy);
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      el.classList.remove('panning');
      if (!d.moved) emit('click', { target: d.target, shift: d.shift, meta: d.meta, x: e.clientX, y: e.clientY, detail: e.detail });
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', (e) => {
      drag = null;
      el.classList.remove('panning');
      void e;
    });

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        if (e.ctrlKey || e.metaKey) {
          zoomAt(Math.exp(-e.deltaY * unit * 0.0075), e.clientX, e.clientY);
        } else {
          panBy(-e.deltaX * unit, -e.deltaY * unit);
        }
      },
      { passive: false }
    );

    // WebKit trackpad pinch
    let gestureStart = null;
    el.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      gestureStart = { k: view.k, x: e.clientX, y: e.clientY };
    });
    el.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (!gestureStart) return;
      zoomAt((gestureStart.k * e.scale) / view.k, gestureStart.x, gestureStart.y);
    });
    el.addEventListener('gestureend', (e) => {
      e.preventDefault();
      gestureStart = null;
    });

    let resizeTimer = null;
    g.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (following) fit({ animate: false });
        else apply();
      }, 60);
    });
  }

  SD.canvas = {
    init,
    view,
    setContent,
    afterRender,
    fit,
    zoomStep,
    zoomAt,
    panBy,
    ensureVisible,
    viewport,
    isFollowing: () => following,
    on(type, fn) {
      listeners[type].push(fn);
    },
  };
})(globalThis);
