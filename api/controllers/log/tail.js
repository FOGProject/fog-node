const fs = require('fs');
const path = require('path');
const {LINES, DEFAULT_LINES} = require('../../lib/log-viewer');

/**
 * POST /api/v1/log/tail
 *
 * The last lines of one fog-node log file, for the Log Viewer page
 * (GET /logviewer). Body {file, lines, reverse}. Answers {file, lines: [...]},
 * oldest first, or newest first when `reverse`. Needs setting.read.
 *
 * `file` must be a name that the files rule lists (api/helpers/log/files.js).
 * The path is built here from the folder and that name, never from the client.
 * After the open, fstat must give the same dev and ino as the listed file: a
 * file swapped in between (for example for a symlink) answers 400. A rotation
 * between the list and the open gives the same 400 for a moment; the next poll
 * of the page reads the new file. O_NOFOLLOW does not exist on Windows, so
 * this check is the guard.
 */

// A number, or a string of digits, whose value is in LINES; else the default.
const parseLines = (value) => {
  const n = typeof value === 'number' ? value : (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN);
  return LINES.includes(n) ? n : DEFAULT_LINES;
};

module.exports = {
  friendlyName: 'Log tail',
  description: 'The last lines of a fog-node log file.',
  fn: async function () {
    const req = this.req;
    const res = this.res;
    if (!sails.helpers.audit.can(req, 'setting.read')) {
      return res.forbidden();
    }
    const body = req.body || {};
    const unknown = () => res.status(400).json({error: 'Unknown log file.'});
    const {dir, files} = sails.helpers.log.files();
    const entry = typeof body.file === 'string' ? files.find((f) => f.name === body.file) : undefined;
    if (!entry) { return unknown(); }
    const lines = parseLines(body.lines);
    const reverse = body.reverse === true || body.reverse === 'true';

    let fd;
    try {
      fd = fs.openSync(path.join(dir, entry.name), 'r');
      const st = fs.fstatSync(fd, {bigint: true});
      if (!st.isFile() || st.dev !== entry.dev || st.ino !== entry.ino) {
        return unknown();
      }
      const tail = sails.helpers.log.tail.with({fd, size: Number(st.size), lines});
      return res.json({file: entry.name, lines: reverse ? tail.lines.reverse() : tail.lines});
    } catch (err) {
      // The file is gone: an empty answer, as a log that has no lines yet.
      if (err.code === 'ENOENT') { return res.json({file: entry.name, lines: []}); }
      sails.log.warn(`The Log Viewer cannot read ${entry.name}: ${err.message}`);
      return res.status(500).json({error: 'Cannot read the log file.'});
    } finally {
      if (fd !== undefined) { fs.closeSync(fd); }
    }
  }
};
