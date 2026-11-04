// What the D10 checks share (qa/studio-scrub.cjs, qa/studio-autores.cjs, qa/studio-preview-ui.cjs; Desktop_Power_Ideas.md
// section 9): the lock of 127.0.0.1:3000, and a development package window that really draws.
//   The lock names the branch of the worktree that runs the check (never a fixed name), is freed when the process ends by
//   any route, and lets a wrapper that holds it for the same branch run the checks in a row.
//   A covered, minimised or unlit window is throttled by Chromium (about one frame a second, timers clamped), and a check
//   timed there measures the throttling, not the studio (2026-11-04: 8 frames drawn of about 211). So the package starts
//   with Windows' occlusion tracking off, its window is shown above the others, and a check refuses, loudly, to time a
//   window that does not draw at the display's rate. The rate is taken at a quiet moment, never during a timed row: with
//   no graphics chip a 4K frame is painted on the page's own thread and holds it for up to a second, by design
//   (2026-11-04: "1 frame a second" right after a no-chip 10 s row, in a window shown and on top).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const LOCK = path.join(process.env.TEMP || os.tmpdir(), 'comms-hub-port3000.lock');
/** Switches the package starts with in these checks: its window is never taken as hidden while the check runs. */
const VISIBLE_ARGS = Object.freeze(['--disable-features=CalculateNativeWinOcclusion', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']);
/** Frames a second below which a window is taken as throttled (displays draw at 60 or more). */
const MIN_DRAW_RATE = 45;

function branch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || path.basename(root);
  } catch {
    return path.basename(root);
  }
}

/** The port's lock for this worktree's branch: `take()` says 'taken', 'held' (by a wrapper of the same branch) or null. */
function portLock() {
  const name = branch();
  let taken = false;
  const free = () => {
    if (!taken) return;
    taken = false;
    try {
      if (fs.readFileSync(LOCK, 'utf8').trim() === name) fs.rmSync(LOCK, { force: true });
    } catch {
      // gone already
    }
  };
  process.on('exit', free);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
    process.on(sig, () => {
      free();
      process.exit(130);
    });
  }
  return {
    name,
    file: LOCK,
    take() {
      try {
        fs.writeFileSync(LOCK, name, { flag: 'wx' });
        taken = true;
        return 'taken';
      } catch {
        try {
          return fs.readFileSync(LOCK, 'utf8').trim() === name ? 'held' : null;
        } catch {
          return null;
        }
      }
    },
    free,
  };
}

/** The package's window above the others, shown and focused, for as long as the check runs. */
async function toFront(app, win) {
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isMinimized()) w.restore();
      w.show();
      w.setAlwaysOnTop(true, 'floating');
      w.moveTop();
      w.focus();
    }
  });
  await win.bringToFront().catch(() => undefined);
}

/** How many frames a second the page draws now, over about one second (ended by a timer, so a page that draws nothing answers 0). */
const drawRate = (page) =>
  page.evaluate(
    () =>
      new Promise((done) => {
        let n = 0;
        let on = true;
        const t0 = performance.now();
        const f = () => {
          n++;
          if (on) requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
        setTimeout(() => {
          on = false;
          done(Math.round((n * 1000) / (performance.now() - t0)));
        }, 1000);
      }),
  );

/**
 * The draw rate at a quiet moment: up to `tries` probes a moment apart, the best of them. The page's own work can hold one
 * probe back; a hidden window is low in every one.
 */
async function quietDrawRate(page, tries = 3) {
  let best = 0;
  for (let i = 0; i < tries && best < MIN_DRAW_RATE; i++) {
    if (i) await new Promise((r) => setTimeout(r, 700));
    best = Math.max(best, await drawRate(page));
  }
  return best;
}

/** Throws, with what to do, when the window does not draw at the display's rate at a quiet moment; returns the rate otherwise. */
async function assertDrawing(page, label) {
  const rate = await quietDrawRate(page);
  if (rate < MIN_DRAW_RATE) {
    throw new Error(`${label}: the window draws ${rate} frames a second, under ${MIN_DRAW_RATE}: it is throttled (covered, minimised, the screen locked or off). Nothing was timed; run again with the screen on and unlocked.`);
  }
  return rate;
}

module.exports = { LOCK, VISIBLE_ARGS, MIN_DRAW_RATE, branch, portLock, toFront, drawRate, quietDrawRate, assertDrawing };
