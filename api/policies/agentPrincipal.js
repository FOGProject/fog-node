/**
 * agentPrincipal: who is this fog-agent? (contract 1.5, 5.4, 5.5)
 *
 * The agent proves itself with its client certificate on the agent listener
 * (api/hooks/agent-tls). This policy decides, in code, and does not trust the
 * TLS verdict (`req.socket.authorized`):
 *   1. A peer certificate arrived on the TLS socket.
 *   2. The leaf was issued by the agent CA, the agent CA by the root, now is in
 *      the dates of all three, the leaf has the clientAuth usage and is not a CA.
 *   3. The fingerprint of the leaf's public key binds to one host that is not
 *      pending (Host.agentFingerprint).
 * On success `req.agentHost` is that host. On failure it answers 401 with the
 * FOG 1.6 body, and only `unknown_certificate` makes the agent enroll again:
 *   no_client_certificate  steps 1 and 2
 *   unknown_certificate    no live, non-pending host has the key
 *   ambiguous_certificate  more than one has it
 *   server_error           the database failed
 *
 * The 1.6 definitions of "verifies" are in api/lib/agent-pki.js (`verifies`).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pki = require('../lib/agent-pki');

module.exports = async (req, res, proceed) => {
  const deny = (reason) => res.status(401).json({status: 'unauthorized', reason, error: 'client certificate required'});

  // 1. The certificate of the peer, from the TLS socket of the agent listener.
  const socket = req.socket;
  const peer = socket && socket.encrypted && socket.getPeerCertificate ? socket.getPeerCertificate(true) : null;
  if (!peer || !peer.raw) { return deny('no_client_certificate'); }

  // 2. The chain, the dates, the purpose.
  let leaf;
  try {
    leaf = new crypto.X509Certificate(peer.raw);
    const dir = sails.config.custom.pkiDir;
    const caPem = fs.readFileSync(path.join(dir, 'agent-ca.pem'), 'utf8');
    const rootPem = fs.readFileSync(path.join(dir, 'root.pem'), 'utf8');
    if (!pki.verifies(leaf.raw, caPem, true) || !pki.verifies(caPem, rootPem)) {
      return deny('no_client_certificate');
    }
    // 1.6 runs openssl_x509_checkpurpose, which checks the dates of every
    // certificate in the chain (Principal.php:123). So the agent CA and the
    // root must be in their dates too, not only the leaf.
    const now = Date.now();
    for (const cert of [leaf, new crypto.X509Certificate(caPem), new crypto.X509Certificate(rootPem)]) {
      if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) {
        return deny('no_client_certificate');
      }
    }
  } catch (unused) {
    return deny('no_client_certificate');
  }

  // 3. The host that the key is bound to.
  let hosts;
  try {
    hosts = await sails.models.host.find({agentFingerprint: sails.helpers.agent.keyFingerprint(leaf.toString()), pending: false}).limit(2);
  } catch (unused) {
    return deny('server_error');
  }
  if (hosts.length === 0) { return deny('unknown_certificate'); }
  if (hosts.length > 1) { return deny('ambiguous_certificate'); }
  req.agentHost = hosts[0];
  return proceed();
};
