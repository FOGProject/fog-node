const assert = require('assert');
const crypto = require('crypto');
const EventEmitter = require('events');
const fs = require('fs');
const https = require('https');
const net = require('net');
const os = require('os');
const path = require('path');
const tls = require('tls');
const defineAgentTlsHook = require('../../api/hooks/agent-tls');
const pkiFiles = require('../../api/lib/agent-pki-files');
const {startAgentListener, agentPath} = defineAgentTlsHook;
const agentCsr = require('../support/agent-csr');
const support = require('../support/pki');
const {freePort} = require('../support/port');

// startAgentListener (api/hooks/agent-tls): the HTTPS listener of the
// fog-agent. The routes that run on it are in test/integration/agent-mtls.test.js.
describe('Agent listener::', function () {
  this.timeout(60000);

  const fixtureDir = support.useFixture();
  const rootPem = () => fs.readFileSync(path.join(fixtureDir(), 'root.pem'));
  // A request handler that reports what the TLS socket knows of the peer.
  const app = (req, res) => {
    const peer = req.socket.getPeerCertificate();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({authorized: req.socket.authorized, peer: Boolean(peer && peer.raw)}));
  };

  const listening = (server) => (server.listening ? Promise.resolve() : new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  }));
  const stop = (server) => new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });

  // Run fn and return the sails.log.warn lines it wrote. With `late`, wait for
  // a warning that arrives after fn returns (a listen error does).
  const warnings = async (fn, late = false) => {
    const saved = sails.log.warn;
    const lines = [];
    sails.log.warn = (...args) => lines.push(args.join(' '));
    try {
      const result = await fn();
      for (let i = 0; late && i < 40 && !lines.length; i++) { await new Promise((resolve) => setTimeout(resolve, 50)); }
      return {result, lines};
    } finally {
      sails.log.warn = saved;
    }
  };

  // One HTTPS request to the listener. Resolves {status, body}, the body parsed as JSON.
  const request = (port, options = {}) => new Promise((resolve, reject) => {
    const req = https.request(Object.assign({host: '127.0.0.1', port, path: '/agent/v1/x', ca: rootPem(), agent: false}, options), (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({status: res.statusCode, body: JSON.parse(data)}));
    });
    req.on('error', reject);
    req.end();
  });
  const get = async (port, options) => (await request(port, options)).body;

  describe('agentPath::', () => {
    it('allows the agent API and the two CA files, with or without a query string', () => {
      for (const url of [
        '/agent/v1/poll', '/agent/v1/enroll', '/agent/v1/', '/agent/v1/payload/7', '/agent/v1/poll?x=1',
        '/agent/v1/renew', '/agent/v1/result', '/agent/v1/payload/update/12', '/agent/v1/identity/check', '/agent/v1/directory/rejoin/start',
        '/management/other/ca.cert.pem', '/management/other/ca.cert.der', '/management/other/ca.cert.pem?v=1'
      ]) {
        assert.strictEqual(agentPath(url), true, url);
      }
    });

    it('refuses every other path, traversal and encoded traversal', () => {
      for (const url of [
        '/', '/login', '/api/v1/host', '/agent/v1', '/agent/v1x', '/agent/v10/', '/agent/v1/../login',
        '/%2e%2e/login', '/agent/v1/%2e%2e/%2e%2e/login', '/agent/v1/%2E%2E/login', '/agent/v1//x', '/agent/v1/./x',
        '/agent/v1/..%2flogin', '/agent/v1/%5c..%5clogin', '/agent/v1/%zz', '/agent/v1/%00',
        '/%61gent/v1/poll', '/agent%2Fv1/poll', '/management/other/ca%2Ecert.pem', '/management%2Fother%2Fca.cert.pem',
        '/agent/v1/%252e%252e/login', '/agent/v1/a b', '/agent/v1/a\\b',
        '/management/other/ca.cert.pem.bak', '/management/other/ca.cert.der/x', '/management/other/ca.cert.pem/',
        '/management/other/agent-ca-bundle.pem', '//agent/v1/poll', 'agent/v1/poll', 'http://x/login', '*', '', undefined
      ]) {
        assert.strictEqual(agentPath(url), false, String(url));
      }
    });
  });

  it('returns null for port 0, and logs nothing', async () => {
    const {result, lines} = await warnings(() => startAgentListener(app, {port: 0, pkiDir: fixtureDir()}));
    assert.strictEqual(result, null);
    assert.deepStrictEqual(lines, []);
  });

  it('returns null and logs one warning when the PKI is missing', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'fog-pki-empty-'));
    try {
      const port = await freePort();
      const {result, lines} = await warnings(() => startAgentListener(app, {port, pkiDir: empty}));
      assert.strictEqual(result, null);
      assert.strictEqual(lines.length, 1);
      assert.ok(lines[0].includes(empty), lines[0]);
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });

  it('logs one warning that names the port, and does not throw, when the port is busy', async () => {
    const busy = net.createServer();
    await new Promise((resolve) => busy.listen(0, resolve));
    const {port} = busy.address();
    let server;
    try {
      const {result, lines} = await warnings(() => {
        server = startAgentListener(app, {port, pkiDir: fixtureDir()});
        return server;
      }, true);
      assert.ok(result, 'the server object is returned');
      assert.strictEqual(lines.length, 1);
      assert.ok(lines[0].includes(String(port)) && lines[0].includes('EADDRINUSE'), lines[0]);
      assert.strictEqual(server.listening, false);
    } finally {
      await new Promise((resolve) => busy.close(resolve));
    }
  });

  // The hook itself, driven by a fake sails: an EventEmitter with the config,
  // log and hooks.http.app that the hook reads. Each test calls the 'lifted'
  // handler directly, so it can await the lift.
  describe('the hook at lift::', () => {
    // The fixture's SAN list (test/support/pki.js), so a real lift-time check
    // leaves the read-only fixture as it is.
    const fakeSails = (custom) => {
      const fake = new EventEmitter();
      fake.config = {custom: Object.assign({agentTlsSans: support.SANS}, custom)};
      fake.lines = [];
      fake.log = {warn: (...args) => fake.lines.push(args.join(' '))};
      fake.hooks = {http: {app}};
      return fake;
    };
    const initHook = (fake) => {
      const hook = defineAgentTlsHook(fake);
      hook.initialize();
      return hook;
    };
    const liftHandler = (fake) => fake.listeners('lifted')[0];
    // Run fn with pkiFiles.ensureServerCert replaced by stub, and put it back.
    const stubbed = async (stub, fn) => {
      const saved = pkiFiles.ensureServerCert;
      pkiFiles.ensureServerCert = stub;
      try {
        return await fn();
      } finally {
        pkiFiles.ensureServerCert = saved;
      }
    };
    // Close a server the hook kept, whether or not it is listening yet.
    const discard = async (server) => {
      if (!server) return;
      await listening(server).catch(() => {});
      if (server.listening) await stop(server);
    };

    it('starts no listener when lower fires while the lift awaits the server certificate', async () => {
      const port = await freePort();
      const fake = fakeSails({agentTlsPort: port, pkiDir: fixtureDir()});
      const hook = initHook(fake);
      let release;
      await stubbed(() => new Promise((resolve) => { release = resolve; }), async () => {
        const lift = liftHandler(fake)();
        fake.emit('lower');
        release();
        await lift;
      });
      const kept = hook.server;
      await discard(kept);
      // Boolean asserts: a failing deepEqual would print the server, key included.
      assert.ok(kept === null, 'the hook started a listener after the lower');
    });

    it('drops the server after a failed listen', async () => {
      const busy = net.createServer();
      await new Promise((resolve) => busy.listen(0, resolve));
      const fake = fakeSails({agentTlsPort: busy.address().port, pkiDir: fixtureDir()});
      const hook = initHook(fake);
      try {
        const {lines} = await warnings(() => stubbed(async () => {}, () => liftHandler(fake)()), true);
        assert.ok(lines.length === 1 && lines[0].includes('EADDRINUSE'), lines.join('\n'));
        assert.ok(hook.server === null, 'the hook kept a server that failed to listen');
      } finally {
        await new Promise((resolve) => busy.close(resolve));
      }
    });

    it('keeps a newer server when an older one fails to listen after it was replaced', async () => {
      // Two lifts in one tick: the first on a busy port, the second on a free
      // one. The first server's listen error arrives after the second server
      // is hook.server, and must not clear it.
      const busy = net.createServer();
      await new Promise((resolve) => busy.listen(0, resolve));
      const freeOne = await freePort();
      const fake = fakeSails({agentTlsPort: busy.address().port, pkiDir: fixtureDir()});
      const hook = initHook(fake);
      let second;
      try {
        await warnings(() => stubbed(async () => {}, async () => {
          const first = liftHandler(fake)();
          fake.config.custom = Object.assign({}, fake.config.custom, {agentTlsPort: freeOne});
          const next = liftHandler(fake)();
          await Promise.all([first, next]);
          second = hook.server;
        }), true);
        assert.ok(second, 'the second lift made a server');
        assert.ok(hook.server === second, 'the older server\'s listen error cleared the newer server');
      } finally {
        await discard(second);
        await new Promise((resolve) => busy.close(resolve));
      }
    });

    it('makes no agent CA and starts no listener when agent-ca.pem is missing', async () => {
      const dir = support.copy(fixtureDir());
      try {
        fs.rmSync(path.join(dir, 'agent-ca.pem'));
        const before = fs.readdirSync(dir).sort();
        const fake = fakeSails({agentTlsPort: await freePort(), pkiDir: dir});
        const hook = initHook(fake);
        const {lines} = await warnings(() => liftHandler(fake)());
        const kept = hook.server;
        await discard(kept);
        assert.deepStrictEqual(fs.readdirSync(dir).sort(), before, 'the lift changed the pki folder');
        assert.ok(kept === null, 'the hook started a listener');
        assert.strictEqual(fake.lines.length, 1, fake.lines.join('\n'));
        assert.ok(fake.lines[0].includes('npm run setup'), fake.lines[0]);
        assert.deepStrictEqual(lines, []);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });

    it('logs one warning and starts no listener when root.key and the server pair are missing', async () => {
      const dir = support.copy(fixtureDir());
      try {
        for (const name of ['root.key', 'server.pem', 'server.key']) fs.rmSync(path.join(dir, name));
        const fake = fakeSails({agentTlsPort: await freePort(), pkiDir: dir});
        const hook = initHook(fake);
        // lines: startAgentListener's warnings (global sails); fake.lines: the hook's.
        const {lines} = await warnings(() => liftHandler(fake)());
        const kept = hook.server;
        await discard(kept);
        assert.ok(kept === null, 'the hook started a listener');
        const all = [...fake.lines, ...lines];
        assert.strictEqual(all.length, 1, all.join('\n'));
        assert.ok(all[0].includes('root.key'), all[0]);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });
  });

  describe('listening::', () => {
    let server;
    let port;
    before(async () => {
      port = await freePort();
      server = startAgentListener(app, {port, pkiDir: fixtureDir()});
      assert.ok(server, 'the listener starts');
      await listening(server);
    });
    after(() => stop(server));

    it('serves server.pem, which verifies against the root and names localhost and 127.0.0.1', async () => {
      // tls.connect checks the host (an IP here, so the iPAddress entry) against the SAN.
      const socket = tls.connect({host: '127.0.0.1', port, ca: rootPem()});
      await new Promise((resolve, reject) => { socket.once('secureConnect', resolve); socket.once('error', reject); });
      try {
        assert.strictEqual(socket.authorized, true);
        const served = new crypto.X509Certificate(socket.getPeerCertificate().raw);
        const file = new crypto.X509Certificate(fs.readFileSync(path.join(fixtureDir(), 'server.pem')));
        assert.strictEqual(served.fingerprint256, file.fingerprint256);
        assert.strictEqual(served.subjectAltName, 'DNS:localhost, IP Address:127.0.0.1');
        assert.ok(['TLSv1.2', 'TLSv1.3'].includes(socket.getProtocol()));
      } finally {
        socket.destroy();
      }
    });

    it('answers 404 with a JSON body for a path that is not the agent\'s, without calling the app', async () => {
      // The stub app answers 200 JSON, so a 404 here comes from the listener's filter.
      const res = await request(port, {path: '/login'});
      assert.strictEqual(res.status, 404);
      assert.deepStrictEqual(res.body, {error: 'not found'});
    });

    it('requests a client certificate and never requires one', async () => {
      // A browser sends none: the request is answered, with no peer certificate.
      assert.deepStrictEqual(await get(port), {authorized: false, peer: false});
    });

    it('trusts a certificate from the agent CA, and passes it on to the request', async () => {
      const c = await agentCsr.newCsr();
      const {leafPem, chainPem} = await sails.helpers.agent.signCsr.with({csrPem: c.pem, hostId: '7'});
      const answer = await get(port, {cert: leafPem + chainPem, key: agentCsr.keyPem(c.keys)});
      assert.deepStrictEqual(answer, {authorized: true, peer: true});
    });

    it('passes on a certificate from another CA, not authorized, for the policy to refuse', async () => {
      const other = await support.foreign();
      const c = await agentCsr.newCsr();
      const saved = sails.config.custom.pkiDir;
      let issued;
      await support.setRoot(support.rootOf(other));
      sails.config.custom.pkiDir = other;
      try {
        issued = await sails.helpers.agent.signCsr.with({csrPem: c.pem, hostId: '7'});
      } finally {
        sails.config.custom.pkiDir = saved;
        await support.setRoot(support.rootOf(fixtureDir()));
      }
      const answer = await get(port, {cert: issued.leafPem + issued.chainPem, key: agentCsr.keyPem(c.keys)});
      assert.deepStrictEqual(answer, {authorized: false, peer: true});
    });
  });
});
