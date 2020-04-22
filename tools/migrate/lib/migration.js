const fs = require('fs'),
  path = require('path'),
  migrationsFolder = path.join(__dirname, '..', '..', '..', 'migrations'),
  config = require('../../lib/config'),
  database = require('../../lib/database'),
  setting = require('../../lib/setting');
module.exports = {
  getMigrations: (start, end) => {
    if (start == end) return [];
    if (start < end && start == end+1) return [];
    let revisions = [],
      toLoad = [];
    if (start < end) {
      for (var i = start + 1; i < = end; i++) {
        toLoad.push(i);
      }
    } else {
      for (var i = start; i > end; i--) {
        toLoad.push(i);
      }
    }

    for (var i = 0; i < toLoad.length; i++) {
      try {
        revisions[i] = require(path.join(migrationsFolder, toLoad[i]));
        revisions[i]._meta.schema = toLoad[i];
      } catch (e) {
        throw `Missing migration file for schema ${toLoad[i]}`;
      }
    }
    return revisions;
  },
};
