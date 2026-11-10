const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const supertest = require('supertest');
const support = require('../support/pki');

// The public CA files at the FOG 1.6 paths. No session, so each request is a
// bare GET. supertest buffers a binary type only when parse says so.
describe('Agent CA files::', function () {
  this.timeout(120000);

  const fixtureDir = support.useFixture();

  const get = (url) => supertest(sails.hooks.http.app).get(url)
    .buffer(true).parse((res, done) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
  const file = (name) => fs.readFileSync(path.join(fixtureDir(), name));

  it('serves the root PEM', async () => {
    const res = await get('/management/other/ca.cert.pem').expect(200).expect('Content-Type', /application\/x-pem-file/);
    assert.deepStrictEqual(res.body, file('root.pem'));
  });

  it('serves the root in DER', async () => {
    const res = await get('/management/other/ca.cert.der').expect(200).expect('Content-Type', /application\/x-x509-ca-cert/);
    assert.deepStrictEqual(res.body, new crypto.X509Certificate(file('root.pem')).raw);
  });

  it('serves the agent CA bundle', async () => {
    const res = await get('/management/other/agent-ca-bundle.pem').expect(200).expect('Content-Type', /application\/x-pem-file/);
    assert.deepStrictEqual(res.body, file('agent-ca-bundle.pem'));
  });

  it('answers 404 for each file when it is missing', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'fog-pki-empty-'));
    sails.config.custom.pkiDir = empty;
    try {
      for (const url of ['ca.cert.pem', 'ca.cert.der', 'agent-ca-bundle.pem']) {
        await get(`/management/other/${url}`).expect(404);
      }
    } finally {
      sails.config.custom.pkiDir = fixtureDir();
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });
});
