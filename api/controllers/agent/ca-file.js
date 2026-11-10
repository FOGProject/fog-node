/**
 * The public CA files, at the paths FOG 1.6 serves them. The agent downloads
 * ca.cert.pem to learn the server's CA (contract 4.4). No session is needed.
 *
 * The route names the file in its `file` option (config/routes.js):
 *   root.pem             the root CA, PEM
 *   root.der             the root CA, DER
 *   agent-ca-bundle.pem  the agent CA, then the root
 * A missing file answers 404.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

module.exports = {
  friendlyName: 'CA file',
  description: 'Serve the root CA or the agent CA bundle.',
  exits: {
    success: {description: 'The file.'}
  },
  fn: async function () {
    const res = this.res;
    const file = this.req.options.file;
    const source = file === 'root.der' ? 'root.pem' : file;
    let data;
    try {
      data = fs.readFileSync(path.join(sails.config.custom.pkiDir, source));
      if (file === 'root.der') data = new crypto.X509Certificate(data).raw;
    } catch (unused) {
      return res.sendStatus(404);
    }
    res.set('Content-Type', file === 'root.der' ? 'application/x-x509-ca-cert' : 'application/x-pem-file');
    return res.send(data);
  }
};
