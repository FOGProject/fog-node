const inquirer = require('inquirer');

module.exports = {
  getBackupInfo: (next) => {
    let questions = [
      {
        name: 'backup',
        type: 'confirm',
        message: 'Have you made a backup of your FOG Database (recommended)?',
        default: false
      },
      {
        name: 'confirmBackup',
        type: 'confirm',
        message: 'Are you sure you wish to proceed migrating without a backup?',
        default: false,
        when: (answers) => {
          return !answers.backup;
        }
      }
    ];
    inquirer.prompt(questions).then(next);
  },
  getSchemaVersion: (latestRevision, currentRev, next) => {
    let questions = [
      {
        name: 'revision',
        type: 'number',
        message: 'Enter the schema revision to migrate to:',
        default: latestRevision,
        validate: (value) => {
          if (isNaN(value)) return 'You must enter a number';
          value = parseInt(value, 10);
          if (value > latestRevision) return `You cannot upgrade beyond the latest schema revision of ${latestRevision}`;
          if (value < 1) return 'You cannot downgrade past schema revision 1';
          if (value == currentRev) return `FOG is already running schema revision ${currentRev}`;
          return true;
        },
      }
    ];
  }
};
