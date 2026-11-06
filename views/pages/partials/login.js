(function($) {
  // Focus the username and select its text on load, as FOG 1.6
  // fog.login.js does.
  let username = document.getElementById('username');
  if (username) {
    username.focus();
    username.select();
  }

  // The password show/hide toggle, ported from the FOG 1.6 fog.common.js
  // .fog-password-toggle handler. A click flips the input in the toggle's
  // input group between hidden and shown, swaps the eye icon, and keeps
  // aria-pressed in step. preventDefault keeps it from submitting the form.
  $(document).on('click', '.fog-password-toggle', function(e) {
    e.preventDefault();
    let input = $(this).closest('.input-group').find('input').first();
    let icon = $(this).find('span').first();
    let reveal = input.attr('type') === 'password';
    input.attr('type', reveal ? 'text' : 'password');
    icon.toggleClass('fa-eye', !reveal).toggleClass('fa-eye-slash', reveal);
    $(this).attr('aria-pressed', reveal ? 'true' : 'false');
  });
})(jQuery);
