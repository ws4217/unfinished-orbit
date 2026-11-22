import data from '../content/text/world-entry.json';
import { fillText, type BootLine } from '../content/text/line.ts';
import { FIRST_CYCLE, NEXT_CYCLE, futureCycles } from '../core/cycle.ts';

export type WorldEntryMode = 'init' | 'success' | 'fail' | 'montage';

const WIDTH = 960;
const HEIGHT = 540;
const PIXEL = 12;
const MONTAGE_BLACK_MS = 300;

/** 剧情启动记录，不代表网络进度。遮罩关闭后换底图，再展开到真实房间。 */
export function playWorldEntry(parent: HTMLElement, mode: WorldEntryMode,
  onLine: (warning: boolean) => void, done: () => void, beforeReveal?: () => void): () => void {
  const overlay = document.createElement('section');
  overlay.className = 'world-entry';
  overlay.dataset.mode = mode;
  overlay.tabIndex = -1;
  overlay.setAttribute('aria-label', data.label);
  const terminal = document.createElement('div');
  terminal.className = 'world-entry-terminal';
  const title = document.createElement('h2');
  title.textContent = data.title;
  const counter = document.createElement('p');
  counter.className = 'world-entry-counter';
  const viewport = document.createElement('div');
  viewport.className = 'world-entry-record';
  viewport.setAttribute('role', 'log');
  viewport.setAttribute('aria-live', 'polite');
  viewport.setAttribute('aria-label', data.label);
  terminal.append(title, counter, viewport);
  const iris = document.createElement('canvas');
  iris.className = 'world-entry-iris';
  iris.width = WIDTH;
  iris.height = HEIGHT;
  iris.hidden = true;
  iris.setAttribute('aria-hidden', 'true');
  overlay.append(terminal, iris);
  parent.append(overlay);
  overlay.focus({ preventScroll: true });
  const context = iris.getContext('2d');
  const fullRadius = WIDTH / 2 + PIXEL * 4;
  let shown = 0;
  let elapsed = 0;
  let lastLineAt = -Infinity;
  let lastTime: number | undefined;
  let frame = 0;
  let stopped = false;
  const { recordMs, closeMs, closedMs, openMs, lineIntervalMs } = data.timing;
  const fadeMs = 1200;
  const blackMs = 450;
  const montage = mode === 'montage';
  const records = (montage ? futureCycles() : [mode === 'init' ? FIRST_CYCLE : NEXT_CYCLE]).map((id, index) => {
    const lines: BootLine[] = data.lines[montage ? 'fail' : mode].map(entry => fillText(entry, { id: String(id) }));
    if (mode !== 'init') lines.unshift(
      data.transition.reset,
      mode === 'success' ? data.transition.retain : data.transition.restore,
    );
    return { id, lines, interval: montage ? [115, 85, 60, 40, 26][index] : lineIntervalMs,
      hold: montage ? [400, 300, 220, 150, 95][index] : 450 };
  });
  let recordIndex = 0;
  let stage: 'fade' | 'black' | 'record' | 'gap' | 'closing' | 'closed' | 'reveal' = mode === 'init' ? 'record' : 'fade';
  const mark = (next: typeof stage) => {
    stage = next;
    overlay.dataset.stage = next;
    elapsed = 0;
  };
  const showRecord = () => {
    mark('record');
    const { id } = records[recordIndex];
    overlay.dataset.cycleId = String(id);
    overlay.style.opacity = '';
    counter.textContent = data.counter.replace('{id}', String(id));
    terminal.hidden = false;
    viewport.replaceChildren();
    shown = 0;
    lastLineAt = -Infinity;
  };
  if (mode === 'init') showRecord();
  else {
    mark('fade');
    terminal.hidden = true;
    overlay.style.opacity = '0';
  }

  const aperture = (radius: number) => {
    if (!context) return;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = '#030810';
    // 每行按整格描边，拐角用三阶像素切角；不缩放房间、不采样美术。
    for (let y = 0; y < HEIGHT; y += PIXEL) {
      const distance = Math.abs(y + PIXEL / 2 - HEIGHT / 2);
      if (distance >= radius) {
        context.fillRect(0, y, WIDTH, PIXEL);
        continue;
      }
      const corner = Math.max(0, Math.ceil((distance - radius + PIXEL * 3) / PIXEL));
      const halfWidth = Math.max(0, radius - corner * PIXEL);
      const left = Math.max(0, Math.min(WIDTH, Math.floor((WIDTH / 2 - halfWidth) / PIXEL) * PIXEL));
      const right = Math.max(0, Math.min(WIDTH, Math.ceil((WIDTH / 2 + halfWidth) / PIXEL) * PIXEL));
      context.fillRect(0, y, left, PIXEL);
      context.fillRect(right, y, WIDTH - right, PIXEL);
    }
  };
  const cancel = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    overlay.remove();
  };
  const tick = (now: number) => {
    if (stopped || !overlay.isConnected) { cancel(); return; }
    // 切回标签页不直接跨过提示与全部动画；仅控制本演出，不暂停或重启BGM。
    if (lastTime !== undefined && !document.hidden) elapsed += Math.min(now - lastTime, 100);
    lastTime = now;
    if (document.hidden) { frame = requestAnimationFrame(tick); return; }
    if (stage === 'fade') {
      overlay.style.opacity = String(Math.min(1, elapsed / fadeMs));
      if (elapsed >= fadeMs) mark('black');
    } else if (stage === 'black') {
      if (elapsed >= blackMs) showRecord();
    } else if (stage === 'record') {
      const record = records[recordIndex];
      if (shown < record.lines.length && elapsed - lastLineAt >= record.interval) {
        const entry = record.lines[shown++];
        const line = document.createElement('p');
        line.dataset.lineId = entry.id;
        line.className = entry.warning ? 'world-entry-warning' : '';
        line.textContent = entry.text;
        viewport.append(line);
        viewport.scrollTop = viewport.scrollHeight;
        lastLineAt = elapsed;
        onLine(entry.warning);
      }
      if (shown === record.lines.length && elapsed >= Math.max(montage ? 0 : recordMs, lastLineAt + record.hold)) {
        if (montage) { terminal.hidden = true; mark('gap'); }
        else { iris.hidden = false; mark('closing'); }
      }
    } else if (stage === 'gap') {
      if (elapsed >= MONTAGE_BLACK_MS) {
        if (++recordIndex < records.length) showRecord();
        else { cancel(); done(); return; }
      }
    } else if (stage === 'closing') {
      aperture(fullRadius * (1 - Math.min(1, elapsed / closeMs)));
      if (elapsed >= closeMs) { terminal.hidden = true; mark('closed'); }
    } else if (stage === 'closed') {
      if (elapsed >= closedMs) {
        beforeReveal?.();
        overlay.classList.add('world-entry-revealing');
        if (!context) overlay.style.background = '#030810';
        mark('reveal');
      }
    } else if (stage === 'reveal') {
      const opening = Math.min(1, elapsed / openMs);
      aperture(fullRadius * opening);
      if (!context) overlay.style.opacity = String(1 - opening);
      if (opening === 1) { cancel(); done(); return; }
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return cancel;
}
