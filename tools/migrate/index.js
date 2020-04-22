const async = require('async'),
  chalk = require('chalk'),
  CLI = require('clui'),
  Spinner = CLI.Spinner,
  config = require('../lib/config'),
  header = require('../lib/header'),
  inquire = require('./lib/inquire'),
  migrations = require('./lib/migration'),
  welcome = 'Welcome to the FOG Schema Migrator.\nYou will be guided through migrating your current database schema';
var COMPLETED = false,
  revision = 0;

header.print(welcome);
async.waterfall([
  // Database Backup
  (next) => {
    header.printSection('Database Backup');
    inquire.getBackupInfo((answers) => {
      if (!answers.backup && !answers.confirmBackup) return next('No backup');
      next();
    });
  },
  // Perform Migration
  (next) => {
    header.printSection('Database Migration');
    let status = new Spinner('Calculating deltas...'),
      pendingText = 'Deltas calculated',
      didMigrate = false;
    status.start();
    migrations.auto(config.preferences.datastores.fogdb, (upgrade, fromRev, toRev, description) => {
      didMigrate = true;
      status.stop();
      console.log(pendingText);
      pendingText = `Revision ${fromRev} -> ${toRev}\t `;
      pendingText += `${chalk.cyan((upgrade ? 'APPLYING: ' : 'REVERSING: ') description)}`;
      status = new Spinner(pendingText);
      status.start();
    }, (err) => {
      status.stop()
      console.log(pendingText);
      if (err) return next(err);
      if (didMigrate) {
        console.log('Migration complete');
        return next();
      }
      console.log('Migration not needed');
      next();
    });
  }
], (err, result) => {
  if (err) console.log(chalk.bgRed(err));
  COMPLETED = true;
  process.exit();
});
(function wait() {
  if (!COMPLETED) setTimeout(wait, 1000);
})();
