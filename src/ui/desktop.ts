import type { App } from '../game/app.ts';
import ui from '../content/text/ui.json' with { type: 'json' };
import { aligned, toLogical } from '../core/geometry.ts';
import ending from '../content/text/ending.json';
import { tokenReady } from '../core/ending.ts';
import { portalOpen } from '../core/cycle.ts';
import cycleText from '../content/text/cycle.json';
import { playMaintenanceRoute } from './maintenance-route.ts';

const { desktop: data, maintenanceRoute: routeText } = ui;

const make = (tag: string, text?: string, className?: string) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
};
export function installDesktop(app: App): void {
  const shell = document.getElementById('desktop-shell')!;
  const content = document.getElementById('game-content')!;
  const stage = document.getElementById('app')!;
  let closeExplained = false;
  let located = false;
  let desktop = false;
  const oldHints = app.hintProvider;
  app.hintProvider = (hintStage, level) => ['calibration', 'route'].includes(hintStage)
    ? [{ speaker: 'pruto', text: level === 3 ? routeText.hint : data.hint[level - 1] }] : oldHints!(hintStage, level);
  const leave = () => {
    if (!desktop) return;
    desktop = false;
    stage.append(content);
    content.style.cssText = '';
    shell.hidden = true; shell.replaceChildren();
  };
  app.leaveDesktop = leave;
  const finish = () => {
    leave();
    delete app.state.cycle;
    app.state.entranceFound = true;
    app.state.phase = 'stable';
    app.session.save();
    app.scene.drawWorld(true);
    app.world();
  };
  const show = () => {
    desktop = true;
    located = false;
    // A rejected exit request must not block the fictional desktop.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    shell.replaceChildren(); shell.hidden = false;
    shell.append(make('p', 'UNFINISHED ORBIT', 'desktop-watermark'));
    const gameWindow = make('section', undefined, 'desktop-game');
    gameWindow.id = 'game-window';
    const gameBar = make('header', undefined, 'titlebar');
    gameBar.append(make('span', data.game));
    const controls = make('div', undefined, 'window-buttons');
    app.actionButton('—', () => { gameWindow.hidden = true; }, controls).setAttribute('aria-label', data.minimize);
    let big = false;
    const size = () => {
      const scale = big ? 0.85 : 0.7;
      const width = 960 * scale;
      gameWindow.style.cssText = `width:${width + 4}px;height:${540 * scale + 34}px;left:${(960 - width) / 2}px;top:${big ? 8 : 42}px`;
      content.style.cssText = `position:absolute;left:2px;top:32px;transform:scale(${scale});transform-origin:top left;`;
    };
    app.actionButton('□', () => { big = !big; size(); }, controls).setAttribute('aria-label', data.maximize);
    app.actionButton('×', () => {
      if (closeExplained) { gameWindow.hidden = true; return; }
      closeExplained = true;
      app.choice(data.closeExplanation, [{ label: data.okay, action: () => { app.showTitle(); gameWindow.hidden = true; } }], () => app.showTitle());
    }, controls).setAttribute('aria-label', data.close);
    gameBar.append(controls); gameWindow.append(gameBar, content); shell.append(gameWindow); size();
    const target = document.getElementById('entry-target')!;
    const cardWindow = make('section', undefined, 'desktop-card'); cardWindow.id = 'card-window';
    cardWindow.hidden = true;
    const cardBar = make('header', undefined, 'titlebar card-drag-handle');
    cardBar.append(make('span', data.card));
    app.actionButton('×', () => { cardWindow.hidden = true; }, cardBar).setAttribute('aria-label', data.close);
    const frame = document.createElement('iframe');
    frame.src = './tool.html?embedded=1'; frame.title = data.card; frame.className = 'card-frame';
    const help = make('p', `${cycleText.cardMind} ${data.cardHelp}`, 'card-help');
    const cardActions = make('div', undefined, 'card-actions');
    const reset = () => { cardWindow.style.left = '30px'; cardWindow.style.top = '100px'; };
    app.actionButton(data.reset, reset, cardActions);
    const enter = app.actionButton(data.path, () => {
      if (!located) return;
      gameWindow.hidden = false;
      cardWindow.hidden = true;
      playMaintenanceRoute(app, stage, shell, finish, () => { leave(); app.showTitle(); });
    }, cardActions);
    enter.hidden = true;
    const check = () => {
      if (!desktop || !frame.contentDocument || gameWindow.hidden) return;
      const marker = frame.contentDocument.querySelector('.calibration-mark');
      if (!marker) return;
      const frameRect = frame.getBoundingClientRect();
      const markerRect = marker.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const bounds = stage.getBoundingClientRect();
      const scale = bounds.width / 960;
      const cardPoint = toLogical({
        x: frameRect.left + (markerRect.left + markerRect.width / 2) * scale,
        y: frameRect.top + (markerRect.top + markerRect.height / 2) * scale,
      }, bounds);
      const targetPoint = toLogical({ x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 }, bounds);
      if (aligned(cardPoint, targetPoint)) {
        if (!located) app.audio.event('sfx.result.elevated');
        located = true;
        help.textContent = routeText.aligned;
        enter.hidden = false;
        cardWindow.dataset.aligned = 'true';
      }
    };
    let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;
    cardBar.addEventListener('pointerdown', event => {
      if ((event.target as HTMLElement).closest('button')) return;
      const point = toLogical({ x: event.clientX, y: event.clientY }, stage.getBoundingClientRect());
      drag = { id: event.pointerId, x: point.x, y: point.y, left: parseFloat(cardWindow.style.left), top: parseFloat(cardWindow.style.top) };
      cardBar.setPointerCapture(event.pointerId);
      cardWindow.style.zIndex = '4';
      event.preventDefault();
    });
    cardBar.addEventListener('pointermove', event => {
      if (!drag) return;
      const point = toLogical({ x: event.clientX, y: event.clientY }, stage.getBoundingClientRect());
      cardWindow.style.left = `${Math.max(0, Math.min(610, drag.left + point.x - drag.x))}px`;
      cardWindow.style.top = `${Math.max(0, Math.min(180, drag.top + point.y - drag.y))}px`;
    });
    const end = () => { if (drag) { drag = null; check(); } };
    cardBar.addEventListener('pointerup', end);
    cardBar.addEventListener('lostpointercapture', end);
    window.addEventListener('blur', end, { once: true });
    cardWindow.addEventListener('pointerdown', () => { cardWindow.style.zIndex = '4'; });
    gameWindow.addEventListener('pointerdown', () => { cardWindow.style.zIndex = '2'; });
    cardWindow.append(cardBar, frame, help, cardActions); shell.append(cardWindow); reset();
    const taskbar = make('nav', undefined, 'taskbar');
    app.actionButton(data.game, () => { gameWindow.hidden = false; }, taskbar);
    app.actionButton(data.card, () => { cardWindow.hidden = false; cardWindow.style.zIndex = '4'; }, taskbar);
    shell.append(taskbar);
  };
  app.titleProvider = () => {
    if (app.state.entranceFound) return [{ label: data.shortcut, action: () => { app.scene.drawWorld(true); app.world(); } }];
    if (portalOpen(app.state) && !desktop) return [{ label: data.exit, action: () => { if (!desktop) show(); } }];
    return [];
  };
}

export function openTool(app: App): void {
  app.puzzle(data.tool, container => {
    if (tokenReady(app.state)) {
      const token = document.createElement('code'); token.textContent = ending.ui.tokenValue; token.className = 'token-value';
      const feedback = document.createElement('p'); feedback.setAttribute('role', 'status');
      container.append(token);
      app.actionButton(ending.ui.copy, () => {
        void (async () => {
          try { await navigator.clipboard.writeText(ending.ui.tokenValue); feedback.textContent = ending.ui.copied; }
          catch { feedback.textContent = ending.ui.manualCopy; }
        })();
      }, container);
      container.append(feedback);
    }
    const frame = document.createElement('iframe');
    frame.src = './tool.html'; frame.title = data.tool; frame.className = 'record-tool';
    const link = document.createElement('a');
    link.href = './tool.html'; link.target = '_blank'; link.rel = 'noopener'; link.textContent = data.independent;
    container.append(frame, link);
    app.actionButton(data.return, () => app.world(), container);
  }, key => { if (key === 'Shift' || key === 'x') app.world(); });
}
