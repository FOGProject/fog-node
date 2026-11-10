const assert = require('assert');
const {splitList, isWebUrl, toOrigins, urlHosts, defaultUrls, defaultImageStore} = require('../../tools/setup/lib/server-defaults');

describe('Installer server defaults ::', () => {
  it('splits a comma list and drops empty entries', () => {
    assert.deepStrictEqual(splitList(' http://a:1337 ,, http://b:1337, '), ['http://a:1337', 'http://b:1337']);
  });

  it('accepts only http and https URLs', () => {
    assert.strictEqual(isWebUrl('http://fog:1337'), true);
    assert.strictEqual(isWebUrl('https://fog.example.com'), true);
    assert.strictEqual(isWebUrl('ftp://fog'), false);
    assert.strictEqual(isWebUrl('fogserver'), false);
  });

  // onlyAllowOrigins compares the browser's Origin header exactly, so a path
  // or a repeat in the list would never match anything.
  it('reduces URLs to unique origins, with no path', () => {
    assert.deepStrictEqual(
      toOrigins(['http://127.0.0.1:1351/path', 'http://fog.local:1351', 'http://127.0.0.1:1351']),
      ['http://127.0.0.1:1351', 'http://fog.local:1351']
    );
  });

  it('defaults to the host name, localhost, and each external IPv4 address', () => {
    const interfaces = {
      lo: [{family: 'IPv4', internal: true, address: '127.0.0.1'}],
      eth0: [
        {family: 'IPv4', internal: false, address: '10.0.0.5'},
        {family: 'IPv6', internal: false, address: 'fe80::1'}
      ],
      // Node 18.0-18.3 reports family as a number.
      eth1: [{family: 4, internal: false, address: '192.168.1.9'}]
    };
    assert.deepStrictEqual(defaultUrls(interfaces, 'fogserver'),
      ['http://fogserver:1337', 'http://localhost:1337', 'http://10.0.0.5:1337', 'http://192.168.1.9:1337']);
  });

  // The server certificate of the agent listener names the host of each URL.
  it('takes the host of each URL, with no port and no IPv6 brackets', () => {
    assert.deepStrictEqual(urlHosts(['http://fog.example:1337', 'https://10.0.0.5', 'http://[::1]:1337']), ['fog.example', '10.0.0.5', '::1']);
  });

  // The macOS root volume is read-only, so /images cannot be created there.
  it('picks an image directory that each OS can create', () => {
    assert.strictEqual(defaultImageStore('win32'), 'C:\\fog\\images');
    assert.strictEqual(defaultImageStore('darwin'), '/Users/Shared/fog/images');
    assert.strictEqual(defaultImageStore('linux'), '/images');
  });
});
