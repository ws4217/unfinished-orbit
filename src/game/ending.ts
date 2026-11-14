import type { App, Line } from './app.ts';
import data from '../content/text/ending.json';
import { collect, tokenReady } from '../core/ending.ts';
import { type Collection } from '../core/state.ts';
import { openTool } from '../ui/desktop.ts';

export function installEnding(app: App): void {
  Object.assign(app.extraLogs, data.logs);
  const beforeInteract = app.puzzleHandler;
  const beforeResume = app.resumeHandler;
  const register = () => {
    app.state.phase = 'registration'; app.session.save();
    app.dialogue(data.dialogue.registration as Line[], () => {
      app.state.registered = true;
      app.session.save(); app.log('registered');
      app.dialogue(data.dialogue.arrived as Line[], () => {
        app.state.phase = 'stable';
        app.session.save();
        app.world();
      }, true);
    }, true);
  };
  const reunion = () => {
    app.transition(() => app.dialogue(data.dialogue.reunion as Line[], () => {
      app.state.phase = 'revisit'; app.session.save(); app.log('reunited');
      app.scene.drawWorld(false); app.world();
    }, true));
  };
  app.resumeHandler = () => {
    if (app.state.phase === 'registration') { register(); return true; }
    if (app.state.phase === 'reunion') { reunion(); return true; }
    return beforeResume?.() ?? false;
  };
  app.collectionHandler = id => {
    const item: Collection = id === 'p01' ? 'star-card' : id === 'merin' ? 'note' : 'receipt';
    if (app.state.collections.includes(item)) { app.dialogue(data.dialogue.repeat as Line[]); return; }
    app.dialogue(data.dialogue[item] as Line[], completed => {
      if (completed && collect(app.state, item)) {
        app.session.save(); app.log(item);
        if (tokenReady(app.state)) {
          app.log('gift-token');
          app.dialogue([{ speaker: 'pruto', text: data.ui.tokenReady }], () => app.world(), true); return;
        }
      }
      app.world();
    });
  };
  app.puzzleHandler = id => {
    if (id === 'register') {
      if (app.state.registered) { openTool(app); return; }
      app.choice(data.ui.register, [
        { label: data.ui.register, action: register },
        { label: data.ui.wait, action: () => app.world() },
      ], () => app.world());
    } else if (id === 'rest') {
      if (!app.state.registered) app.dialogue([{ speaker: 'pruto', text: data.ui.needRegister }]);
      else if (app.state.phase === 'revisit') app.dialogue(data.dialogue.arrived as Line[]);
      else app.choice(data.ui.restQuestion, [
        { label: data.ui.rest, action: () => { app.state.phase = 'reunion'; app.session.save(); reunion(); } },
        { label: data.ui.wait, action: () => app.world() },
      ], () => app.world());
    } else if (id === 'art') app.dialogue(data.dialogue.art as Line[]);
    else if (id === 'karo-stable') app.dialogue(data.dialogue.arrived as Line[]);
    else if (id === 'return') {
      app.scene.drawWorld(false); app.scene.teleport(832, 832); app.world();
    } else beforeInteract?.(id);
  };
}
