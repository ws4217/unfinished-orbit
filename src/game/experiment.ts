import type { App, Line } from './app.ts';
import data from '../content/text/experiment.json';
import { experimentResult, discoverExperiment, canFindEntrance } from '../core/rules.ts';

// 两张纸一直存在，只改变纸上的墨迹。展开当前对白时更新；翻页或关窗不影响实验状态。
function showPaper(layer: HTMLElement, printed: boolean): void {
  layer.querySelector('.sample-paper')?.remove();
  const sample = document.createElement('figure');
  sample.className = 'sample-paper';
  sample.dataset.ink = printed ? 'printed' : 'blank';
  const caption = document.createElement('figcaption');
  caption.textContent = printed ? data.ui.paperPrinted : data.ui.paperBlank;
  sample.append(caption);
  for (const ink of [
    '<path d="M9 38l11-15 9 3 9-14m-18 11 3 14" stroke-dasharray="2 2"/><path d="M8 38h3m8-15h3m6 3h3m6-14h3m-18 25h3"/>',
    '<path d="M31 9l13 24H18z M31 41L18 17h26z M13 39Q1 19 22 7"/>',
  ]) {
    const sheet = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sheet.setAttribute('viewBox', '0 0 62 50'); sheet.setAttribute('aria-hidden', 'true');
    if (printed) sheet.innerHTML = ink;
    sample.append(sheet);
  }
  layer.append(sample);
}

export function installExperiment(app: App): void {
  Object.assign(app.extraLogs, data.logs);
  const branchInteract = app.puzzleHandler;
  const branchResume = app.resumeHandler;
  const branchHints = app.hintProvider;
  let introPending = app.state.evidence.includes('experiment-intro') && app.state.experiment.discovered.length === 0;
  const introduce = () => {
    introPending = true;
    // 沿用既有标记表示开始实验，进入介绍即保存／切曲；零结果恢复时重播介绍。
    app.observe('experiment-intro');
    app.dialogue(data.dialogue.intro as Line[], () => { introPending = false; open(); }, true, (index, layer) => {
      const paper = data.dialogue.intro[index].paper;
      if (paper) showPaper(layer, paper === 'printed');
    });
  };
  app.hintProvider = (stage, level) => stage === 'experiment'
    ? [{ speaker: 'pruto', text: data.hints[level - 1] }] : branchHints!(stage, level);
  const finalize = () => {
    const witness = app.state.branch === 'symbols' ? data.font.symbols : data.font.objects;
    app.dialogue([...witness, ...data.dialogue.final] as Line[], () => {
      app.state.phase = 'entrance'; app.session.save(); app.log('entrance-goal'); app.world();
    }, true);
  };
  app.resumeHandler = () => {
    if (app.state.phase === 'maintenance' && canFindEntrance(app.state)) { finalize(); return true; }
    if (app.state.phase === 'maintenance' && introPending) { introduce(); return true; }
    return branchResume?.() ?? false;
  };
  app.puzzleHandler = id => {
    if (id !== 'cleaner') { branchInteract?.(id); return; }
    if (!app.state.evidence.includes('range') || !app.state.evidence.includes('diagnosis')) {
      app.dialogue([{ speaker: 'pruto', text: app.state.evidence.includes('range') ? data.ui.needDiagnosis : data.ui.needRange }]);
      return;
    }
    if (!app.state.evidence.includes('experiment-intro') || introPending) introduce();
    else open();
  };
  const open = () => {
    let focus = 0;
    let restore = () => {};
    const choose = (index: number) => {
      focus = index;
      if (index < 2) {
        if (index === 0) app.state.experiment.held = !app.state.experiment.held;
        else app.state.experiment.outside = !app.state.experiment.outside;
        const enabled = index === 0 ? app.state.experiment.held : app.state.experiment.outside;
        app.audio.event(enabled ? 'sfx.switch.activate' : 'sfx.switch.deactivate');
        app.session.save(); restore(); return;
      }
      const after = () => {
        if (app.state.phase === 'maintenance' && canFindEntrance(app.state)) finalize();
        else restore();
      };
      if (index === 3) {
        app.dialogue(data.dialogue.storage as Line[], completed => {
          if (completed) { app.observe('storage'); app.log('storage'); }
          after();
        });
        return;
      }
      const result = experimentResult(app.state.experiment.outside, app.state.experiment.held);
      app.audio.event('sfx.machine.clean');
      const { fresh, conclusions } = discoverExperiment(app.state);
      app.session.save();
      if (fresh) app.log(`exp-${result.id}`);
      for (const conclusion of conclusions) app.log(conclusion);
      const dialogue: Line[] = fresh ? [...data.dialogue[result.id] as Line[]] : [{
        speaker: 'pruto', text: data.ui.repeatResult
          .replace('{result}', result.outcome === 'excluded' ? data.ui.skipped : result.success ? data.ui.success : data.ui.failed)
          .replace('{retained}', result.retained ? data.ui.retained : data.ui.blank),
      }];
      for (const conclusion of conclusions) dialogue.push(...data.dialogue[conclusion] as Line[]);
      app.dialogue(dialogue, after, fresh || conclusions.length > 0, (line, layer) => {
        if (line === 0) showPaper(layer, result.retained);
      });
    };
    restore = app.puzzle(data.ui.title, container => {
      const description = document.createElement('p'); description.textContent = data.ui.copied; description.className = 'puzzle-help';
      container.append(description);
      const list = document.createElement('div'); list.className = 'menu-list';
      const labels = [
        `${data.ui.held}：${app.state.experiment.held ? data.ui.on : data.ui.off}`,
        `${data.ui.outside}：${app.state.experiment.outside ? data.ui.on : data.ui.off}`,
        data.ui.execute, data.ui.storage,
      ];
      labels.forEach((label, index) => {
        const button = app.actionButton(label, () => choose(index), list);
        button.dataset.focus = String(focus === index);
        button.addEventListener('focus', () => { focus = index; });
      });
      container.append(list);
      const discoveries = document.createElement('p');
      discoveries.textContent = `${data.ui.discovered}：${app.state.experiment.discovered.length} / 4`;
      container.append(discoveries);
      (list.children[focus] as HTMLElement)?.focus();
    }, key => {
      if (key === 'ArrowUp' || key === 'ArrowDown') { app.audio.event('sfx.ui.focus'); focus = (focus + (key === 'ArrowUp' ? 3 : 1)) % 4; restore(); }
      else if (key === 'Enter' || key === 'z') choose(focus);
      else if (key === 'x' || key === 'Shift') app.world();
    }, 'cleaner');
  };
}
