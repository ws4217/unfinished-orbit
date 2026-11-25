import type { App } from '../game/app.ts';
import ui from '../content/text/ui.json' with { type: 'json' };
import { aligned, draggedWindow, toLogical, type Point } from '../core/geometry.ts';
import ending from '../content/text/ending.json' with { type: 'json' };
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
function enableDrag(bar: HTMLElement, panel: HTMLElement, stage: HTMLElement, signal: AbortSignal, done: () => void): void {
  let drag: { id: number; start: Point; origin: Point } | undefined;
  const point = (e: PointerEvent) => toLogical({ x: e.clientX, y: e.clientY }, stage.getBoundingClientRect());
  bar.addEventListener('pointerdown', e => {
    if (drag || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    drag = { id: e.pointerId, start: point(e), origin: { x: panel.offsetLeft, y: panel.offsetTop } };
    bar.setPointerCapture(e.pointerId); e.preventDefault();
  });
  bar.addEventListener('pointermove', e => {
    if (drag?.id !== e.pointerId) return;
    const pos = draggedWindow(drag.origin, drag.start, point(e), {
      x: stage.clientWidth - panel.offsetWidth, y: stage.clientHeight - 32 - panel.offsetHeight,
    });
    panel.style.left = `${pos.x}px`; panel.style.top = `${pos.y}px`;
  });
  bar.addEventListener('pointerup', e => { if (drag?.id === e.pointerId) { drag = undefined; done(); } });
  bar.addEventListener('lostpointercapture', e => { if (drag?.id === e.pointerId) drag = undefined; });
  window.addEventListener('blur', () => { drag = undefined; }, { signal });
}

export function installDesktop(app: App): void {
  const shell = document.getElementById('desktop-shell')!;
  const content = document.getElementById('game-content')!;
  const stage = document.getElementById('app')!;
  let events: AbortController;
  let located = false;
  let desktop = false;
  const oldHints = app.hintProvider;
  app.hintProvider = (hintStage, level) => ['calibration', 'route'].includes(hintStage)
    ? [level === 3 ? routeText.hint : data.hint[level - 1]] : oldHints!(hintStage, level);
  const leave = () => {
    if (!desktop) return;
    desktop = false;
    events.abort();
    stage.append(content);
    content.style.cssText = '';
    shell.hidden = true; shell.replaceChildren();
  };
  app.leaveDesktop = leave;
  const finish = () => {
    leave();
    delete app.state.cycle;
    app.state.entranceFound = true;
    app.state.phase = 'stable-intro';
    app.session.save();
    app.whiteTransition(() => app.scene.drawWorld(true), () => app.resumeHandler?.());
  };
  const show = () => {
    if (desktop) return;
    desktop = true;
    events = new AbortController();
    located = false;
    // A rejected exit request must not block the fictional desktop.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    shell.replaceChildren(); shell.hidden = false;
    shell.append(make('p', ui.app.title, 'desktop-watermark'));
    const gameWindow = make('section', undefined, 'desktop-game');
    gameWindow.id = 'game-window';
    const gameBar = make('header', undefined, 'titlebar nt351-titlebar');
    const hideGame = () => { hideMenu(); gameWindow.hidden = true; };
    const maximize = () => { leave(); app.showTitle(); };
    const menu = make('div', undefined, 'nt351-menu');
    menu.hidden = true; menu.id = 'nt351-menu'; menu.setAttribute('role', 'menu');
    const system = app.actionButton(data.marks.menu, () => {
      if (!menu.hidden) { hideGame(); return; }
      menu.hidden = false; system.setAttribute('aria-expanded', 'true');
      (menu.firstElementChild as HTMLElement).focus();
    }, gameBar);
    system.className = 'nt351-system'; system.setAttribute('aria-label', data.systemMenu);
    system.setAttribute('aria-haspopup', 'menu'); system.setAttribute('aria-controls', menu.id);
    system.setAttribute('aria-expanded', 'false');
    const hideMenu = () => { menu.hidden = true; system.setAttribute('aria-expanded', 'false'); };
    for (const [label, action] of [[data.minimize, hideGame], [data.maximize, maximize], [data.close, hideGame]] as const) {
      app.actionButton(label, action, menu).setAttribute('role', 'menuitem');
    }
    document.addEventListener('pointerdown', e => {
      if (!menu.contains(e.target as Node) && e.target !== system) hideMenu();
    }, { signal: events.signal });
    gameBar.addEventListener('keydown', e => {
      if (menu.hidden) return;
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); hideMenu(); system.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...menu.querySelectorAll('button')], index = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(index + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      }
    });
    gameBar.append(make('span', data.game), menu);
    const controls = make('div', undefined, 'window-buttons');
    app.actionButton(data.marks.minimize, hideGame, controls).setAttribute('aria-label', data.minimize);
    app.actionButton(data.marks.maximize, maximize, controls).setAttribute('aria-label', data.maximize);
    app.actionButton(data.marks.close, hideGame, controls).setAttribute('aria-label', data.close);
    gameWindow.style.cssText = 'width:676px;height:412px;left:144px;top:42px';
    content.style.cssText = 'position:absolute;left:2px;top:32px;transform:scale(.7);transform-origin:top left';
    gameBar.append(controls); gameWindow.append(gameBar, content); shell.append(gameWindow);
    const target = document.getElementById('entry-target')!;
    const cardWindow = make('section', undefined, 'desktop-card'); cardWindow.id = 'card-window';
    cardWindow.hidden = true;
    const cardBar = make('header', undefined, 'titlebar card-drag-handle');
    cardBar.append(make('span', data.card));
    app.actionButton(data.marks.close, () => { cardWindow.hidden = true; }, cardBar).setAttribute('aria-label', data.close);
    const frame = document.createElement('iframe');
    frame.src = './tool.html?embedded=1'; frame.title = data.card; frame.className = 'card-frame';
    const help = make('p', cycleText.cardMind.map(line => line.text).join(' '), 'card-help');
    const cardActions = make('div', undefined, 'card-actions');
    const reset = () => { cardWindow.style.left = '30px'; cardWindow.style.top = '100px'; };
    app.actionButton(data.reset, reset, cardActions);
    const enter = app.actionButton(data.path, () => {
      if (!located || cardWindow.hidden) return;
      gameWindow.hidden = false;
      cardWindow.hidden = true;
      playMaintenanceRoute(app, stage, shell, finish, () => { leave(); app.showTitle(); });
    }, cardActions);
    // After dragging across the embedded frame, mobile browsers may suppress the next
    // compatibility mouse click. Commit a tap released on this button just once.
    enter.addEventListener('touchend', event => {
      if (event.touches.length || event.changedTouches.length !== 1) return;
      const point = event.changedTouches[0];
      if (document.elementFromPoint(point.clientX, point.clientY) !== enter) return;
      event.preventDefault(); enter.click();
    }, { passive: false });
    enter.hidden = true;
    const check = () => {
      if (!desktop || !frame.contentDocument || gameWindow.hidden || cardWindow.hidden) return;
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
        if (!located) {
          app.audio.event('sfx.result.elevated');
          cardWindow.style.zIndex = '4';
        }
        located = true;
        help.textContent = routeText.aligned;
        enter.hidden = false;
        cardWindow.dataset.aligned = 'true';
      }
    };
    enableDrag(gameBar, gameWindow, stage, events.signal, check);
    enableDrag(cardBar, cardWindow, stage, events.signal, check);
    cardWindow.addEventListener('pointerdown', () => { cardWindow.style.zIndex = '4'; });
    gameWindow.addEventListener('pointerdown', () => { cardWindow.style.zIndex = '1'; });
    cardWindow.append(cardBar, frame, help, cardActions); shell.append(cardWindow); reset();
    const taskbar = make('nav', undefined, 'taskbar');
    app.actionButton(data.game, () => { gameWindow.hidden = false; cardWindow.style.zIndex = '1'; }, taskbar);
    app.actionButton(data.card, () => { cardWindow.hidden = false; cardWindow.style.zIndex = '4'; }, taskbar);
    shell.append(taskbar);
  };
  app.titleProvider = () => {
    if (app.state.entranceFound) return [{ label: data.shortcut, action: () => {
      if (['stable-intro', 'registration', 'reunion'].includes(app.state.phase)) app.play();
      else { app.scene.drawWorld(true); app.world(); }
    } }];
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
