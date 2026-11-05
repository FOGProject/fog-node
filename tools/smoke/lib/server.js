/**
 * Start, wait for, and stop a fog-node server for the smoke tests
 * (tools/smoke/ui.js, tools/smoke/install.js).
 */
const {spawn, spawnSync} = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Starts `node app.js` in its own process group, so that the stop also ends
// the grunt child process that sails-hook-grunt starts. `log` keeps the last
// 200 lines of server output for a failure report.
function start({port, prod, env, log}) {
  const child = spawn(process.execPath, ['app.js', `--port=${port}`, ...(prod ? ['--prod'] : [])], {
    cwd: root,
    env: {...process.env, ...env},
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  });
  const keep = (buf) => {
    log.push(...buf.toString().split('\n'));
    log.splice(0, Math.max(0, log.length - 200));
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  return child;
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (unused) { /* already gone */ }
  }
}

// Waits until /login answers, then until every script and stylesheet on it
// answers 200. Grunt builds the assets after Sails starts to listen, so the
// first check alone is not enough.
async function waitForReady(child, base) {
  const deadline = Date.now() + 180000;
  let missing = ['/login'];
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`fog-node exited with code ${child.exitCode}`);
    try {
      const html = await (await fetch(`${base}/login`)).text();
      const refs = [...html.matchAll(/<(?:script[^>]+src|link[^>]+href)="(\/[^"]+)"/g)].map((m) => m[1]);
      const codes = await Promise.all(refs.map(async (u) => [u, (await fetch(base + u)).status]));
      missing = codes.filter(([, s]) => s !== 200).map(([u, s]) => `${s} ${u}`);
      if (refs.length && !missing.length) return;
    } catch (unused) {
      // Not listening yet.
    }
    await sleep(1000);
  }
  throw new Error(`fog-node was not ready in 180 s. Still failing: ${missing.slice(0, 5).join(', ')}`);
}

module.exports = {root, start, stop, waitForReady};
