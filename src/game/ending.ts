import type { App } from './app.ts';
import data from '../content/text/ending.json';
import { collect, tokenReady } from '../core/ending.ts';
import { type Collection } from '../core/state.ts';
import { openTool } from '../ui/desktop.ts';

export function installEnding(app: App): void {
  Object.assign(app.extraLogs, data.logs);
  const beforeInteract = app.puzzleHandler;
  const beforeResume = app.resumeHandler;
  const arrived = () => app.dialogue(data.dialogue.arrived, () => {
    app.state.phase = 'stable'; app.session.save(); app.world();
  }, true);
  const karoArrives = () => app.whiteTransition(() => app.scene.showStableKaro(), arrived);
  const arrivalCall = () => app.phone(data.dialogue.arrivalCall, () => {
    app.state.phase = 'stable'; app.session.save(); app.world();
  }, true);
  const register = () => {
    app.state.phase = 'registration'; app.session.save();
    app.phone(data.dialogue.registration, () => {
      app.state.registered = true;
      app.session.save(); app.log('registered');
      karoArrives();
    }, true, line => {
      if (line.cue === 'registration-confirmed') app.audio.event('sfx.result.elevated');
    });
  };
  const reunion = () => {
    app.boot('success', () => app.dialogue(data.dialogue.reunion, () => {
      app.whiteTransition(() => {
        app.state.phase = 'revisit'; app.session.save(); app.log('reunited');
        app.scene.drawWorld(false);
      }, () => app.world());
    }, true));
  };
  app.resumeHandler = () => {
    if (app.state.phase === 'stable-intro') { arrivalCall(); return true; }
    if (app.state.phase === 'registration') { if (app.state.registered) karoArrives(); else register(); return true; }
    if (app.state.phase === 'reunion') { reunion(); return true; }
    return beforeResume?.() ?? false;
  };
  app.collectionHandler = id => {
    const item: Collection = id === 'p01' ? 'star-card' : id === 'merin' ? 'note' : 'receipt';
    if (app.state.collections.includes(item)) { app.dialogue(data.dialogue.repeat); return; }
    app.dialogue(data.dialogue[item], completed => {
      if (completed && collect(app.state, item)) {
        app.session.save(); app.log(item);
        if (tokenReady(app.state)) {
          app.audio.event('sfx.result.complete');
          app.log('gift-token');
          app.dialogue([data.prompts.tokenReady], () => app.world(), true); return;
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
      if (!app.state.registered) app.dialogue([data.prompts.needRegister]);
      else if (app.state.phase === 'revisit') app.dialogue(data.dialogue.arrived);
      else app.choice(data.ui.restQuestion, [
        { label: data.ui.rest, action: () => { app.state.phase = 'reunion'; app.session.save(); reunion(); } },
        { label: data.ui.wait, action: () => app.world() },
      ], () => app.world());
    } else if (id === 'art') app.dialogue(data.dialogue.art);
    else if (id === 'karo-stable') app.dialogue(data.dialogue.arrived);
    else beforeInteract?.(id);
  };
}
