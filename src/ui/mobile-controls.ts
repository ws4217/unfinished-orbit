import ui from '../content/text/ui.json' with { type: 'json' };
import type { App } from '../game/app.ts';

export const isPhone = () => {
  const ua = navigator.userAgent;
  if (/iPhone|iPod|iPad|Android|Windows Phone|Mobile.+Firefox|HarmonyOS/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return matchMedia('(pointer: coarse) and (hover: none)').matches;
};

/** A held stick is one held direction. Changing sector releases the previous key first. */
export function installMobileControls(app: App): void {
  if (!isPhone()) return;
  document.body.classList.add('phone');
  const stage = document.getElementById('app')!;
  const controls = document.createElement('div');
  controls.className = 'touch-controls';
  const stick = document.createElement('div');
  stick.className = 'touch-stick'; stick.setAttribute('aria-label', ui.mobile.stick);
  const thumb = document.createElement('span'); stick.append(thumb);
  controls.append(stick);
  const button = (key: keyof typeof ui.mobile.keys) => {
    const el = document.createElement('button');
    el.type = 'button'; el.className = `touch-button touch-key touch-${key}`;
    el.textContent = ui.mobile.keys[key]; controls.append(el); return el;
  };
  const z = button('z'), x = button('x');
  document.body.append(controls);
  let stickId: number | undefined, held = '';
  let zId: number | undefined;
  let xId: number | undefined, timer: number | undefined, long = false;
  const direction = (key: string) => {
    if (key === held) return;
    if (held) app.releaseKey(held);
    held = key;
    if (held) app.pressKey(held);
  };
  const move = (event: PointerEvent) => {
    if (stickId !== event.pointerId) return;
    const rect = stick.getBoundingClientRect(), radius = rect.width / 2;
    const dx = event.clientX - rect.left - radius, dy = event.clientY - rect.top - radius;
    const length = Math.hypot(dx, dy);
    const scale = length ? Math.min(1, (radius - thumb.offsetWidth / 2) / length) : 0;
    thumb.style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
    direction(length <= radius * .3 ? '' : Math.abs(dx) > Math.abs(dy)
      ? dx < 0 ? 'ArrowLeft' : 'ArrowRight' : dy < 0 ? 'ArrowUp' : 'ArrowDown');
  };
  const dropStick = () => { direction(''); stickId = undefined; thumb.style.transform = ''; };
  const dropX = () => { clearTimeout(timer); xId = undefined; long = false; };
  stick.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (stickId !== undefined) return;
    stickId = event.pointerId; stick.setPointerCapture(stickId); move(event);
  });
  stick.addEventListener('pointermove', move);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    stick.addEventListener(type, e => { if (stickId === e.pointerId) dropStick(); });
  }
  // Do not steal focus from an active menu choice or the native token input.
  z.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (zId === undefined) { zId = e.pointerId; z.setPointerCapture(zId); }
  });
  z.addEventListener('pointerup', e => {
    if (zId !== e.pointerId) return;
    zId = undefined;
    app.pressKey('Enter');
  });
  for (const type of ['pointercancel', 'lostpointercapture'] as const)
    z.addEventListener(type, e => { if (zId === e.pointerId) zId = undefined; });
  x.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (xId !== undefined) return;
    xId = e.pointerId; x.setPointerCapture(xId);
    if (stage.dataset.view === 'dialogue') timer = window.setTimeout(() => {
      long = true;
      if (stage.dataset.view === 'dialogue') app.pressKey('Escape');
    }, 550);
  });
  x.addEventListener('pointerup', e => {
    if (xId !== e.pointerId) return;
    const short = !long; dropX(); if (short) app.pressKey('x');
  });
  for (const type of ['pointercancel', 'lostpointercapture'] as const)
    x.addEventListener(type, e => { if (xId === e.pointerId) dropX(); });
  controls.addEventListener('contextmenu', event => event.preventDefault());
  const reset = () => { dropStick(); dropX(); zId = undefined; };
  matchMedia('(orientation: portrait)').addEventListener('change', reset);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
}
