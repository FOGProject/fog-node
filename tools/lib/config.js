const _ = require('@sailshq/lodash');
const path = require('path');
const fs = require('fs');
const appPath = path.join(__dirname, '..', '..');
const pkgPath = path.join(appPath, 'package.json');
const cfgPath = path.join(appPath, 'config');
const localCfg = path.join(cfgPath, 'local.js');
const safeReadJSON = function(filepath) {
  if (!fs.existsSync(filepath)) return {};
  let raw;
  try {
    raw = fs.readFileSync(filepath, 'utf8');
  } catch (err) {
    console.log(err);
    return {};
  }
  return JSON.parse(raw) || {};
};

module.exports = {
  appPath: appPath,
  package: safeReadJSON(pkgPath),
  getMergedSettings: () => {
    let preferences = require(localCfg);
    return _.merge(preferences, module.exports.package);
  },
};
