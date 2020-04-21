const _ = require('@sailshq/lodash'),
  crypto = require('crypto'),
  forge = require('node-forge'),
  rsa = forge.pki.rsa;

module.exports = {
  generateSecret: () => {
    let factors = {
      creationDate: (new Date()).getTime(),
      random: Math.random() * (Math.random() * 1000),
      nodeVersion: process.version
    },
      basestring = '';

    _.each(factors, (val) => {
      basestring += val;
    });

    return crypto.createHash('sha256').update(basestring).digest('hex');
  },
  generateKeypair: (next) => {
    rsa.generateKeyPair({bits: 4096, workers: -1}, next);
  }
};
