const net = require('net');

// A free TCP port: listen on port 0, read the port the OS chose, close.
// 8443 and other fixed ports are often taken (a dev server, test:ui,
// test:install), so the tests that need a listener ask the OS instead.
const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.on('error', reject);
  probe.listen(0, () => {
    const {port} = probe.address();
    probe.close(() => resolve(port));
  });
});

module.exports = {freePort};
