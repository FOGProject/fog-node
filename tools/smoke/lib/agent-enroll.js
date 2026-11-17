/**
 * Enrolls a fog-agent over HTTP, as the agent sends it: a fresh key and a real
 * CSR to POST /agent/v1/enroll. Shared by the smoke checks that need an
 * enrollment (agent-admin.js, agent-activity.js).
 *
 * enroll(page, base, {hostname, macs, agentVersion, serial}) returns the
 * Playwright response. `macs` is a list of colon-form MACs (the route drops a
 * bare 12-digit MAC); an empty list makes no pending host. `agentVersion`
 * defaults to '1.0.0'; `serial` is the identity system_serial, left out when
 * unset.
 */
const crypto = require('crypto');
const x509 = require('@peculiar/x509');

module.exports = async function enroll(page, base, {hostname, macs = [], agentVersion = '1.0.0', serial}) {
  const keys = await crypto.webcrypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
  const csr = await x509.Pkcs10CertificateRequestGenerator.create({name: '', keys, signingAlgorithm: {name: 'ECDSA', hash: 'SHA-256'}});
  const identity = serial === undefined ? {macs} : {macs, system_serial: serial};
  return page.request.post(`${base}/agent/v1/enroll`, {
    data: {protocol: 1, agent_version: agentVersion, os: 'linux', arch: 'amd64', hostname, identity, csr_pem: csr.toString('pem')}
  });
};
