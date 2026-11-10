/**
 * Sign a fog-agent CSR with the agent CA, as the FOG 1.6 signing helper does
 * (fog-sign-node-cert agent): the server sets the subject, the CSR subject is
 * ignored, and the certificate carries no SAN. The contract is
 * briefs/research/2026-11-10-agent-enroll-contract.md section 4.2.
 *
 * Inputs:
 *   csrPem  the CSR, PEM text (RSA or ECDSA key)
 *   hostId  the host number, digits only (1 to 10)
 *
 * Output {leafPem, chainPem}. chainPem is the agent CA only, not the root.
 *
 * Exits (a caller maps them; the enroll brief maps notConfigured to 503):
 *   badHostId      hostId is not 1 to 10 digits
 *   badCsr         not a CSR, does not parse, or its self-signature fails
 *   notConfigured  a CA file is missing from custom.pkiDir, or root.pem is not
 *                  the root that the Setting ROOT_SETTING records
 *   signFailed     the signing failed, or a result does not verify
 *
 * The CA key is read from custom.pkiDir on each call.
 *
 * Usage: let {leafPem, chainPem} = await sails.helpers.agent.signCsr.with({csrPem, hostId})
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const x509 = require('@peculiar/x509');
const pki = require('../../lib/agent-pki');

module.exports = {
  friendlyName: 'Sign an agent CSR',
  description: 'Issue a 365-day clientAuth certificate for an agent CSR from the agent CA.',
  inputs: {
    csrPem: {type: 'string', required: true, description: 'The CSR, PEM text.'},
    hostId: {type: 'string', required: true, description: 'The host number: 1 to 10 digits.'}
  },
  exits: {
    success: {outputType: 'ref', description: '{leafPem, chainPem}'},
    badHostId: {description: 'hostId is not 1 to 10 digits.'},
    badCsr: {description: 'The CSR is not valid, or its signature does not verify.'},
    notConfigured: {description: 'The agent CA files are missing, or the root is not the recorded one.'},
    signFailed: {description: 'The signing or its self-check failed.'}
  },
  fn: async function ({csrPem, hostId}) {
    // Same check as the 1.6 helper. It also keeps the subject text safe.
    if (!/^[0-9]{1,10}$/.test(hostId)) throw 'badHostId';

    // The marker, the parse and the self-signature: the check that enroll makes.
    let csr;
    try {
      csr = await sails.helpers.agent.verifyCsr(csrPem);
    } catch (unused) {
      throw 'badCsr';
    }

    const dir = sails.config.custom.pkiDir;
    const read = (name) => {
      try {
        return fs.readFileSync(path.join(dir, name), 'utf8');
      } catch (unused) {
        throw 'notConfigured';
      }
    };
    const rootPem = read('root.pem');
    const caPem = read('agent-ca.pem');
    const caKeyPem = read('agent-ca.key');

    // The root that enrolled agents pin is recorded by setup. Do not sign under
    // another root. Unset (an install before the guard): sign as before.
    const recorded = await sails.models.setting.findOne({name: pki.ROOT_SETTING});
    if (recorded && recorded.value) {
      let onDisk;
      try {
        onDisk = pki.fingerprintOf(rootPem);
      } catch (unused) {
        throw 'notConfigured';
      }
      if (onDisk !== recorded.value) throw 'notConfigured';
    }

    // Do not sign under an agent CA that the root did not issue.
    if (!pki.verifies(caPem, rootPem)) throw 'signFailed';

    let leafPem;
    try {
      // The agent CA key signs leaves only, so it is imported with SHA-256.
      const caKeys = await pki.importPair(crypto.createPrivateKey(caKeyPem), 'SHA-256');
      const ca = new x509.X509Certificate(caPem);
      const leaf = await x509.X509CertificateGenerator.create({
        serialNumber: pki.randomSerial(),
        subject: pki.subjectOf(pki.agentCn(hostId), 'FOG Agent'),
        issuer: ca.subjectName,
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 365 * pki.DAY_MS),
        signingAlgorithm: pki.RSA,
        publicKey: csr.publicKey,
        signingKey: caKeys.privateKey,
        extensions: [
          new x509.BasicConstraintsExtension(false, undefined, true),
          new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
          new x509.ExtendedKeyUsageExtension([pki.CLIENT_AUTH], false),
          await x509.SubjectKeyIdentifierExtension.create(csr.publicKey),
          await x509.AuthorityKeyIdentifierExtension.create(ca, false)
        ]
      });
      leafPem = leaf.toString('pem') + '\n';
    } catch (unused) {
      throw 'signFailed';
    }

    // The 1.6 helper runs `openssl verify` before it returns. This is the same gate.
    if (!pki.verifies(leafPem, caPem, true)) throw 'signFailed';

    return {leafPem, chainPem: caPem};
  }
};
