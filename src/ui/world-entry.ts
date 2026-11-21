import data from '../content/text/world-entry.json';

const WIDTH = 960;
const HEIGHT = 540;
const PIXEL = 12;

/** 剧情启动记录，不代表网络进度。遮罩关闭后换底图，再展开到真实房间。 */
export function playWorldEntry(parent: HTMLElement, done: () => void): () => void {
  const overlay = document.createElement('section');
  overlay.className = 'world-entry';
  overlay.tabIndex = -1;
  overlay.setAttribute('aria-label', data.label);
  const terminal = document.createElement('div');
  terminal.className = 'world-entry-terminal';
  const title = document.createElement('h2');
  title.textContent = data.title;
  const viewport = document.createElement('div');
  viewport.className = 'world-entry-record';
  viewport.setAttribute('role', 'log');
  viewport.setAttribute('aria-live', 'polite');
  viewport.setAttribute('aria-label', data.label);
  terminal.append(title, viewport);
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
  let lastTime: number | undefined;
  let frame = 0;
  let stopped = false;
  let revealed = false;
  const { recordMs, closeMs, closedMs, openMs, lineIntervalMs } = data.timing;

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
    while (shown < data.lines.length && shown * lineIntervalMs <= Math.min(elapsed, recordMs)) {
      const entry = data.lines[shown++];
      const line = document.createElement('p');
      line.dataset.lineId = entry.id;
      line.className = entry.warning ? 'world-entry-warning' : '';
      line.textContent = entry.text;
      viewport.append(line);
      viewport.scrollTop = viewport.scrollHeight;
    }
    if (elapsed >= recordMs) {
      iris.hidden = false;
      const closing = Math.min(1, (elapsed - recordMs) / closeMs);
      aperture(fullRadius * (1 - closing));
    }
    const revealAt = recordMs + closeMs + closedMs;
    if (elapsed >= revealAt) {
      if (!revealed) {
        revealed = true;
        terminal.remove();
        overlay.classList.add('world-entry-revealing');
        if (!context) overlay.style.background = '#030810';
      }
      const opening = Math.min(1, (elapsed - revealAt) / openMs);
      aperture(fullRadius * opening);
      // 2D上下文不可用时仍可结束演出，不让玩家卡在黑屏。
      if (!context) overlay.style.opacity = String(1 - opening);
    }
    if (elapsed >= revealAt + openMs) {
      cancel();
      done();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return cancel;
}
