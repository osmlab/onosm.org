const lngs = {
    'en-GB': { nativeName: 'British English' },
    'en-US': { nativeName: 'American English' },
    de: { nativeName: 'German' },
    es: { nativeName: 'Español' },
    'fi-FI': { nativeName: 'Suorittaa loppuun (FI)' },
    'it-IT': { nativeName: 'Italiano' },
    fr: { nativeName: 'Français' },
    'nb-no': { nativeName: 'Norvégien (NO)' },
    'pt-BR': { nativeName: 'Português (BR)' },
    'ru-RU': { nativeName: 'русский язык (RU)' }
};

const rerender = () => {
    // start localizing, details:
    // https://github.com/i18next/jquery-i18next#usage-of-selector-function

    // may have to fix this??
    reloadLists(i18next.resolvedLanguage);
    $('body').localize();
};

$(function () {
    // use plugins and options as needed, for options, detail see
    // https://www.i18next.com
    i18next.use(i18nextHttpBackend)
        // detect user language
        // learn more: https://github.com/i18next/i18next-browser-languageDetector
        .use(i18nextBrowserLanguageDetector)
        // init i18next
        // for all options read: https://www.i18next.com/overview/configuration-options
        .init({
            // requires language-only translation for fallback even when country version is present
            debug: true,
            fallbackLng: 'en-US',
            preload: ['en-US'],
            backend: {
                loadPath: 'locales/{{lng}}/translation.json'
            }
        }, (err, t) => {
            // for options see
            // https://github.com/i18next/jquery-i18next#initialize-the-plugin
            jqueryI18next.init(i18next, $);

            // fill language switcher
            Object.keys(lngs).map((lng) => {
                const opt = new Option(lngs[lng].nativeName, lng);
                if (lng === i18next.resolvedLanguage) {
                    opt.setAttribute("selected", "selected");
                }
                $('#languageSwitcher').append(opt);
            });
            $('#languageSwitcher').change((a, b, c) => {
                const chosenLng = $(this).find("option:selected").attr('value');
                i18next.changeLanguage(chosenLng, () => {
                    $("html").attr("lang", chosenLng);
                    rerender(chosenLng);
                });
            });

            rerender();
            if (err) return console.error(err);
        });   
});   