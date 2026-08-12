const async = require('async');
const chalk = require('chalk');
const CLI = require('clui');
const Spinner = CLI.Spinner;
const config = require('../lib/config');
const header = require('../lib/header');
const inquire = require('./lib/inquire');
const migrations = require('./lib/migration');
const welcome = 'Welcome to the FOG Schema Migrator.\nYou will be guided through migrating your current database schema';
var COMPLETED = false;

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
    let status = new Spinner('Calculating deltas...');
    let pendingText = 'Deltas calculated';
    let didMigrate = false;
    status.start();
    migrations.auto(config.preferences.datastores.fogdb, (upgrade, fromRev, toRev, description) => {
      didMigrate = true;
      status.stop();
      console.log(pendingText);
      pendingText = `Revision ${fromRev} -> ${toRev}\t `;
      let temp = (upgrade ? 'APPLYING: ' : 'REVERSING: ');
      pendingText += chalk.cyan(`${temp} ${description}`);
      status = new Spinner(pendingText);
      status.start();
    }, (err) => {
      status.stop();
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
], (err) => {
  if (err) console.log(chalk.bgRed(err));
  COMPLETED = true;
  process.exit();
});
(function wait() {
  if (!COMPLETED) setTimeout(wait, 1000);
})();
