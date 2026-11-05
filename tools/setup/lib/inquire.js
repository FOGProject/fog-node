const fs = require('fs');
const os = require('os');
const path = require('path');
const inquirer = require('inquirer');
const CLI = require('clui');
const Spinner = CLI.Spinner;
const chalk = require('chalk');
const database = require('../../lib/database');
const redis = require('../../lib/redis');
const verifyDB = (answers, next) => {
  let status = new Spinner('Verifying database information, please wait...');
  status.start();
  database.connect(answers.host, answers.port, answers.database, answers.username, answers.password, (err) => {
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
  // Production Sails refuses to lift without sockets.onlyAllowOrigins, so the
  // installer needs the URL that browsers use. The image store default follows
  // the OS, because fog-node runs on any OS that runs Node.
  getServerInfo: (next) => {
    let questions = [
      {
        name: 'url',
        type: 'input',
        message: 'Enter the URL that browsers will use to reach fog-node:',
        default: `http://${os.hostname()}:1337`,
        validate: (value) => {
          try {
            const u = new URL(value);
            if (u.protocol === 'http:' || u.protocol === 'https:') return true;
          } catch (unused) {
            // Falls through to the message below.
          }
          return 'Enter a full http:// or https:// URL, for example http://fog.example.com:1337';
        }
      },
      {
        name: 'imageStorePath',
        type: 'input',
        message: 'Enter the directory that holds the images:',
        default: process.platform === 'win32' ? 'C:\\fog\\images' : '/images',
        validate: (value) => {
          if (!path.isAbsolute(value)) return 'Enter an absolute path';
          try {
            fs.mkdirSync(value, {recursive: true});
            fs.accessSync(value, fs.constants.W_OK);
            return true;
          } catch (err) {
            return `fog-node cannot write to that directory: ${err.message}`;
          }
        }
      }
    ];
    inquirer.prompt(questions).then((answers) => {
      // onlyAllowOrigins takes an origin: scheme, host and port, no path.
      answers.origin = new URL(answers.url).origin;
      next(answers);
    });
  },
  // Redis holds the session store. Without it the app lifts but every login
  // fails CSRF, so ask for it and check it here, like the database above.
  getRedisInfo: (next) => {
    let questions = [
      {
        name: 'url',
        type: 'input',
        message: 'Enter the Redis URL (session store):',
        default: 'redis://127.0.0.1:6379/0'
      }
    ];
    inquirer.prompt(questions).then((answers) => {
      let status = new Spinner('Verifying Redis, please wait...');
      status.start();
      redis.verify(answers.url, (err) => {
        status.stop();
        if (err) {
          console.log(chalk.bgRed(`--> Redis check failed: ${err.message}`));
          return module.exports.getRedisInfo(next);
        }
        console.log(chalk.green('Redis verified'));
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
      }
    ];
    inquirer.prompt(questions).then(next);
  },
  getDemoSeedInfo: (next) => {
    let questions = [
      {
        name: 'seed',
        type: 'confirm',
        default: false,
        message: 'Seed sample/test data (lots of hosts, images, storage, PXE menus) to try the UI? Not for production.'
      },
      {
        name: 'hosts',
        type: 'number',
        message: 'How many sample hosts?',
        default: 1000,
        when: (answers) => answers.seed,
        validate: (value) => {
          if (isNaN(value) || value < 1 || value > 100000) return 'Enter a number between 1 and 100000';
          return true;
        }
      }
    ];
    inquirer.prompt(questions).then(next);
  }
};
