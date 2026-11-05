const fs = require('fs');
const path = require('path');
// inquirer 9+ is ESM-only. Node 22 loads it with require(), and the
// inquirer object is the module's default export.
const inquirer = require('inquirer').default;
const CLI = require('clui');
const Spinner = CLI.Spinner;
// chalk 5+ is ESM-only too: the chalk object is the default export.
const chalk = require('chalk').default;
const database = require('../../lib/database');
const redis = require('../../lib/redis');
const {splitList, isWebUrl, toOrigins, defaultUrls, defaultImageStore} = require('./server-defaults');
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
        // inquirer 14 can return undefined for an emptied number field, and
        // then skips validate. `required` rejects the empty answer instead.
        required: true,
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
  // Once sockets.onlyAllowOrigins is set, Sails accepts socket connections
  // only from those origins, in every mode. Production refuses to lift
  // without it. So the installer asks for every URL that browsers use.
  // The image store default follows the OS, because fog-node runs on any OS.
  getServerInfo: (next) => {
    let questions = [
      {
        name: 'urls',
        type: 'input',
        message: 'Enter each URL that browsers will use to reach fog-node, separated by commas:',
        default: defaultUrls().join(', '),
        validate: (value) => {
          const parts = splitList(value);
          if (!parts.length) return 'Enter at least one URL';
          const bad = parts.find((v) => !isWebUrl(v));
          if (bad) return `Not a full http:// or https:// URL: ${bad}`;
          return true;
        }
      },
      {
        name: 'imageStorePath',
        type: 'input',
        message: 'Enter the directory that holds the images:',
        default: defaultImageStore(),
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
      answers.origins = toOrigins(splitList(answers.urls));
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
        required: true, // See the database port question.
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
