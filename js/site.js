var findme_map = L.map('findme-map')
    .setView([37.7, -97.3], 3),
    osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    osmAttrib = 'Map data © OpenStreetMap contributors',
    osm = L.tileLayer(osmUrl, { minZoom: 2, maxZoom: 19, attribution: osmAttrib }).addTo(findme_map),
    category_data = [];

var findme_marker = L.marker([0, 0], { draggable: true }).addTo(findme_map);
findme_marker.setOpacity(0);

if (location.hash) location.hash = '';

function loadCategory(language) {
    var buildSelectControl = function (data) {
        $("#category").select2({
            multiple: true,
            data: data,
        });
    };
    $.getJSON('./locales/' + language + '/categories.json', buildSelectControl).fail(function () {
        // 404? Fall back to en-US
        $.getJSON('./locales/en-US/categories.json', buildSelectControl);
    });
};

i18next
    .use(i18nextBrowserLanguageDetector)
    .init({ fallbackLng: 'en-US', postAsync: 'false' }, function () {
        $("body").i18n();

        var detectedLang = i18n.lng();
        loadCategory(detectedLang);

    });


function zoom_to_point(chosen_place, map, marker) {
    console.log(chosen_place);

    marker.setOpacity(1);
    marker.setLatLng([chosen_place.lat, chosen_place.lon]);


    map.setView(chosen_place, 18, { animate: true });
}
$("#use_my_location").click(function (e) {
    $("#couldnt-find").hide();
    $("#success").hide();
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(function (position) {
            var point = {
                lat: position.coords.latitude,
                lon: position.coords.longitude
            }

            zoom_to_point(point, findme_map, findme_marker);

            $('#success').html(i18n.t('messages.success', { escapeInterpolation: false }));
            $('#success').show();
            window.scrollTo(0, $('#address').position().top - 30);
            $('.step-2 a').attr('href', '#details');
        }, function (error) {
            $("#couldnt-find").show();
        });
    } else {
        $("#couldnt-find").show();
    }
});
$("#find").submit(function (e) {
    e.preventDefault();
    $("#couldnt-find").hide();
    $("#invalid-location").hide();
    $("#success").hide();
    var address_to_find = $("#address").val();
    if (address_to_find.length === 0) return;
    var qwarg = {
        format: 'json',
        q: address_to_find
    };
    var url = "https://nominatim.openstreetmap.org/search?" + $.param(qwarg);
    $("#findme h4").text(i18n.t('messages.loadingText'));
    $("#findme").addClass("loading");
    $.getJSON(url, function (data) {
        if (data.length > 0) {
            zoom_to_point(data[0], findme_map, findme_marker);

            $('#success').html(i18n.t('messages.success', { escapeInterpolation: false }));
            $('#success').show();
            window.scrollTo(0, $('#address').position().top - 30);
            $('.step-2 a').attr('href', '#details');
        } else {
            $("#couldnt-find").show();
        }
        $("#findme").removeClass("loading");
    });
});

$(window).on('hashchange', function () {
    if (location.hash == '#details') {
        $('#collect-data-step').removeClass('hide');
        $('#address-step').addClass('hide');
        $('#confirm-step').addClass('hide');
        $('.steps').addClass('on-2');
        $('.steps').removeClass('on-3');
    } else if (location.hash == '#done') {
        $('#confirm-step').removeClass('hide');
        $('#collect-data-step').addClass('hide');
        $('#address-step').addClass('hide');
        $('.steps').addClass('on-3');
    } else {
        $('#address-step').removeClass('hide');
        $('#collect-data-step').addClass('hide');
        $('#confirm-step').addClass('hide');
        $('.steps').removeClass('on-2');
        $('.steps').removeClass('on-3');
    }
    findme_map.invalidateSize();
});

$("#collect-data-done").click(function () {
    // Basic form validation
    if ($("#category").val().length == 0) {
        $("#form-invalid").text(i18n.t('validation.missingCategory'));
        return false;
    } else if ($("#name").val().length < 3) {
        $("#form-invalid").text(i18n.t('validation.missingName'));
        return false;
    } else if ($("#phone").val().length < 5 && $("#website").length < 10) {
        $("#form-invalid").text(i18n.t('validation.missingPhoneOrWebsite'));
        return false;
    } else {
        $("#form-invalid").text("");
    }

    location.hash = '#done';

    var note_body =
        "onosm.org submitted note from a business:\n" +
        "name: " + $("#name").val() + "\n" +
        "phone: " + $("#phone").val() + "\n" +
        "website: " + $("#website").val() + "\n" +
        "twitter: " + $("#twitter").val() + "\n" +
        "facebook: " + $("#facebook").val() + "\n" +
        "email: " + $("#email").val() + "\n" +
        "hours: " + $("#opening_hours").val() + "\n" +
        "category: " + $("#category").val().join(", ") + "\n" +
        "address: " + $("#address").val(),
        latlon = findme_marker.getLatLng(),
        note_data = {
            lat: latlon.lat,
            lon: latlon.lng,
            text: note_body
        };

    $.post(
        'https://api.openstreetmap.org/api/0.6/notes.json',
        note_data,
        function (result) {
            var id = result.properties.id;
            $("#linkcoords").append(
                '<a href="https://osm.org/note/' + id + '">https://osm.org/note/' + id + '</a>'
            );
        }
    );
});

function clearFields() {
    $("#name").val('');
    $("#phone").val('');
    $("#website").val('');
    $("#twitter").val('');
    $("#opening_hours").val('');
    $("#category").val('');
    $("#address").val('');
    $("#linkcoords").empty();
};

function check_coordinates() {
    var latlon = findme_marker.getLatLng();

    if ((latlon.lat != 0) || (latlon.lng != 0)) {
        location.hash = '#details';
    } else {
        $("#invalid-location").show();
    }
};



// Swap languages when menu changes
$("#langSelect").on("change", function () {
    var language = $(this).val();
    loadCategory(language);
    $("html").attr("lang", language);
    //var selectedLang = $(this).attr("lang")
    // var language = $(this).val().toLowerCase();
    // if (dictionary.hasOwnProperty(language)) {
    //     set_lang(dictionary[language]);
    // }
});