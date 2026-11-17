/**
 * POST /agent/v1/poll (minimal; contract 1.6)
 *
 * The heartbeat of an enrolled fog-agent. The policy agentPrincipal proved the
 * certificate and set req.agentHost. It writes agentCheckin (now) and, when the
 * body has `agent_version`, agentVersion (normalized as at enroll). It answers
 * 200 with the 1.6 shape. The `state` object is required: without it a fresh
 * agent logs "poll: the revision moved but the server sent no state". With an
 * empty capability list it reconciles nothing and sends no /result.
 *
 * It returns no tasks, payloads or facts requests; those are later briefs.
 * This route writes no audit row.
 */
const {jsonBody, version} = require('../../lib/agent-pki');

module.exports = {
  friendlyName: 'Agent poll',
  description: 'Record the check-in of a fog-agent and answer with the minimal poll state.',
  exits: {
    success: {description: 'The answer is in the response.'}
  },
  fn: async function () {
    const req = this.req;
    const res = this.res;
    const host = req.agentHost;
    const body = jsonBody(req);

    const set = {agentCheckin: Date.now()};
    const agentVersion = version(body.agent_version);
    if (agentVersion) { set.agentVersion = agentVersion; }
    await sails.models.host.updateOne({id: host.id}).set(set);

    // An integer, with the 1.6 default of 60: config/fog-settings.js holds the rule.
    const interval = await sails.helpers.settings.get('FOG_CLIENT_CHECKIN_TIME');

    return res.status(200).json({
      status: 'ok',
      protocol: 1,
      host: {id: host.agentId, name: host.name},
      revision: '',
      state: {revision: '', capabilities: []},
      poll_interval: interval,
      // ISO 8601 with an offset, as 1.6 sends it (Route.php:3207, format('c')).
      server_time: new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00')
    });
  }
};
