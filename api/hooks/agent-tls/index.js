/**
 * agent-tls hook: the HTTPS listener of the fog-agent (mTLS).
 *
 * After Sails lifts, it starts an HTTPS server on custom.agentTlsPort (default
 * 8443; 0 turns it off). The server runs the same Express app as the main
 * port, but it passes a request to the app only for the agent's own paths:
 * /agent/v1/* and the two CA files (agentPath). Every other path gets a 404
 * from the listener, so this port never serves the UI, login or admin API (it
 * bypasses the reverse proxy). An agent uses one base URL, https://<host>:<port>,
 * for ca.cert.pem, enroll, poll and renew. It closes the server when Sails lowers.
 *
 * TLS: the server certificate is pki/server.pem (made by api/lib/agent-pki-files.js,
 * signed by the root). The server REQUESTS a client certificate and never
 * requires one (rejectUnauthorized false), so a browser is never asked for one.
 * `ca` is the agent CA, then the root: Node sends their subjects as the
 * CertificateRequest list, and Go's client sends its certificate only if one of
 * them issued it (contract 5.1). The policy agentPrincipal re-verifies the
 * certificate in code (contract 5.4); the TLS verdict is not trusted.
 *
 * At lift, before it listens, the hook calls ensureServerCert with
 * custom.agentTlsSans. It makes server.pem and server.key from the existing
 * root when they are missing, and makes them again when the SAN set changed,
 * fewer than 30 days remain, or the root no longer verifies them. It never
 * makes a root or an agent CA: a new agent CA orphans every enrolled agent,
 * so only setup (npm run setup, npm run setup:dev) makes one. When root.pem or
 * agent-ca.pem is missing, or the root does not verify the agent CA, the hook
 * logs one warning that names npm run setup and starts no listener. When the
 * server certificate cannot be made (root.key missing), it logs one warning.
 * It then starts the listener with the existing server.pem and server.key, or
 * starts none when either is missing.
 */
const fs = require('fs');
const https = require('https');
const path = require('path');
// The module object, not a destructured function: a test replaces
// ensureServerCert on it to hold the lift at the await.
const pkiFiles = require('../../lib/agent-pki-files');

// The CA files the agent's CA probe fetches from the same base URL. These
// repeat two routes in config/routes.js on purpose: a route reaches the agent
// port only when it is added here too.
const CA_FILES = ['/management/other/ca.cert.pem', '/management/other/ca.cert.der'];

/**
 * True when the agent listener may pass `url` (a request target) to the app:
 * a path under /agent/v1/, or exactly one of the two CA files. The query string
 * is ignored. The path is not decoded, because Express routes on the raw path
 * and the agent never sends a percent sign. The path must use only letters,
 * digits and `/ - _ .`, and must equal its own normalized form, so `%`, `\`,
 * a NUL, `..`, `.` and `//` are all refused.
 */
const agentPath = (url) => {
  if (typeof url !== 'string') { return false; }
  const raw = url.split(/[?#]/)[0];
  if (!/^[A-Za-z0-9/_.-]+$/.test(raw) || !raw.startsWith('/') || path.posix.normalize(raw) !== raw) { return false; }
  return raw.startsWith('/agent/v1/') || CA_FILES.includes(raw);
};

/**
 * Start the agent listener on `app`. Returns the server, or null when `port`
 * is 0 or the PKI files are missing (one warning in that case). A port that is
 * in use logs one warning and fog-node keeps running without the listener; the
 * server then emits 'error' once, before 'listening'.
 */
const startAgentListener = (app, {port, pkiDir}) => {
  if (!port) { return null; }
  // Any other path gets a 404 here, so no session, CSRF or page code runs.
  const handler = (req, res) => {
    if (agentPath(req.url)) { return app(req, res); }
    const body = JSON.stringify({error: 'not found'});
    res.writeHead(404, {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)});
    res.end(body);
  };
  const notStarted = (err) => sails.log.warn(`Agent listener not started: cannot listen on port ${port} (${err.code || err.message}). fog-node runs without it.`);
  let server;
  try {
    const read = (name) => fs.readFileSync(path.join(pkiDir, name));
    server = https.createServer({
      key: read('server.key'),
      cert: read('server.pem'),
      ca: [read('agent-ca.pem'), read('root.pem')],
      requestCert: true,
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2'
    }, handler);
  } catch (err) {
    sails.log.warn(`Agent listener not started: the PKI files in ${pkiDir} are missing or unreadable (${err.code || err.message}).`);
    return null;
  }
  // A listen failure (EADDRINUSE) arrives as an 'error' after listen() returns
  // and before 'listening'. Once it listens, an error is only logged.
  server.once('error', notStarted);
  server.once('listening', () => {
    server.removeListener('error', notStarted);
    server.on('error', (err) => sails.log.warn(`Agent listener error: ${err.code || err.message}`));
  });
  try {
    server.listen(port);
  } catch (err) {
    notStarted(err);
    return null;
  }
  return server;
};

module.exports = function defineAgentTlsHook(sails) {
  return {
    initialize: function () {
      const hook = this;
      hook.server = null;
      // 'lower' can fire while 'lifted' awaits ensureServerCert. Without this
      // flag the listener would start after the lower and keep the port.
      let lowered = false;
      sails.on('lifted', async () => {
        const {agentTlsPort: port, agentTlsSans: sans, pkiDir} = sails.config.custom;
        if (!port) { return; }
        try {
          await pkiFiles.ensureServerCert(pkiDir, {sans});
        } catch (err) {
          if (err.code === 'E_AGENT_PKI_MISSING') {
            sails.log.warn(`Agent listener not started: ${err.message} Run npm run setup to make the agent CAs.`);
            return;
          }
          // Without a server pair there is nothing to listen with: stop here, so
          // startAgentListener does not log a second warning.
          const pair = ['server.pem', 'server.key'].every((name) => fs.existsSync(path.join(pkiDir, name)));
          sails.log.warn(`Agent listener${pair ? '' : ' not started'}: the server certificate could not be checked or made: ${err.message}`);
          if (!pair) { return; }
        }
        if (lowered) { return; }
        const server = startAgentListener(sails.hooks.http.app, {port, pkiDir});
        hook.server = server;
        // A failed listen leaves no listener: do not keep the server.
        if (server) {
          const clear = () => { if (hook.server === server) { hook.server = null; } };
          server.once('error', clear);
          server.once('listening', () => server.removeListener('error', clear));
        }
      });
      sails.on('lower', () => {
        lowered = true;
        if (!hook.server) { return; }
        hook.server.close();
        // Keep-alive connections would hold the server open.
        hook.server.closeAllConnections();
        hook.server = null;
      });
    }
  };
};

module.exports.startAgentListener = startAgentListener;
module.exports.agentPath = agentPath;
