/**
 * POST /agent/v1/enroll
 *
 * A fog-agent sends a CSR and its identity, waits while the request is pending,
 * and collects its certificate when an admin approves it, or at once with a valid
 * enroll token or just after an imaging. The wire contract is FOG 1.6's, so the
 * same agent binary works against both servers: copy the statuses, the JSON keys
 * and the strings exactly (briefs/research/2026-11-10-agent-enroll-contract.md,
 * section 1.1 for the bodies, 3.1 for the order). The Windows directory feature
 * (`features`, `_directoryIdentity`) is out of scope and ignored.
 *
 *   426 {status: unsupported, reason: protocol}   protocol is not 1
 *   400 {status: error, reason: csr}              the CSR does not verify
 *   403 {status: denied, reason: admin}           the row is denied
 *   200 {status: issued, host_id, certificate_pem, not_after}
 *   202 {status: pending, reason, retry_after: 300}
 *   503 {status: error, reason: signing}          signing failed, the row stays pending
 *
 * The lookup key is the fingerprint of the CSR's public key. A repeat is
 * answered from the row and never re-resolves the host. The CSR of the FIRST
 * request is the one that is signed. No session: the route is public, as boot.
 */
const net = require('net');
const {leafInfo} = require('../../lib/agent-pki');

const RETRY_AFTER = 300;
const MAC = /^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

// The field limits of the 1.6 columns, so a public caller cannot store more.
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

// Update::normalize: trim, and strip one leading v or V.
const version = (value) => {
  const v = text(value, 50).trim();
  return /^[vV]/.test(v) ? v.slice(1) : v;
};

// The valid MACs in the Host `macs` form (12 lower-case hex digits), no repeats.
const macsOf = (list) => {
  const out = [];
  for (const entry of list) {
    const mac = entry.replace(/[:-]/g, '').toLowerCase();
    if (!out.includes(mac)) { out.push(mac); }
  }
  return out;
};

// A CSR is about 500 characters (ECDSA P-256) and an RSA-4096 CSR about 1800.
// 16384 leaves room for any real key, and stops a caller from making the
// public route parse and store a huge value.
const MAX_CSR = 16384;
const MAX_MACS = 32;
// The caps for the stored identity fields and the enroll token. No real
// firmware string or minted token (48 hex) comes near them.
const MAX_IDENTITY_FIELD = 256;
const MAX_SMBIOS_VERSION = 32;
const MAX_WARNINGS = 16;
const MAX_TOKEN = 256;

// The identity keys that the contract defines (section 1.1), and nothing else.
// 1.6 stores the whole object, but this route is public, so the row keeps the
// known keys only, each with a cap. The server-owned _directoryIdentity is
// never accepted. `macs` keeps at most MAX_MACS entries that are valid MACs.
const identityOf = (raw) => {
  const given = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const out = {};
  for (const key of ['system_uuid', 'system_serial', 'board_serial', 'chassis_asset']) {
    out[key] = text(given[key], MAX_IDENTITY_FIELD);
  }
  if (typeof given.smbios_version === 'string' && given.smbios_version) { out.smbios_version = text(given.smbios_version, MAX_SMBIOS_VERSION); }
  out.macs = (Array.isArray(given.macs) ? given.macs : [])
    .filter((m) => typeof m === 'string' && MAC.test(m)).slice(0, MAX_MACS);
  if (Array.isArray(given.warnings) && given.warnings.length) {
    out.warnings = given.warnings.filter((w) => typeof w === 'string').slice(0, MAX_WARNINGS).map((w) => text(w, MAX_IDENTITY_FIELD));
  }
  return out;
};

module.exports = {
  friendlyName: 'Agent enroll',
  description: 'Enroll a fog-agent: answer a CSR with pending, issued or denied.',
  exits: {
    success: {description: 'The answer is in the response.'}
  },
  fn: async function () {
    const req = this.req;
    const res = this.res;
    const Enrollment = sails.models.agentenrollment;
    const body = (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) ? req.body : {};

    const pending = (row) => res.status(202).json({status: 'pending', reason: row.reason, retry_after: RETRY_AFTER});
    const issued = (result) => res.status(200).json({
      status: 'issued',
      host_id: result.agentId,
      certificate_pem: result.pem,
      not_after: result.notAfter
    });
    const signing = () => res.status(503).json({status: 'error', reason: 'signing'});
    // Run the automatic approval; answer 200, 503 or (when it waits) 202.
    const autoApprove = async (row) => {
      try {
        const result = await sails.helpers.agent.autoApprove.with({row, token: text(body.token, MAX_TOKEN)});
        return result ? issued(result) : pending(row);
      } catch (unused) {
        return signing();
      }
    };

    // 1. Protocol.
    const protocol = (typeof body.protocol === 'number' || typeof body.protocol === 'string') ? Number(body.protocol) : 0;
    if (protocol !== 1) {
      return res.status(426).json({status: 'unsupported', reason: 'protocol'});
    }

    // 2. The CSR, and its key fingerprint.
    const csr = (typeof body.csr_pem === 'string' && body.csr_pem.length <= MAX_CSR) ? body.csr_pem : '';
    let fingerprint;
    try {
      await sails.helpers.agent.verifyCsr(csr);
      fingerprint = sails.helpers.agent.keyFingerprint(csr);
    } catch (unused) {
      return res.status(400).json({status: 'error', reason: 'csr'});
    }
    const identity = identityOf(body.identity);
    const agentVersion = version(body.agent_version);
    const hostname = text(body.hostname, 191);
    const os = text(body.os, 20);
    const arch = text(body.arch, 20);
    const remoteIp = net.isIP(req.ip || '') ? req.ip : '';

    // The state machine of contract 2.1, for a row that exists.
    const answerFromRow = async (found) => {
      if (found.state === 'denied') {
        await Enrollment.updateOne({id: found.id}).set({remoteIp, agentVersion});
        return res.status(403).json({status: 'denied', reason: 'admin'});
      }
      if (found.state === 'issued' && found.cert !== '') {
        // Approved since the last request. Hand the certificate over once, as
        // 1.6 does, even if the host is gone since (the agent then gets 401
        // unknown_certificate and enrolls again).
        // The 1.6 _issuedPayload takes host_id and not_after from the host. The
        // host may be gone, so leafInfo reads both from the stored leaf: the CN
        // number (the agent number the agent stores as host_id) and notAfter.
        // Parse before clearing, so a bad stored leaf never loses the cert.
        const leaf = leafInfo(found.cert);
        await Enrollment.updateOne({id: found.id}).set({cert: ''});
        return issued({agentId: leaf.agentId, pem: found.cert, notAfter: leaf.notAfter});
      }
      if (found.state === 'issued') {
        // The agent lost its certificate but kept its key. An admin looks at it.
        return pending(await Enrollment.updateOne({id: found.id}).set({state: 'pending', reason: 'reissue'}));
      }
      // Still pending: refresh the row, and re-check the automatic paths. A
      // token may be valid now, or the deploy may have finished.
      return await autoApprove(await Enrollment.updateOne({id: found.id}).set({
        agentVersion, hostname, os, remoteIp
      }));
    };

    // 4. A row for this key answers the request.
    let row = await Enrollment.findOne({fingerprint});
    if (row) { return await answerFromRow(row); }

    // 3. The valid MACs, then 5. the first contact for this key.
    const macs = macsOf(identity.macs);
    const resolved = await sails.helpers.agent.resolveHost.with({identity, macs});
    // Unknown machine with no MAC: no pending host (a host needs a MAC to be addressed).
    const reason = (resolved.reason === 'unknown-host' && !macs.length) ? 'no-mac' : resolved.reason;
    try {
      row = await Enrollment.create({
        host: resolved.hostId,
        fingerprint,
        csr,
        identity,
        hostname,
        os,
        arch,
        agentVersion,
        remoteIp,
        reason,
        state: 'pending',
        cert: ''
      }).fetch();
    } catch (err) {
      // Two first requests for one key: the unique index kept the first row.
      if (err && err.code === 'E_UNIQUE') {
        row = await Enrollment.findOne({fingerprint});
        return await answerFromRow(row);
      }
      throw err;
    }
    if (reason === 'unknown-host') {
      const host = await sails.helpers.agent.createPendingHost.with({
        hostname, fingerprint, macs, smbios: resolved.smbios
      });
      row = await Enrollment.updateOne({id: row.id}).set({host: host.id});
    }
    return await autoApprove(row);
  }
};
