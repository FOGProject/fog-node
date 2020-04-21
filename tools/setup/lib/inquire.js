const inquirer = require('inquirer'),
  CLI = require('clui'),
  Spinner = CLI.Spinner,
  chalk = require('chalk'),
  database = require('../../lib/database'),
  verifyDB = (answers, next) => {
    let status = new Spinner('Verifying database information, please wait...');
    status.start();
    database.connect(answers.host, answers.port, answers.database, answers.username, answers.password, (err, db) => {
      status.stop();
      let prefix = 'MongoError: ';
      if (err) {
        err = err.toString().replace(prefix, '');
        console.log(chalk.bgRed(`--> Incorrect database information: ${err}`));
        return next(err);
      }
      console.log(chalk.green('Database information verified'));
      next();
    });
  };

module.exports = {
  getDatabaseInfo: (next) => {
    let questions = [
      {
        name: 'host',
        type: 'input',
        message: 'Enter the database server address:',
        default: 'localhost',
        validate: (value) => {
          if (value.length) return true;
          return 'Please enter the database server address';
        }
      },
      {
        name: 'port',
        type: 'number',
        message: 'Enter the database server port:',
        default: 27017,
        validate: (value) => {
          if (isNaN(value) || value < 1 || value > 65535) return 'You must enter a valid port number';
          return true;
        }
      },
      {
        name: 'database',
        type: 'input',
        message: 'Enter the database name:',
        default: 'fog',
        validate: (value) => {
          if (value.length) return true;
          return 'Please enter the database';
        }
      },
      {
        name: 'username',
        type: 'input',
        message: 'Enter the database username:'
      },
      {
        name: 'password',
        type: 'password',
        message: 'Enter the database password:',
        when: (answers) => {
          return answers.username.length;
        }
      }
    ];
    inquirer.prompt(questions).then((answers) => {
      verifyDB(answers, (err) => {
        if (err) return module.exports.getDatabaseInfo(next);
        answers.adapter = 'sails-mongo';
        next(answers);
      });
    });
  },
  getAdminInfo: (next) => {
    let questions = [
      {
        name: 'email',
        type: 'input',
        message: 'Enter an email address for the Administrator account:',
        validate: (value) => {
          if (value.length && /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(value)) return true;
          return 'Please enter an email address';
        }
      },
      {
        name: 'password',
        type: 'password',
        message: 'Enter a password for the Administrator account:',
        validate: (value) => {
          if (value.length > 7) return true;
          return 'Please enter a password at least 8 characters long';
        }
      },
      {
        name: 'passwordConfirm',
        type: 'password',
        message: 'Please confirm the password for the Administrator account:',
        when: (answer) => {
          return answer.password;
        },
        validate: (value, answers) => {
          if (value === answers.password) return true;
          delete answers.password;
          return 'Passwords do not match';
        }
      }
    ];
    inquirer.prompt(questions).then(next);
  },
  getWebserverInfo: (next) => {
    let questions = [
      {
        name: 'port',
        type: 'input',
        message: 'Enter the port number FOG should listen on:',
        default: 1337,
        validate: (value) => {
          if (isNaN(value) || value < 1 || value > 65535) return 'You must enter a valid port number';
          return true;
        }
      },
      {
        name: 'proxy',
        type: 'confirm',
        message: 'Will FOG Operate behind a reverse proxy (recommended)?',
        default: true
      },
      {
        name: 'horizontal',
        type: 'confirm',
        message: 'Will there be a pool of FOG servers (horizontal scaling)?',
        default: true,
        when: (answers) => {
          return answers.proxy;
        }
      },
      {
        name: 'vertical',
        type: 'confirm',
        message: 'Should FOG multithread itself (vertical scaling)?',
        default: true
      }
    ];
    inquirer.prompt(questions).then(next);
  }
};
