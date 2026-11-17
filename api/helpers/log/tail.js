const fs = require('fs');

/**
 * The last lines of an open file, for the Log Viewer.
 *
 * Inputs: fd (an open file), size (its size in bytes), lines (how many).
 * Outputs: {lines, bytesRead}, the lines oldest first.
 *
 * It reads backwards from the end in CHUNK-byte reads and keeps the raw
 * buffers. It stops when the bytes read hold more than `lines` newline bytes
 * (0x0A), at the start of the file, or at MAX_READ bytes. It then joins the
 * buffers, splits on 0x0A and decodes each line as UTF-8. A newline byte never
 * occurs inside a multibyte character, so no character is split. A trailing
 * newline does not make an empty last line. A last line with no newline (still
 * being written) counts. When the read did not reach the start of the file,
 * the first line may be partial, so it is dropped.
 */
const {CHUNK, MAX_READ} = require('../../lib/log-viewer');
const NEWLINE = 0x0A;

const countNewlines = (buf) => {
  let n = 0;
  for (let i = buf.indexOf(NEWLINE); i !== -1; i = buf.indexOf(NEWLINE, i + 1)) n++;
  return n;
};

module.exports = {
  friendlyName: 'Tail a file',
  description: 'The last lines of an open file.',
  sync: true,
  inputs: {
    fd: {type: 'number', required: true},
    size: {type: 'number', required: true},
    lines: {type: 'number', required: true}
  },
  exits: {
    success: {outputType: 'ref', description: '{lines, bytesRead}.'}
  },
  fn: function ({fd, size, lines}) {
    const buffers = [];
    let pos = size;
    let bytesRead = 0;
    let newlines = 0;
    let cut = false;
    while (pos > 0 && bytesRead < MAX_READ && newlines <= lines) {
      const length = Math.min(CHUNK, pos, MAX_READ - bytesRead);
      pos -= length;
      const buf = Buffer.alloc(length);
      // readSync can return fewer bytes than asked: read until the chunk is full.
      let got = 0;
      while (got < length) {
        const n = fs.readSync(fd, buf, got, length - got, pos + got);
        if (n === 0) break;
        got += n;
      }
      // The file shrank under the read. This chunk is not whole, and the bytes
      // before it are not the bytes that came before it: stop, and keep only
      // the chunks already read in full. The first line is then not known to
      // be whole, so it is dropped below.
      if (got < length) {
        cut = true;
        break;
      }
      buffers.unshift(buf);
      bytesRead += length;
      newlines += countNewlines(buf);
    }
    if (bytesRead === 0) return {lines: [], bytesRead};

    const data = Buffer.concat(buffers);
    const parts = [];
    let from = 0;
    for (let i = data.indexOf(NEWLINE); i !== -1; i = data.indexOf(NEWLINE, from)) {
      parts.push(data.subarray(from, i));
      from = i + 1;
    }
    // Bytes after the last newline are a line with no newline yet. None means
    // the data ended with a newline: no empty last line.
    if (from < data.length) parts.push(data.subarray(from));
    // The read began inside the file: the first line may be partial.
    if (pos > 0 || cut) parts.shift();
    return {lines: parts.slice(-lines).map((part) => part.toString('utf8')), bytesRead};
  }
};
