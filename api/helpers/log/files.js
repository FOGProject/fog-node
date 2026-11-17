const fs = require('fs');
const path = require('path');
const {FILE, KEEP, FALLBACK_DIR, resolveDir} = require('../../lib/file-logger');

/**
 * The files rule of the Log Viewer: which log files a browser may read.
 *
 * Outputs: {dir, files}. `dir` is the log folder, read on each call
 * (api/lib/file-logger.js resolveDir). `files` is a list of {name, dev, ino},
 * in the order fog-node.log, .1 ... .5. A name is listed only when it matches
 * exactly `fog-node.log` with an optional `.1` to `.5`, AND lstat reports a
 * regular file there. A symlink, a folder or anything else is not listed.
 * dev and ino are bigint (an NTFS file index is 64-bit). The tail action
 * compares them with the file it opens, so a file swapped after this call is
 * refused. Nothing outside this list is ever read.
 *
 * The fallback folder is the one config/log.js gives the logger, so the
 * viewer reads the folder that the logger writes.
 */
const NAMES = [FILE, ...Array.from({length: KEEP}, (_, i) => `${FILE}.${i + 1}`)];

module.exports = {
  friendlyName: 'Log files',
  description: 'The log files that the Log Viewer may read.',
  sync: true,
  exits: {
    success: {outputType: 'ref', description: '{dir, files: [{name, dev, ino}]}.'}
  },
  fn: function () {
    const dir = resolveDir({fallbackDir: FALLBACK_DIR});
    const files = [];
    for (const name of NAMES) {
      let st;
      try {
        st = fs.lstatSync(path.join(dir, name), {bigint: true});
      } catch {
        // Missing, or not readable: not listed.
        continue;
      }
      if (st.isFile()) files.push({name, dev: st.dev, ino: st.ino});
    }
    return {dir, files};
  }
};
