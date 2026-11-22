import type { App } from './app.ts';
import { chooseReturn, closePortalOnTitle, cycleOf, LAST_RETURN } from '../core/cycle.ts';
import { createState } from '../core/state.ts';
import data from '../content/text/cycle.json';
import ui from '../content/text/ui.json' with { type: 'json' };

/** 从显式玩家动作进入折返；恢复已有演出走resume，绝不复用加次数的路径。 */
export class CycleVisit {
  constructor(private app: App) {}
  prepareTitle(): void {
    const a = this.app;
    if (!a.session.blocked && closePortalOnTitle(a.state)) a.session.save();
    document.getElementById('entry-target')!.hidden = a.state.phase === 'cycle' || a.state.cycle?.count === LAST_RETURN;
  }
  title(): void {
    const a = this.app;
    if (a.state.phase !== 'entrance' || a.session.blocked) return;
    const c = cycleOf(a.state);
    if (c.beat === 'closed') this.resume();
    else if (c.beat === 'open' && !c.sawTitle) {
      a.titleDialogue(data.titleMind, () => {
        c.sawTitle = true; a.session.save(); a.showTitle();
      });
    }
  }
  enterFromTitle(): boolean {
    const a = this.app;
    if (a.state.phase !== 'entrance' && a.state.phase !== 'cycle') return false;
    if (chooseReturn(a.state)) a.session.save();
    this.resume();
    return true;
  }
  private resume(): void {
    const a = this.app, c = cycleOf(a.state);
    switch (c.beat) {
      case 'return': {
        a.diamondSwap(() => {
          a.scene.drawWorld(false);
          a.dialogue(data.returns[c.count - 1], () => {
            c.beat = 'open'; a.session.save(); a.diamondSwap(() => a.showTitle());
          }, true);
        }); break;
      }
      case 'closed':
        // 标题已先隐藏入口，再把原界面留在对白背后。
        a.titleDialogue(data.closed, () => {
          c.beat = 'apology'; a.session.save(); this.resume();
        }); break;
      case 'apology':
        a.diamondSwap(() => {
          a.scene.drawWorld(false);
          a.dialogue(data.apology, () => a.boot('fail', () => a.world(), () => {
            a.session.state = { ...createState(), phase: 'cycle', cycle: {
              count: LAST_RETURN, beat: 'visit', sawTitle: true, p01: false, merin: false,
            } };
            a.session.save();
            a.scene.drawWorld(false);
          }), true);
        }); break;
      case 'visit': a.scene.drawWorld(false); a.world(); break;
      case 'p01': case 'merin': a.scene.drawWorld(false); this.interact(c.beat); break;
      case 'drawing': a.scene.drawWorld(false); this.draw(); break;
      case 'end': a.endCard(data.end, ui.app.back); break;
    }
  }
  interact(id: string): boolean {
    const a = this.app;
    if (a.state.phase !== 'cycle') return false;
    const c = cycleOf(a.state);
    if (id === 'old-note') { a.dialogue([data.note]); return true; }
    if (id !== 'p01' && id !== 'merin') return false;
    c.beat = id; a.session.save();
    a.dialogue(data[id], completed => {
      if (completed) c[id] = true;
      c.beat = 'visit'; a.session.save();
      a.world();
    }, true);
    return true;
  }
  exitPublic(): boolean {
    const a = this.app;
    if (a.state.phase !== 'cycle') return false;
    const c = cycleOf(a.state);
    if (!c.p01 || !c.merin) {
      a.dialogue([!c.p01 ? data.needProjector : data.needMerin]);
    } else {
      c.beat = 'drawing'; a.session.save(); this.draw();
    }
    return true;
  }
  private draw(): void {
    const a = this.app;
    a.dialogue(data.painting, () => a.boot('montage', () => {
      cycleOf(a.state).beat = 'end'; a.session.save();
      a.endCard(data.end, ui.app.back, true);
    }), true);
  }
}
