const fs = require('fs');
const path = require('path');
const util = require('util');

// The fog-node log file. config/log.js hands create() to captains-log as its
// `custom` logger, so each sails.log.* call writes one line to the console and
// to <logDir>/fog-node.log. captains-log filters by sails.config.log.level
// before it calls the logger, so this module does no level filtering.
//
// All file work is synchronous: a line never arrives during a rotation, and
// no line is lost or reordered. Node built-ins only, so it runs on any OS.

const FILE = 'fog-node.log';
const MAX_BYTES = 10 * 1024 * 1024;
// The number of old files kept: fog-node.log.1 to fog-node.log.5.
const KEEP = 5;
// The folder when custom.logDir is not set: <app>/logs. config/log.js and the
// Log Viewer (api/helpers/log/files.js) both use it.
const FALLBACK_DIR = path.resolve(__dirname, '..', '..', 'logs');
// These levels go to stderr on the console, the rest to stdout.
const STDERR_LEVELS = new Set(['error', 'warn', 'crit']);
const LEVELS = ['log', 'error', 'warn', 'info', 'verbose', 'debug', 'silly', 'crit'];

// The log folder: sails.config.custom.logDir when it is a non-empty string,
// else fallbackDir. The Log Viewer calls this too, so the rule lives once.
const resolveDir = ({fallbackDir}) => {
  const custom = global.sails && global.sails.config && global.sails.config.custom;
  const dir = custom && custom.logDir;
  return typeof dir === 'string' && dir !== '' ? dir : fallbackDir;
};

// logDir and maxBytes are for tests. Without them the folder comes from
// resolveDir at the first write, and maxBytes is MAX_BYTES.
const create = ({fallbackDir, logDir, maxBytes = MAX_BYTES} = {}) => {
  let dir;
  let fd;
  let size = 0;
  // 'new' until the first write, 'open' with a file, 'off' after a failure
  // (the console only, until the next start).
  let state = 'new';
  // After a failed rotation: the size at which to try again.
  let retryAt = 0;

  const notice = (message) => process.stderr.write(`${new Date().toISOString()} error: ${message}\n`);
  const file = (n) => path.join(dir, n ? `${FILE}.${n}` : FILE);

  const open = () => {
    fd = fs.openSync(file(0), 'a');
    size = fs.fstatSync(fd).size;
  };

  const start = () => {
    dir = logDir || resolveDir({fallbackDir});
    try {
      fs.mkdirSync(dir, {recursive: true});
      open();
      state = 'open';
    } catch (err) {
      state = 'off';
      notice(`The log file in ${dir} cannot be opened, so fog-node logs to the console only: ${err.message}`);
    }
  };

  // Close the file, shift .4 to .5 ... .1 to .2, the file to .1, and open a
  // new file. A rename replaces its target, so the old .5 is gone.
  const rotate = () => {
    fs.closeSync(fd);
    try {
      for (let n = KEEP - 1; n >= 0; n--) {
        try {
          fs.renameSync(file(n), file(n + 1));
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }
      }
      open();
      retryAt = 0;
    } catch (err) {
      // On Windows another program can hold the file without share-delete.
      notice(`The log file in ${dir} cannot be rotated, so it grows for now: ${err.message}`);
      open();
      retryAt = size + maxBytes / 10;
    }
  };

  const writeFile = (text) => {
    if (state === 'new') start();
    if (state !== 'open') return;
    try {
      const bytes = Buffer.byteLength(text);
      if (size > 0 && size + bytes > maxBytes && size >= retryAt) rotate();
      fs.writeSync(fd, text);
      size += bytes;
    } catch (err) {
      state = 'off';
      notice(`The log file in ${dir} cannot be written, so fog-node logs to the console only: ${err.message}`);
    }
  };

  const write = (level, args) => {
    const text = (level === 'blank' ? '' : `${new Date().toISOString()} ${level}: ${util.format(...args)}`) + '\n';
    try {
      (STDERR_LEVELS.has(level) ? process.stderr : process.stdout).write(text);
    } catch {
      // A closed pipe must not stop the file log.
    }
    writeFile(text);
  };

  const logger = {blank: (...args) => write('blank', args)};
  for (const level of LEVELS) logger[level] = (...args) => write(level, args);
  return logger;
};

module.exports = {FILE, KEEP, FALLBACK_DIR, resolveDir, create};
