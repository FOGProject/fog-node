/**
 * Try the automatic approval of a pending fog-agent enrollment and, when one
 * applies, issue the certificate (contract 3.5, without the directory feature
 * guard; Enrollment::_autoApproval and _issueNow). In this order:
 *
 *   1. Token: the trimmed `token` is not empty, and its sha256 hex finds a row
 *      that has not expired and has a use left. One use is reserved with a
 *      single conditional update, so two requests that race for the last use
 *      cannot both win. A use of -1 is unlimited and never changes. If the
 *      signing then fails, the use is given back, so a failed sign spends
 *      nothing (the 1.6 quirk, fixed).
 *   2. Deploy: the row is bound, its reason is known-host-no-agent or rebind,
 *      and the host's `deployed` time is within the Setting
 *      FOG_AGENT_ENROLL_DEPLOY_WINDOW hours before now (default 24, below 1
 *      disables). Nothing in fog-node writes `deployed` yet.
 *   3. Otherwise the request waits.
 *
 * A row with no host (no-mac) never auto-approves.
 *
 * Inputs: row (an AgentEnrollment record), token (any text, '' for none), req
 * (optional, for the audit row that issue writes).
 * Output: null when the request waits, else {pem, agentId, notAfter} from issue.
 * Exit signing: an approval applied but the issue failed. The row stays pending.
 *
 * Usage: let issued = await sails.helpers.agent.autoApprove.with({row, token})
 */
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_WINDOW_HOURS = 24;

module.exports = {
  friendlyName: 'Auto-approve an agent enrollment',
  description: 'Issue the certificate at once when a valid token or a recent deploy vouches for the host.',
  inputs: {
    row: {type: 'ref', required: true},
    token: {type: 'string', defaultsTo: ''},
    req: {type: 'ref', defaultsTo: null, description: 'The request, for the audit row of an issue.'}
  },
  exits: {
    success: {outputType: 'ref', description: 'null, or {pem, agentId, notAfter}.'},
    signing: {description: 'The issue failed.'}
  },
  fn: async function ({row, token, req}) {
    if (!row.host) { return null; }

    // Reserve a token use.
    const tokens = sails.getDatastore(sails.models.agentenrolltoken.datastore).manager.collection(sails.models.agentenrolltoken.tableName);
    const secret = token.trim();
    const hash = sails.models.agentenrolltoken.hashOf(secret);
    let reserved = false;
    let via = '';
    if (secret) {
      const now = Date.now();
      const found = await tokens.findOne({hash});
      if (found && found.expires > now) {
        if (found.uses === -1) {
          via = 'token';
        } else {
          const taken = await tokens.updateOne({hash, expires: {$gt: now}, uses: {$gt: 0}}, {$inc: {uses: -1}});
          reserved = taken.modifiedCount === 1;
          if (reserved) { via = 'token'; }
        }
      }
    }

    if (!via && ['known-host-no-agent', 'rebind'].includes(row.reason)) {
      const setting = await sails.models.setting.findOne({name: 'FOG_AGENT_ENROLL_DEPLOY_WINDOW'});
      const window = setting ? Number(setting.value) : DEFAULT_WINDOW_HOURS;
      const hours = Number.isNaN(window) ? DEFAULT_WINDOW_HOURS : window;
      const host = hours >= 1 ? await sails.models.host.findOne({id: row.host}) : undefined;
      const deployed = host ? Date.parse(host.deployed) : NaN;
      if (!Number.isNaN(deployed) && deployed <= Date.now() && Date.now() - deployed <= hours * HOUR_MS) {
        via = 'deploy';
      }
    }
    if (!via) { return null; }

    try {
      return await sails.helpers.agent.issue.with({row, via, by: '', keepCert: false, req});
    } catch (unused) {
      if (reserved) { await tokens.updateOne({hash}, {$inc: {uses: 1}}); }
      throw 'signing';
    }
  }
};
