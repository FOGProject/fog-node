const net = require('net');

// Encode one command in the Redis wire protocol (RESP). An array of bulk
// strings is safe for any byte in a password, unlike an inline command.
const encode = (args) => `*${args.length}\r\n` +
  args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join('');

module.exports = {
  // Check that the Redis at `url` answers PING, after AUTH and SELECT when the
  // URL carries a password or a database number. The installer calls this so
  // that a missing Redis fails at install time, not at the first login: the
  // session store lives in Redis, and CSRF (so login) needs the session.
  // No client library: `redis` is only a transitive dependency here.
  verify: (url, next) => {
    let u;
    try {
      u = new URL(url);
    } catch (unused) {
      return next(new Error(`Not a valid URL: ${url}`));
    }
    if (u.protocol !== 'redis:') return next(new Error('The URL must start with redis://'));
    const cmds = [];
    if (u.password) {
      const pw = decodeURIComponent(u.password);
      cmds.push(u.username ? ['AUTH', decodeURIComponent(u.username), pw] : ['AUTH', pw]);
    }
    const db = u.pathname.replace('/', '');
    if (db) cmds.push(['SELECT', db]);
    cmds.push(['PING']);

    let buf = '';
    let done = false;
    let sock;
    const finish = (err) => {
      if (done) return;
      done = true;
      sock.destroy();
      next(err);
    };
    // URL keeps the brackets on an IPv6 host ("[::1]"); net.connect wants "::1".
    const host = u.hostname.replace(/^\[(.*)\]$/, '$1');
    sock = net.connect({host: host, port: Number(u.port) || 6379});
    sock.setTimeout(5000, () => finish(new Error('No answer from Redis within 5 seconds')));
    sock.on('error', finish);
    sock.on('connect', () => sock.write(cmds.map(encode).join('')));
    sock.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\r\n').filter((l) => l.length);
      const bad = lines.find((l) => l.startsWith('-'));
      if (bad) return finish(new Error(bad.slice(1)));
      if (lines.length >= cmds.length) {
        if (lines[lines.length - 1] === '+PONG') return finish();
        return finish(new Error(`Unexpected reply: ${lines[lines.length - 1]}`));
      }
    });
  }
};
