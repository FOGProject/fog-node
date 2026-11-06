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

// Ends the install with exit code 1, for answers-file mode.
const fail = (message) => {
  console.log(chalk.bgRed(`--> ${message}`));
  process.exit(1);
};

// `npm run setup -- --answers <file.json>` takes every answer from a JSON
// file instead of the terminal, for CI and scripted installs. Each question
// keeps its default and its validation. A bad answer or a failed check ends
// the install with exit code 1 instead of asking again.
// docs/install.md shows the file format.
const answersAt = process.argv.indexOf('--answers');
const answersFile = answersAt === -1 ? null : process.argv[answersAt + 1];
let fileAnswers = null;
if (answersFile) {
  try {
    fileAnswers = JSON.parse(fs.readFileSync(answersFile, 'utf8'));
  } catch (err) {
    fail(`Cannot read the answers file ${answersFile}: ${err.message}`);
  }
} else if (answersAt !== -1) {
  fail('--answers needs a file path');
}
// inquirer.prompt, or the same questions answered from the answers file.
// `section` is the answers file key for this group of questions.
const prompt = (section, questions) => {
  if (!fileAnswers) return inquirer.prompt(questions);
  const given = fileAnswers[section] || {};
  const answers = {};
  for (const q of questions) {
    if (q.when && !q.when(answers)) continue;
    let value = Object.prototype.hasOwnProperty.call(given, q.name) ? given[q.name] : q.default;
    if (value === undefined) value = q.type === 'confirm' ? false : '';
    if (q.type === 'number') value = Number(value);
    // A terminal yes/no can only give a boolean. A string such as "no" is
    // truthy, so it would mean yes; refuse it.
    if (q.type === 'confirm' && typeof value !== 'boolean') {
      fail(`Answers file ${section}.${q.name}: use true or false`);
    }
    if (q.validate) {
      const ok = q.validate(value);
      if (ok !== true) fail(`Answers file ${section}.${q.name}: ${ok}`);
    }
    answers[q.name] = value;
  }
  return Promise.resolve(answers);
};
const verifyDB = (answers, next) => {
  let status = new Spinner('Verifying database information, please wait...');
  status.start();
  // The datastore object as tools/setup/index.js writes it to config/local.js:
  // each value URL-encoded (tools/lib/database.js connect).
  let datastore = {
    host: encodeURIComponent(answers.host),
    port: answers.port,
    database: encodeURIComponent(answers.database),
    user: answers.username ? encodeURIComponent(answers.username) : '',
    password: encodeURIComponent(answers.password || '')
  };
  database.connect(datastore, (err, client) => {
    status.stop();
    let prefix = 'MongoError: ';
    if (err) {
      err = err.toString().replace(prefix, '');
      console.log(chalk.bgRed(`--> Incorrect database information: ${err}`));
      return next(err);
    }
    // The check only needs the connection to open.
    client.close();
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
    prompt('database', questions).then((answers) => {
      verifyDB(answers, (err) => {
        if (err && fileAnswers) fail('The database check failed. Fix database in the answers file.');
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
    prompt('server', questions).then((answers) => {
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
    prompt('redis', questions).then((answers) => {
      let status = new Spinner('Verifying Redis, please wait...');
      status.start();
      redis.verify(answers.url, (err) => {
        status.stop();
        if (err) {
          console.log(chalk.bgRed(`--> Redis check failed: ${err.message}`));
          if (fileAnswers) fail('Fix redis.url in the answers file.');
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
    prompt('admin', questions).then(next);
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
    prompt('seed', questions).then(next);
  }
};
