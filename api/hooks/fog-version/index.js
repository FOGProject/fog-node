/**
 * fog-version hook
 *
 * @description :: A hook definition.  Extends Sails by adding shadow routes, implicit actions, and/or initialization logic.
 * @docs        :: https://sailsjs.com/docs/concepts/extending-sails/hooks
 */
const path = require('path'),
  fs = require('fs'),
  appPath = path.join(__dirname, '..', '..', '..'),
  pkgPath = path.join(appPath, 'package.json'),
  safeReadJSON = filepath => {
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
module.exports = function defineFogVersionHook(sails) {
  return {
    routes: {
      /**
       * Runs before every matching route.
       *
       * @param {Ref} req
       * @param {Ref} res
       * @param {Function} next
       */
      before: {
        '/*': {
          skipAssets: true,
          fn: async function(req, res, next) {
            let pkg = safeReadJSON(pkgPath);
            // add version to each response
            if (req.method === 'GET') {
              if (res.locals.version === undefined) {
                res.locals.version = pkg.version;
              }
            }
            return next();
          }
        }
      }
    }
  };
};
