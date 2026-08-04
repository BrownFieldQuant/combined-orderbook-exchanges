/* translate.js
   Page translation via Google's free Website Translator widget
   (translate.google.com's embeddable element) — no API key, no billing,
   no Google Cloud project needed. This replaces the earlier Cloud
   Translation API approach, which required a billed Google Cloud account;
   the widget below is the free consumer product instead.

   Trade-off vs. the paid API: this widget translates the WHOLE rendered
   page (not a curated safe list), including table cells and live text.
   Google's widget re-scans the DOM to catch updates, so it generally
   keeps up with our live-updating tables, but on a fast-refreshing page
   like this one it can occasionally show a brief flicker right after our
   own scripts update a cell, before Google's widget catches up and
   re-translates it. That's an accepted trade-off for "free, no signup".

   Note (unchanged from before): Google ML Kit is an Android/iOS native
   SDK only — there is no web/JavaScript version, so it's not an option
   for a browser app like this one.
*/

window.googleTranslateElementInit = function () {
    if (typeof google === 'undefined' || !google.translate) return;
    new google.translate.TranslateElement(
        {
            pageLanguage: 'en',
            includedLanguages: 'vi,zh-CN,zh-TW,ja,ko,es,fr,de,ru,pt,th,id,ar,hi',
            layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
            autoDisplay: false
        },
        'google_translate_element'
    );
};

document.addEventListener('DOMContentLoaded', function () {
    const script = document.createElement('script');
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    document.body.appendChild(script);
});
