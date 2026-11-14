import type { App, Line } from './app.ts';
import data from '../content/text/experiment.json';
import { experimentResult, discoverExperiment, canFindEntrance } from '../core/rules.ts';

export function installExperiment(app: App): void {
  Object.assign(app.extraLogs, data.logs);
  const branchInteract = app.puzzleHandler;
  const branchResume = app.resumeHandler;
  const branchHints = app.hintProvider;
  app.hintProvider = (stage, level) => stage === 'experiment'
    ? [{ speaker: 'pruto', text: data.hints[level - 1] }] : branchHints!(stage, level);
  const finalize = () => {
    app.dialogue(data.dialogue.final as Line[], () => {
      app.state.phase = 'entrance'; app.session.save(); app.log('entrance-goal'); app.world();
    }, true);
  };
  app.resumeHandler = () => {
    if (app.state.phase === 'maintenance' && canFindEntrance(app.state)) { finalize(); return true; }
    return branchResume?.() ?? false;
  };
  app.puzzleHandler = id => {
    if (id !== 'cleaner') { branchInteract?.(id); return; }
    if (!app.state.evidence.includes('range') || !app.state.evidence.includes('diagnosis')) {
      app.dialogue([{ speaker: 'pruto', text: app.state.evidence.includes('range') ? data.ui.needDiagnosis : data.ui.needRange }]);
      return;
    }
    if (!app.state.evidence.includes('experiment-intro')) {
      app.dialogue(data.dialogue.intro as Line[], () => { app.observe('experiment-intro'); open(); }, true);
    } else open();
  };
  const open = () => {
    let focus = 0;
    let restore = () => {};
    const choose = (index: number) => {
      focus = index;
      if (index < 2) {
        if (index === 0) app.state.experiment.held = !app.state.experiment.held;
        else app.state.experiment.outside = !app.state.experiment.outside;
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
      const { fresh, conclusions } = discoverExperiment(app.state);
      app.session.save();
      if (fresh) app.log(`exp-${result.id}`);
      for (const conclusion of conclusions) app.log(conclusion);
      const dialogue: Line[] = fresh ? [...data.dialogue[result.id] as Line[]] : [{
        speaker: 'pruto', text: `${result.success ? data.ui.success : data.ui.failed}；${result.retained ? data.ui.retained : data.ui.deleted}。`,
      }];
      for (const conclusion of conclusions) dialogue.push(...data.dialogue[conclusion as 'occupancy' | 'boundary' | 'independence'] as Line[]);
      app.dialogue(dialogue, after, fresh);
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
      if (key === 'ArrowUp' || key === 'ArrowDown') { focus = (focus + (key === 'ArrowUp' ? 3 : 1)) % 4; restore(); }
      else if (key === 'Enter' || key === 'z') choose(focus);
      else if (key === 'x' || key === 'Shift') app.world();
    });
  };
}
