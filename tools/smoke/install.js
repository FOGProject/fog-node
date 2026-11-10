/**
 * Installer smoke test.
 *
 * It runs the real installer (`npm run setup`) with an answers file, lifts
 * fog-node in production mode with the config that the installer wrote, and
 * checks what an administrator does first:
 *   - the installer exits 0 and writes config/local.js and config/models.js;
 *   - /login loads, and the Administrator signs in through the login form
 *     (the CSRF token and the Redis session store must both work);
 *   - a signed-in page loads;
 *   - the socket server accepts the URL that the installer was given, and
 *     refuses any other origin;
 *   - the installer, run again with an empty PKI folder, restores the agent
 *     CA from the database backup (pki.passphrase in the answers file) with
 *     the same root, and never prints the passphrase.
 *
 * Why: CI ran `npm run setup:dev`, never the installer. chalk 6 broke the
 * installer with every check green (PR #141). This runs on Linux, Windows,
 * and macOS, because fog-node runs on any OS.
 *
 * Usage: npm run test:install
 *   It needs MongoDB and Redis. It installs into the database
 *   fog_install_smoke_test, which it drops first, and an image directory under the
 *   OS temp directory. It saves config/local.js and config/models.js first
 *   and puts them back at the end, so a dev checkout keeps its config.
 *
 * Environment:
 *   FOG_SMOKE_DB_HOST  (default 127.0.0.1)
 *   FOG_SMOKE_REDIS    (default redis://127.0.0.1:6379/0)
 */
const {spawnSync} = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const server = require('./lib/server');
const testDb = require('../lib/test-db');
const escrow = require('../../api/lib/agent-ca-escrow');

const root = server.root;
const port = 1340;
const base = `http://127.0.0.1:${port}`;
// A throwaway name that ends in _test, as every test database does
// (tools/lib/test-db.js). dropDatabase refuses it if it is the configured one.
const dbName = 'fog_install_smoke' + testDb.SUFFIX;
const dbHost = process.env.FOG_SMOKE_DB_HOST || '127.0.0.1';
const configs = ['local.js', 'models.js'].map((f) => path.join(root, 'config', f));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fog-install-smoke-'));
// A new password for each run. It only ever guards the throwaway database.
const password = crypto.randomBytes(12).toString('base64url');
// The agent CA backup passphrase (pki.passphrase in the answers file). New
// for each run; it only ever guards the throwaway CA.
const passphrase = escrow.generatePassphrase();
// The run's own PKI folder, so it never touches the checkout's pki/.
const pkiDir = path.join(work, 'pki');
const answersFile = path.join(work, 'answers.json');
// Every line the installer printed, for the check that the passphrase is in none.
const installerOutput = [];

// The cookie jar for the sign-in: name=value pairs from Set-Cookie headers.
const jar = new Map();
const keepCookies = (res) => {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const at = pair.indexOf('=');
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
};
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

async function dropDatabase() {
  // The guard: never drop the database this checkout is configured to use.
  if (dbName === testDb.configuredName()) {
    throw new Error(`Refusing to drop "${dbName}": it is the configured database.`);
  }
  const {MongoClient} = require('mongodb');
  const client = await MongoClient.connect(`mongodb://${dbHost}:27017`, {useUnifiedTopology: true});
  try {
    await client.db(dbName).dropDatabase();
  } finally {
    await client.close();
  }
}

// The answers file, in the work folder that the run deletes. It holds the passphrase.
function writeAnswers() {
  const answers = {
    database: {host: dbHost, port: 27017, database: dbName, username: ''},
    redis: {url: process.env.FOG_SMOKE_REDIS || 'redis://127.0.0.1:6379/0'},
    server: {urls: base, imageStorePath: path.join(work, 'images')},
    admin: {email: 'admin@example.com', password},
    seed: {seed: false},
    pki: {passphrase}
  };
  fs.writeFileSync(answersFile, JSON.stringify(answers));
}

function runInstaller() {
  // A timeout, so an installer that waits on a prompt fails instead of hanging.
  const run = spawnSync(process.execPath, ['tools/setup/index.js', '--answers', answersFile],
    {cwd: root, encoding: 'utf8', timeout: 5 * 60 * 1000});
  installerOutput.push(run.stdout || '', run.stderr || '');
  if (run.status !== 0) {
    throw new Error(`the installer exited ${run.status}:\n${(run.stdout + run.stderr).slice(-2000)}`);
  }
  for (const f of configs) {
    if (!fs.existsSync(f)) throw new Error(`the installer did not write ${path.relative(root, f)}`);
  }
}

async function signIn() {
  const page = await fetch(`${base}/login`, {redirect: 'manual'});
  keepCookies(page);
  const html = await page.text();
  const token = (html.match(/name="_csrf" value="([^"]+)"/) || [])[1];
  if (!token) throw new Error('/login has no CSRF token');
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    redirect: 'manual',
    // accept: text/html, as the browser's form post sends. Without it Sails
    // treats the request as an API call and answers JSON, not the redirect.
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'text/html',
      cookie: cookieHeader()
    },
    body: new URLSearchParams({username: 'Administrator', password, _csrf: token})
  });
  keepCookies(res);
  // Success redirects to /. A wrong password redirects to /login.
  const to = res.headers.get('location') || '';
  if (res.status !== 302 || new URL(to, base).pathname === '/login') {
    throw new Error(`the sign-in failed: HTTP ${res.status}, location "${to}"`);
  }
  const home = await fetch(`${base}/`, {redirect: 'manual', headers: {cookie: cookieHeader()}});
  if (home.status !== 200) throw new Error(`/ after the sign-in answered HTTP ${home.status}, not 200`);
}

// A WebSocket handshake, as a browser at `origin` makes it (fog-node accepts
// the websocket transport only). Resolves 'open', or the refusal's HTTP status.
function socketHandshake(origin) {
  const WebSocket = require('ws');
  const url = `ws://127.0.0.1:${port}/socket.io/?__sails_io_sdk_version=1.2.1&EIO=4&transport=websocket`;
  return new Promise((resolve) => {
    const socket = new WebSocket(url, {origin});
    socket.on('open', () => { socket.close(); resolve('open'); });
    socket.on('unexpected-response', (req, res) => resolve(`HTTP ${res.statusCode}`));
    socket.on('error', (err) => resolve(`error: ${err.message}`));
  });
}

async function main() {
  const saved = configs.map((f) => (fs.existsSync(f) ? fs.readFileSync(f) : null));
  // A copy on disk too, in case this process dies before it can restore.
  const backup = path.join(work, 'config-backup');
  fs.mkdirSync(backup);
  configs.forEach((f, i) => saved[i] !== null && fs.writeFileSync(path.join(backup, path.basename(f)), saved[i]));
  if (saved.some((s) => s !== null)) {
    console.log(`Your config/local.js and config/models.js are saved in ${backup}; they are put back at the end.`);
  }
  const log = [];
  let child;
  let failed = false;
  const restore = () => {
    server.stop(child);
    configs.forEach((f, i) => (saved[i] === null ? fs.rmSync(f, {force: true}) : fs.writeFileSync(f, saved[i])));
    fs.rmSync(work, {recursive: true, force: true});
  };
  // Ctrl-C or a kill while the installed config is in place: restore first.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      restore();
      process.exit(1);
    });
  }
  const step = async (label, fn) => {
    await fn();
    console.log(`ok    ${label}`);
  };
  try {
    // The drop guard reads the configured database from config/local.js, so it runs first.
    await step('drop the smoke database', dropDatabase);
    // The installer keeps a custom.pkiDir that the old local.js sets
    // (tools/setup/pki.js readOldLocal), so the run uses its own PKI folder.
    fs.writeFileSync(configs[0], `module.exports = {custom: {pkiDir: ${JSON.stringify(pkiDir)}}};\n`);
    writeAnswers();
    await step('the installer, from an answers file', runInstaller);
    child = server.start({port, prod: true, env: {}, log});
    await step('production lift with the installed config', () => server.waitForReady(child, base));
    await step('sign in through the login form', signIn);
    await step('sockets accept the installed URL', async () => {
      const result = await socketHandshake(base);
      if (result !== 'open') throw new Error(`sockets refused the installed URL: ${result}`);
    });
    await step('sockets refuse another origin', async () => {
      const result = await socketHandshake('http://other.example');
      if (result === 'open') throw new Error('sockets accepted http://other.example');
    });
    // The agent CA backup: a re-run with an empty PKI folder restores the same root.
    server.stop(child);
    const rootOf = () => new crypto.X509Certificate(fs.readFileSync(path.join(pkiDir, 'root.pem'))).fingerprint256;
    const rootBefore = rootOf();
    for (const name of fs.readdirSync(pkiDir)) fs.rmSync(path.join(pkiDir, name), {recursive: true, force: true});
    await step('the installer again restores the agent CA from the database backup', () => {
      runInstaller();
      const rootAfter = rootOf();
      if (rootAfter !== rootBefore) throw new Error(`the restored root ${rootAfter} differs from ${rootBefore}`);
    });
    await step('the installer output does not hold the passphrase', () => {
      if (installerOutput.some((out) => out.includes(passphrase))) throw new Error('the installer printed the passphrase');
    });
  } catch (e) {
    failed = true;
    console.log(`FAIL  ${e.message}`);
  } finally {
    restore();
  }
  if (failed) {
    console.log(`\nLast fog-node output:\n${log.slice(-40).join('\n')}`);
    process.exit(1);
  }
  console.log('\nAll installer checks passed.');
}

main();
