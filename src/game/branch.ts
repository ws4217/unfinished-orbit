import type { App, Line } from './app.ts';
import data from '../content/text/branch.json';
import ui from '../content/text/ui.json' with { type: 'json' };
import type { Evidence } from '../core/state.ts';
import { canFirstPhone, orderingError, swap } from '../core/rules.ts';
import { firstSync, submitMapping, secondSync, submitOrdering, reportRead, thirdSync } from '../core/branch.ts';

export function installBranch(app: App): void {
  Object.assign(app.extraLogs, data.logs);
  app.hintProvider = (stage, level) => [{
    speaker: 'pruto', text: data.hints[stage === 'mapping' ? 'mapping' : 'ordering'][level - 1],
  }];
  const report = () => {
    const branch = app.state.branch!;
    app.dialogue(data.dialogue[`report-${branch}`] as Line[], () => {
      reportRead(app.state); app.session.save(); third();
    }, true);
  };
  const third = () => {
    app.phone(data.dialogue[`phone3-${app.state.branch!}`] as Line[], () => {
      thirdSync(app.state); app.session.save(); app.log('p01-contradiction'); app.world();
    }, true);
  };
  app.resumeHandler = () => {
    if (app.state.phase === 'report') { report(); return true; }
    if (app.state.phase === 'phone3') { third(); return true; }
    return false;
  };
  app.menuProvider = back => {
    if (!app.state.branch) return [];
    const topics = [];
    if (canFirstPhone(app.state)) topics.push({
      label: (app.state.phones.first ? '' : ui.exploration.newCall) + data.ui.phone1,
      action: () => app.phone(data.dialogue[`phone1-${app.state.branch!}`] as Line[], completed => {
        if (completed) { firstSync(app.state); app.session.save(); app.log('mapping-clues'); }
        back();
      }),
    });
    if (app.state.phones.first && (app.state.branch === 'objects' || app.state.puzzles.mappingDone)) topics.push({
      label: (app.state.phones.second ? '' : ui.exploration.newCall) + data.ui.phone2,
      action: () => app.phone(data.dialogue[`phone2-${app.state.branch!}`] as Line[], completed => {
        if (!completed || app.state.phones.second) { back(); return; }
        // Partner execution is event driven, never a real timed task or a second playable route.
        secondSync(app.state);
        if (app.state.phase === 'report') app.audio.event('sfx.gate.deactivate');
        app.session.save(); app.log('ordering-rules');
        if (app.state.phase === 'report') report(); else back();
      }),
    });
    return topics;
  };
  app.puzzleHandler = id => {
    if (id.startsWith('base-')) {
      const index = ['base-dark', 'base-moon', 'base-tomorrow', 'base-comet'].indexOf(id);
      if (index < 0) return;
      app.dialogue([{ speaker: 'pruto', text: data.ui.clues[index] }], completed => {
        if (completed) app.observe(id as Evidence);
        app.world();
      });
      return;
    }
    if (!['symbol-terminal', 'object-terminal'].includes(id)) return;
    if (app.state.phase !== 'branch') {
      app.dialogue(data.dialogue[`report-${app.state.branch!}`] as Line[]);
      return;
    }
    const open = () => slots(app);
    if (id === 'symbol-terminal' && !app.state.evidence.includes('symbol-terminal')) {
      app.dialogue(data.dialogue.terminal as Line[], completed => {
        if (completed) { app.observe('symbol-terminal'); open(); } else app.world();
      });
    } else open();
  };
}

function slots(app: App): void {
  const symbols = app.state.branch === 'symbols';
  const key = symbols ? 'symbols' : 'objects';
  let focus = 0;
  let selected: number | null = null;
  let restore = () => {};
  const choose = (index: number) => {
    app.audio.event('sfx.ui.confirm');
    focus = index;
    if (index === 4) { submit(); return; }
    if (app.state.puzzles[symbols ? 'mappingDone' : 'orderingDone']) { restore(); return; }
    if (selected === null) selected = index;
    else {
      app.state.puzzles[key] = swap(app.state.puzzles[key], selected, index);
      selected = null;
      app.session.save();
    }
    restore();
  };
  const submit = () => {
    if (symbols && app.state.puzzles.mappingDone) {
      app.dialogue(data.dialogue.mappingDone as Line[], restore); return;
    }
    const error = symbols ? submitMapping(app.state) : submitOrdering(app.state);
    if (error) {
      app.audio.event('sfx.error.input');
      let text = data.errors[error];
      if (error === 'ordering') {
        const rule = orderingError(app.state.puzzles.objects);
        if (rule && rule > 0) text += ' ' + data.ui.rules[rule - 1];
      }
      app.dialogue([{ speaker: 'pruto', text: data.ui.selfTalk.replace('{text}', text) }], restore);
      return;
    }
    selected = null;
    app.audio.event(symbols ? 'sfx.result.basic' : 'sfx.gate.deactivate');
    app.session.save();
    if (symbols) {
      app.log('ordering-rules');
      app.dialogue(data.dialogue.mappingDone as Line[], restore);
    } else app.resumeHandler?.();
  };
  restore = app.puzzle(symbols ? data.ui.mappingTitle : data.ui.orderingTitle, container => {
    container.dataset.puzzle = symbols ? 'mapping' : 'ordering';
    const hint = document.createElement('p'); hint.textContent = symbols ? data.ui.mappingHelp : data.ui.slotHelp; hint.className = 'puzzle-help';
    container.append(hint);
    const slots = document.createElement('div'); slots.className = 'slots';
    app.state.puzzles[key].forEach((element, index) => {
      const column = document.createElement('div'); column.className = 'slot-column';
      const symbol = document.createElement('span'); symbol.className = 'slot-symbol';
      symbol.textContent = symbols ? data.ui.symbols[index] : `${index + 1}`;
      column.append(symbol);
      const button = app.actionButton(data.ui.elements[element], () => choose(index), column);
      button.dataset.selected = String(selected === index);
      button.dataset.focus = String(focus === index);
      button.addEventListener('focus', () => { focus = index; });
      slots.append(column);
    });
    container.append(slots);
    const confirm = app.actionButton(data.ui.confirm, () => choose(4), container);
    confirm.dataset.focus = String(focus === 4);
    if (app.state.puzzles.mappingDone || app.state.phones.second) {
      const rules = document.createElement('p');
      rules.textContent = data.ui.rules.join('\n'); rules.className = 'rule-list'; container.append(rules);
    }
    (container.querySelectorAll('button')[focus] as HTMLElement)?.focus();
  }, key => {
    if (key === 'ArrowLeft' || key === 'ArrowRight') { app.audio.event('sfx.ui.focus'); focus = (focus + (key === 'ArrowLeft' ? 4 : 1)) % 5; restore(); }
    else if (key === 'Enter' || key === 'z') choose(focus);
    else if (key === 'Shift' || key === 'x') {
      if (selected !== null) { selected = null; restore(); } else app.world();
    }
  });
}
