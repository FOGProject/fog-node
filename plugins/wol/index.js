/**
 * wol plugin
 *
 * Wake-on-LAN: sends a magic packet to a host's MAC address(es). Demonstrates
 * the fog-node plugin contract (a management feature added as a plugin, not in
 * the imaging core). Enabled via plugins.json.
 */
const dgram = require('dgram');

function sendMagicPacket(mac) {
  return new Promise((resolve, reject) => {
    let hex = String(mac).replace(/[^0-9a-fA-F]/g, '');
    if (hex.length !== 12) { return reject(new Error(`Invalid MAC: ${mac}`)); }
    let macBuf = Buffer.from(hex, 'hex'),
      parts = [Buffer.alloc(6, 0xff)];
    for (let i = 0; i < 16; i++) { parts.push(macBuf); }
    let packet = Buffer.concat(parts), // 6 + 16*6 = 102 bytes
      socket = dgram.createSocket('udp4');
    socket.once('error', (err) => { socket.close(); reject(err); });
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, 9, '255.255.255.255', (err) => {
        socket.close();
        return err ? reject(err) : resolve();
      });
    });
  });
}

module.exports = {
  name: 'wol',
  routes: {
    'POST /api/v1/host/:id/wol': async function (req, res) {
      // Plugin routes aren't covered by the core action policies, so guard here.
      if (!req.user) { return res.forbidden(); }
      let host = await sails.models.host.findOne({ id: req.param('id') });
      if (!host) { return res.notFound(); }
      let macs = Array.isArray(host.macs) ? host.macs : (host.macs ? [host.macs] : []),
        sent = [], failed = [];
      for (let mac of macs) {
        try { await sendMagicPacket(mac); sent.push(mac); } catch (err) { failed.push(mac); }
      }
      return res.json({ host: host.name, sent, failed });
    }
  }
};
