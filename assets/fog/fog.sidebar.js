// The FOG 1.6 PLUGIN OPTIONS collapse (1.6 fog.common.js, .plugin-options-alternate).
// The minus link on the PLUGIN OPTIONS header slides the plugin menu list
// up or down, and swaps its icon between fa-minus and fa-plus. 1.6 does not
// remember the state across pages, so neither does this.
(function($) {
  $('.plugin-options-alternate').on('click', function(event) {
    event.preventDefault();
    let $icon = $(this).find('i');
    let open = $icon.hasClass('fa-minus');
    $('.plugin-options')[open ? 'slideUp' : 'slideDown']('fast');
    $icon.toggleClass('fa-minus', !open).toggleClass('fa-plus', open);
  });
})(jQuery);
