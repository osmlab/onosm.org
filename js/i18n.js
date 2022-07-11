
const lngs = {
    'en-US': { nativeName: 'English' },
    de: { nativeName: 'German' },
    es: { nativeName: 'Español' },
    'fi-FI': { nativeName: 'Suorittaa loppuun (FI)' },
    it: { nativeName: 'Italiano' },
    fr: { nativeName: 'Français' },
    'nb-no': { nativeName: 'Norvégien (NO)' },
    'pt-BR': { nativeName: 'Português (BR)' },
    'ru-RU': { nativeName: 'русский язык (RU)' }
};

const rerender = () => {
    // start localizing, details:
    // https://github.com/i18next/jquery-i18next#usage-of-selector-function
   
    loadCategory(i18next.resolvedLanguage);
    $('body').localize();

    //$('title').text($.t('head.title'))
    //$('meta[name=description]').attr('content', $.t('head.description'))
}

$(function () {
    // use plugins and options as needed, for options, detail see
    // https://www.i18next.com
    i18next.use(i18nextHttpBackend)
        //.use(i18next-fs-backend)
        // detect user language
        // learn more: https://github.com/i18next/i18next-browser-languageDetector
        .use(i18nextBrowserLanguageDetector)
        // init i18next
        // for all options read: https://www.i18next.com/overview/configuration-options
        .init({
            debug: true,
            // useLocalStorage: true,
            // localStorageExpirationTime: 86400000, // in ms, default 1 week
            fallbackLng: 'en-US',
            preload: ['en-US'],
            // ns: ['translation'],
            // defaultNS: 'translation',
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
                    rerender(chosenLng);
                });
            });

            rerender();
            if (err) return console.error(err);
        });

   
});