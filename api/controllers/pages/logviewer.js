const path = require('path');
const {LINES, DEFAULT_LINES} = require('../../lib/log-viewer');

// GET /logviewer: the FOG 1.6 Log Viewer (LogViewerManagement.php,
// status/logtoview.php), over the fog-node log file (api/lib/file-logger.js).
// It needs setting.read, as 1.6 maps logviewer onto its settings node
// (Authorization.php:87). The page script (views/pages/partials/logviewer.js)
// reads the lines from POST /api/v1/log/tail (api/controllers/log/tail.js).
module.exports = {
  friendlyName: 'Log Viewer',
  description: 'The Log Viewer page.',
  exits: {
    forbidden: {
      responseType: 'forbidden'
    },
    success: {
      viewTemplatePath: 'pages/logviewer'
    }
  },
  fn: async function () {
    if (!sails.helpers.audit.can(this.req, 'setting.read')) {
      throw 'forbidden';
    }
    return {
      section: 'Log Viewer',
      page: 'Log Viewer',
      // The files the files rule lists now: fog-node.log, then .1 to .5.
      files: sails.helpers.log.files().files.map((f) => f.name),
      // The Lines select and its default, as the tail action accepts them.
      lineChoices: LINES,
      defaultLines: DEFAULT_LINES,
      partialname: path.join(__dirname, '..', '..', '..', 'views', 'pages', 'partials', 'logviewer.js')
    };
  }
};
