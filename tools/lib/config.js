const _ = require('@sailshq/lodash'),
  path = require('path'),
  fs = require('fs'),
  appPath = path.join(__dirname, '..', '..'),
  pkgPath = path.join(appPath, 'package.json'),
  cfgPath = path.join(appPath, 'config'),
  localCfg = path.join(cfgPath, 'local.js'),
  safeReadJSON = function(filepath) {
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
}
