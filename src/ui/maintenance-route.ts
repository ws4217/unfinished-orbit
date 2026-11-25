import { MaintenanceRoute, type Direction, type RouteEvent } from '../core/maintenance-route.ts';
import ui from '../content/text/ui.json' with { type: 'json' };
import type { App } from '../game/app.ts';
import { isPhone } from './mobile-controls.ts';

const data = ui.maintenanceRoute;

const keys: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};
const glyph = data.arrows;
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => {
  const element = document.createElement(tag); element.className = cls; return element;
};

export function playMaintenanceRoute(app: App, stage: HTMLElement, desktop: HTMLElement,
  done: () => void, back: () => void): void {
  const model = new MaintenanceRoute();
  const events = new AbortController();
  const options = { capture: true, signal: events.signal };
  const overlay = make('section', 'maintenance-route');
  overlay.tabIndex = -1;
  overlay.setAttribute('aria-label', data.title);
  const title = make('h2', 'route-title'); title.textContent = data.title;
  const meter = make('div', 'route-meter');
  const fill = make('div', 'route-fill');
  const clock = make('span', 'route-clock'); meter.append(fill, clock);
  const rows = make('div', 'route-rows');
  const progress = make('p', 'route-progress');
  const feedback = make('p', 'route-feedback'); feedback.setAttribute('role', 'status');
  const phone = isPhone();
  const pad = phone ? make('div', 'route-pad') : undefined;
  const portrait = matchMedia('(orientation: portrait)');
  const help = make('p', 'route-help'); help.textContent = phone ? ui.mobile.route : data.help;
  const exit = app.actionButton(data.leave, () => { close(); back(); }, overlay);
  overlay.prepend(title, meter, progress, rows, feedback, help);
  stage.append(overlay); desktop.inert = true;
  overlay.focus();
  let frame = 0;
  let focused = document.hasFocus();
  let pausedAt: number | undefined;
  let pausedTime = 0;
  const syncPause = () => {
    const now = performance.now();
    if (!focused || document.hidden || (phone && portrait.matches)) pausedAt ??= now;
    else if (pausedAt !== undefined) { pausedTime += now - pausedAt; pausedAt = undefined; }
  };
  const time = () => (pausedAt ?? performance.now()) - pausedTime;
  const close = () => {
    events.abort(); cancelAnimationFrame(frame); overlay.remove(); pad?.remove(); desktop.inert = false;
  };
  const paintRows = () => {
    progress.textContent = data.progress.replace('{done}', String(model.row));
    rows.replaceChildren(...model.rows.map((sequence, index) => {
      const row = make('div', 'route-row');
      row.dataset.state = index < model.row ? 'done' : index === model.row ? 'active' : 'waiting';
      for (const [i, direction] of sequence.entries()) {
        const arrow = make('span', 'route-arrow');
        arrow.dataset.key = direction;
        arrow.dataset.state = index === model.row && i < model.cursor ? 'correct'
          : index === model.row && i === model.cursor ? 'current' : 'waiting';
        arrow.textContent = glyph[direction]; row.append(arrow);
      }
      return row;
    }));
  };
  const paintClock = () => {
    const ms = model.remaining(time());
    const ratio = ms / model.limit;
    meter.dataset.tone = ratio > 0.55 ? 'green' : ratio > 0.25 ? 'yellow' : 'red';
    fill.style.transform = `scaleX(${ratio})`;
    clock.textContent = pausedAt !== undefined ? data.paused : data.clock.replace('{seconds}', (Math.ceil(ms / 100) / 10).toFixed(1));
  };
  const apply = (result: RouteEvent | undefined) => {
    if (!result) return;
    feedback.textContent = result === 'wrong' ? data.wrong : result === 'timeout' ? data.timeout : '';
    if (result === 'complete' || result === 'row') app.audio.retrigger('sfx.result.elevated');
    else if (result === 'wrong' || result === 'timeout') app.audio.retrigger('sfx.error.input');
    else app.audio.event('sfx.button.mechanical');
    if (result === 'complete') { close(); done(); return; }
    paintRows(); paintClock();
  };
  window.addEventListener('blur', () => { focused = false; syncPause(); paintClock(); }, options);
  window.addEventListener('focus', () => { focused = true; syncPause(); paintClock(); }, options);
  document.addEventListener('visibilitychange', () => { syncPause(); paintClock(); }, options);
  if (pad) {
    portrait.addEventListener('change', () => { syncPause(); paintClock(); }, options);
    pad.setAttribute('role', 'group');
    pad.setAttribute('aria-label', ui.mobile.route);
    for (const direction of ['up', 'left', 'down', 'right'] as const) {
      const button = make('button', 'route-key');
      button.textContent = glyph[direction]; button.dataset.direction = direction;
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        if (pausedAt === undefined) apply(model.press(direction, time()));
      });
      pad.append(button);
    }
    document.body.append(pad);
  }
  window.addEventListener('keydown', event => {
    // 保留浏览器快捷键；其余输入不穿透到标题、日志或原桌面。
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    event.stopImmediatePropagation();
    if (event.key === 'Tab' || ((event.key === 'Enter' || event.key === ' ') && document.activeElement === exit)) return;
    event.preventDefault();
    if (event.repeat) return;
    if (['Escape', 'x', 'X'].includes(event.key)) { close(); back(); return; }
    const direction = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (direction && pausedAt === undefined) apply(model.press(direction, time()));
  }, options);
  const tick = () => {
    if (pausedAt === undefined) apply(model.tick(time()));
    paintClock();
    frame = requestAnimationFrame(tick);
  };
  syncPause(); paintRows(); paintClock(); frame = requestAnimationFrame(tick);
}
