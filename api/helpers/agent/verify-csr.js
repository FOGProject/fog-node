/**
 * Check a fog-agent CSR: it carries the CSR marker, it parses, and it is signed
 * by the key it carries (proof of possession). signCsr and the enroll route
 * share this check, so a CSR that passes at enroll also passes at approve.
 *
 * Input: the CSR, PEM text.
 * Output: the parsed Pkcs10CertificateRequest (@peculiar/x509).
 * Exit invalid: the text is not a CSR, does not parse, or its signature fails.
 *
 * Usage: let csr = await sails.helpers.agent.verifyCsr(csrPem)
 */
const x509 = require('@peculiar/x509');
const pki = require('../../lib/agent-pki');

module.exports = {
  friendlyName: 'Verify an agent CSR',
  description: 'Check the marker, the parse and the self-signature of a CSR.',
  inputs: {
    csrPem: {type: 'string', required: true, description: 'The CSR, PEM text.'}
  },
  exits: {
    success: {outputType: 'ref', description: 'The parsed CSR.'},
    invalid: {description: 'Not a CSR, or its signature does not verify.'}
  },
  fn: async function ({csrPem}) {
    try {
      if (!pki.isCsrPem(csrPem)) throw new Error('not a CSR');
      const csr = new x509.Pkcs10CertificateRequest(csrPem);
      // Proof of possession: the CSR is signed by the key it carries.
      if (!(await csr.verify())) throw new Error('bad signature');
      return csr;
    } catch (unused) {
      throw 'invalid';
    }
  }
};
