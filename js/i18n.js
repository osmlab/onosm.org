
const lngs = {
    en: { nativeName: 'English' },
    de: { nativeName: 'German' },
    es: { nativeName: 'Español' }
};

const rerender = () => {
    // start localizing, details:
    // https://github.com/i18next/jquery-i18next#usage-of-selector-function

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
            fallbackLng: 'en',
            preload: ['en', 'de'],
            ns: ['translation'],
            defaultNS: 'translation',
            backend: {
                loadPath: 'locales/{{lng}}/{{ns}}.json'
            }
            // resources: {
            //     "backend": {
            //         "loadPath": "./locales/{{lng}}/{{ns}}.json"
            //     }
            //     // en: {
            //     //     translation: './locales/en/translation.json'
            //     // },
            //     // de: {
            //     //     translation: './locales/de/translation.json'
            //     // }
            // }
        }, (err, t) => {
            if (err) return console.error(err);

            // for options see
            // https://github.com/i18next/jquery-i18next#initialize-the-plugin
            jqueryI18next.init(i18next, $, { useOptionsAttr: true });

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
                    rerender();
                });
            });

            rerender();
        });

    // i18next().load({
    //     en: {
    //         translation: './locales/en/translation.json'
    //     },
    //     de: {
    //         translation: './locales/de/translation.json'
    //     }
    // })
});