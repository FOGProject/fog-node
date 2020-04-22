const fs = require('fs'),
  path = require('path'),
  pluginDir = path.join(__dirname, '..', '..', '..', 'node_modules'),
  pluginPrefix = 'fog-plugin-',
  pluginPackageFile = 'package.json',
  resolveFunction = (name) => {
    let scope = name.split('.'),
      fnc = global;
    for (var i = 0; i < scope.length; i++) {
      fnc = fnc[scope[i]];
      if (typeof fnc === undefined) return undefined;
    }
    return fnc;
  };
module.exports = {
  friendlyName: 'Register hooks',
  description: 'Registers plugin hooks',
  inputs: {
    name: {
      friendlyName: 'Plugin Name',
      description: 'Name of the plugin',
      type: 'string',
      required: true
    }
  },
  fn: async function (inputs, exits) {
    let name = inputs.name,
      configFile = path.join(pluginDir, pluginPrefix + name, pluginPackageFile);
    sails.log.info(`Registering [${name}] hooks`);
    await fs.exists(configFile, async (exists) => {
      if (!exists) {
        sails.log.debug(`Plugin [${name}] config file [${configFile}] does not exist`);
        return exits.success();
      }

      // Load the info but not using require to limit attack vector
      await fs.readFile(configFile, 'utf8', async (err, data) => {
        if (err) {
          sails.log.error(err);
          return exits.error(err);
        }
        if (!data) {
          sails.log.debug('No data is present');
          return exits.success();
        }

        let config = JSON.parse(data),
          hookKeys = Object.keys(config.fog.hooks);
        hookKeys.forEach(async (key) => {
          let fnName = config.fog.hooks[key].trim();
          if (!fnName) {
            sails.log.error(`No function name provided when registering [${key}] for [${name}]`);
            return exits.success();
          }
          let fnc = await resolveFunction(fnName);
          if (typeof fnc !== 'function') {
            sails.log.error(`Failed to register [${key}] for [${name}], [${fnName}] is not a function`);
            return exits.success();
          }
          sails.log.info(`Registering [${fnName}] on event [${key}] for [${name}]`);
          return exits.success();
        });
      });
    });
  }
};
