const os = require('os');

// Pure helpers for the installer's server questions. They live here, not in
// inquire.js, so test/setup/server-defaults.test.js can test them without a
// terminal prompt.

const splitList = (value) => value.split(',').map((v) => v.trim()).filter((v) => v.length);

const isWebUrl = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (unused) {
    return false;
  }
};

// onlyAllowOrigins takes origins (scheme, host and port), with no path and no
// repeats.
const toOrigins = (urls) => [...new Set(urls.map((v) => new URL(v).origin))];

// This computer's name, localhost, and each external IPv4 address, on
// fog-node's default port. FOG admins often browse by IP, so the IPs are in
// the default. Node 18.0-18.3 reports `family` as the number 4.
const defaultUrls = (interfaces = os.networkInterfaces(), hostname = os.hostname()) => {
  const ips = Object.values(interfaces).flat()
    .filter((a) => a && (a.family === 'IPv4' || a.family === 4) && !a.internal)
    .map((a) => a.address);
  return [hostname, 'localhost', ...ips].map((h) => `http://${h}:1337`);
};

// macOS has a read-only root volume, so /images cannot be created there.
const defaultImageStore = (platform = process.platform) => {
  if (platform === 'win32') return 'C:\\fog\\images';
  if (platform === 'darwin') return '/Users/Shared/fog/images';
  return '/images';
};

module.exports = {splitList, isWebUrl, toOrigins, defaultUrls, defaultImageStore};
