const fs = require('fs'),
  path = require('path'),
  pluginDir = path.join(__dirname, '..', '..', '..', 'node_modules'),
  pluginConfig = path.join(pluginDir, '..', 'plugins.json');
var plugins = [],
  register;
module.exports = {
  friendlyName: 'Scan plugins',
  description: 'Scans our environment for plugins',
  fn: async function (inputs, exits) {
    sails.log.info('Scanning plugins');
    await fs.exists(pluginConfig, async (exists) => {
      if (!exists) {
        let configData = {
          enabled: [],
          disabled: []
        },
          json = JSON.stringify(configData);
        sails.log.info(`${pluginConfig} file does not exist, creating`);
        await fs.writeFile(pluginConfig, json, 'utf8', async (err) => {
          if (err) exits.error(err);
        });
      }
      // Load the info but not using require to limit attack vector
      await fs.readFile(pluginConfig, 'utf8', async (err, data) => {
        let config = JSON.parse(data);
        plugins = config.enabled;
        for (var i = 0, len = plugins.length; i < len; i++) {
          sails.log.info(`Found plugin [${plugins[i]}]`)
          await sails.helpers.plugin.registerHooks(plugins[i]);
        }
        return exits.success();
      });
    });
  }
};

