/**
 * ui16-10: the FOG 1.6 login page (issue #154).
 *
 * It proves that /login has the 1.6 box and wording (ProcessLogin.php
 * mainLoginForm), that the username has the focus on load, that the password
 * show/hide toggle flips the input, its icon and aria-pressed without a form
 * post, and that a wrong password shows one "Login Failed" toast (the session
 * flash, api/helpers/flash.js) and no page alert, once.
 * tools/smoke/ui.js runs this file (see the comment at its top).
 */

const expect = (what, actual, expected) => {
  if (actual !== expected) throw new Error(`${what} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

const TOAST = '#fog-toast-container .toast.fog-toast';

// Every toast on the page: whether it is an error toast (the 1.6
// text-bg-danger header), its title and its body text.
const readToasts = (page) => page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((t) => [
  !!t.querySelector('.toast-header.text-bg-danger'),
  (t.querySelector('.toast-header strong') || {}).textContent,
  (t.querySelector('.toast-body') || {}).textContent
]), TOAST);

// The password input type, the toggle's aria-pressed and its icon classes.
const toggleState = (page) => page.evaluate(() => {
  const toggle = document.querySelector('.fog-password-toggle');
  const icon = toggle.querySelector('span');
  return {
    type: document.querySelector('input[name="password"]').type,
    pressed: toggle.getAttribute('aria-pressed'),
    eye: icon.classList.contains('fa-eye'),
    slash: icon.classList.contains('fa-eye-slash')
  };
});

async function markup(page) {
  // The focus first: nothing has touched the page yet.
  expect('the focused element on load', await page.evaluate(() => document.activeElement && document.activeElement.name), 'username');

  const m = await page.evaluate(() => {
    const logo = document.querySelector('.login-box .login-logo a');
    const toggle = document.querySelector('.input-group .fog-password-toggle');
    const row = document.querySelector('form .row.align-items-center');
    const submit = document.querySelector('form button[type="submit"]');
    return {
      logoText: logo && logo.textContent.trim(),
      logoHref: logo && logo.getAttribute('href'),
      msg: (document.querySelector('.card .login-card-body .login-box-msg') || {}).textContent,
      userIcon: !!document.querySelector('input[name="username"] + .input-group-text > span.fas.fa-user'),
      lock: document.querySelectorAll('.fa-lock').length,
      toggleType: toggle && toggle.getAttribute('type'),
      toggleLabel: toggle && toggle.getAttribute('aria-label'),
      toggleTab: toggle && toggle.getAttribute('tabindex'),
      toggleIcon: toggle && toggle.querySelector('span') ? toggle.querySelector('span').className : '',
      userRequired: document.querySelector('input[name="username"]').required,
      passRequired: document.querySelector('input[name="password"]').required,
      userPlaceholder: document.querySelector('input[name="username"]').placeholder,
      passPlaceholder: document.querySelector('input[name="password"]').placeholder,
      cols: row ? Array.from(row.children).map((c) => c.className) : [],
      remember: !!(row && row.querySelector('.col-7 .form-check input[type="checkbox"][name="remember-me"]')),
      submitText: submit && submit.textContent.trim(),
      submitClass: submit && submit.className,
      submitInCol: !!(row && row.querySelector('.col-5 button[type="submit"]')),
      // Pace and AdminLTE add their own classes at run time, so test the two
      // that the layout decides.
      loginPage: document.body.classList.contains('login-page'),
      bgSecondary: document.body.classList.contains('bg-body-secondary'),
      alerts: document.querySelectorAll('.alert-danger').length,
      csrf: !!document.querySelector('form[action="/login"][method="post"] input[type="hidden"][name="_csrf"]')
    };
  });
  expect('the logo text', m.logoText, 'FOG Project');
  expect('the logo link', m.logoHref, '/');
  expect('the login card message', m.msg, 'Sign in to start your session');
  expect('the username input has the fas fa-user addon', m.userIcon, true);
  expect('the fa-lock icons', m.lock, 0);
  expect('the toggle type', m.toggleType, 'button');
  expect('the toggle aria-label', m.toggleLabel, 'Show password');
  expect('the toggle tabindex', m.toggleTab, '-1');
  expect('the toggle icon', m.toggleIcon, 'far fa-eye');
  expect('the username required', m.userRequired, true);
  expect('the password required', m.passRequired, true);
  expect('the username placeholder', m.userPlaceholder, 'Username');
  expect('the password placeholder', m.passPlaceholder, 'Password');
  expect('the last row columns', JSON.stringify(m.cols), JSON.stringify(['col-7', 'col-5']));
  expect('the Remember Me check box in col-7', m.remember, true);
  expect('the submit button text', m.submitText, 'Sign In');
  expect('the submit button class', m.submitClass, 'btn btn-primary w-100');
  expect('the submit button in col-5', m.submitInCol, true);
  expect('the <body> has login-page', m.loginPage, true);
  expect('the <body> has bg-body-secondary', m.bgSecondary, false);
  expect('the .alert-danger elements', m.alerts, 0);
  expect('the form posts to /login with a _csrf field', m.csrf, true);
}

async function toggle(page, base) {
  const posts = [];
  page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.fill('input[name="password"]', 'ui16-10-secret');
  let s = await toggleState(page);
  expect('the password type before a click', s.type, 'password');

  await page.click('.fog-password-toggle');
  s = await toggleState(page);
  expect('the password type after one click', s.type, 'text');
  expect('aria-pressed after one click', s.pressed, 'true');
  expect('the fa-eye-slash icon after one click', s.slash, true);
  expect('the fa-eye icon after one click', s.eye, false);

  await page.click('.fog-password-toggle');
  s = await toggleState(page);
  expect('the password type after two clicks', s.type, 'password');
  expect('aria-pressed after two clicks', s.pressed, 'false');
  expect('the fa-eye-slash icon after two clicks', s.slash, false);
  expect('the fa-eye icon after two clicks', s.eye, true);

  expect('the password value after the toggles', await page.inputValue('input[name="password"]'), 'ui16-10-secret');
  expect('the URL after the toggles', page.url(), `${base}/login`);
  expect('the POST requests the toggles sent', JSON.stringify(posts), '[]');
}

async function wrongPassword(page, base) {
  await page.fill('input[name="username"]', 'Administrator');
  await page.fill('input[name="password"]', 'ui16-10-wrong-password');
  await Promise.all([page.waitForNavigation({waitUntil: 'networkidle'}), page.click('button[type="submit"]')]);
  expect('the URL after a wrong password', page.url(), `${base}/login`);
  expect('the toasts after a wrong password', JSON.stringify(await readToasts(page)), '[[true,"Login Failed","Invalid Login"]]');
  expect('the .alert-danger elements after a wrong password', await page.locator('.alert-danger').count(), 0);
  await page.reload({waitUntil: 'networkidle'});
  expect('the toasts after a reload', (await readToasts(page)).length, 0);
}

module.exports = {
  name: 'ui16-10: the FOG 1.6 login page',
  run: async ({browser, base}) => {
    // Signed out: a context of its own, so the shared page stays signed in.
    const context = await browser.newContext();
    const errors = [];
    try {
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`exception: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
      page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
      await page.goto(`${base}/login`, {waitUntil: 'networkidle'});
      await markup(page);
      await toggle(page, base);
      await wrongPassword(page, base);
    } finally {
      await context.close();
    }
    if (errors.length) throw new Error(`/login: ${errors.join('; ')}`);
  }
};
