const _ = require('@sailshq/lodash'),
  path = require('path'),
  fs = require('fs'),
  Sails = require('sails').constructor,
  sailsApp = new Sails(),
  appPath = path.join(__dirname, '..', '..'),
  pkgPath = path.join(appPath, 'package.json'),
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
  preferences: require(`${appPath}/config/local.js`),
  package: safeReadJSON(pkgPath),
  sailsApp: sailsApp,
  getMergedSettings: () => {
    return _.merge(module.exports.preferences, module.exports.package);
  },
}
