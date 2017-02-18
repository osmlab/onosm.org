var findme_map = L.map('findme-map')
    .setView([37.7, -97.3], 3),
    osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    osmAttrib = 'Map data © OpenStreetMap contributors',
    osm = L.tileLayer(osmUrl, {minZoom: 2, maxZoom: 18, attribution: osmAttrib}).addTo(findme_map),
    category_data = [];

var findme_marker = L.marker([0,0], {draggable:true}).addTo(findme_map);
findme_marker.setOpacity(0);

if (location.hash) location.hash = '';

var successString,loadingText;

i18n.init({ fallbackLng: 'en-US', postAsync: 'false' }, function() {
    $("body").i18n();

    successString=i18n.t('messages.success', { escapeInterpolation: false });
    loadingText=i18n.t('messages.loadingText');

    var detectedLang = i18n.lng();
    $.getJSON('./locales/' + detectedLang + '/categories.json', function(data) {
    	category_data = data;
    });
});

$("#category").select2({
    query: function (query) {
        var data = {results: []}, i;
        for (i = 0; i < category_data.length; i++) {
            if (query.term.length === 0 || category_data[i].toLowerCase().indexOf(query.term.toLowerCase()) >= 0) {
                data.results.push({id: category_data[i], text: category_data[i]});
            }
        }
        query.callback(data);
    }
});

$("#find").submit(function(e) {
    e.preventDefault();
    $("#couldnt-find").hide();
    var address_to_find = $("#address").val();
    if (address_to_find.length === 0) return;
    var qwarg = {
        format: 'json',
        q: address_to_find
    };
    var url = "https://nominatim.openstreetmap.org/search?" + $.param(qwarg);
    $("#findme h4").text(loadingText);
    $("#findme").addClass("loading");
    $.getJSON(url, function(data) {
        if (data.length > 0) {
            var chosen_place = data[0];
            console.log(chosen_place);

            var bounds = new L.LatLngBounds(
                [+chosen_place.boundingbox[0], +chosen_place.boundingbox[2]],
                [+chosen_place.boundingbox[1], +chosen_place.boundingbox[3]]);

            findme_map.fitBounds(bounds);

            findme_marker.setOpacity(1);
            findme_marker.setLatLng([chosen_place.lat, chosen_place.lon]);

            $('#instructions').html(successString);
            $('.step-2 a').attr('href', '#details');
        } else {
            $("#couldnt-find").show();
        }
        $("#findme").removeClass("loading");
    });
});

$(window).on('hashchange', function() {
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

$("#collect-data-done").click(function() {
    location.hash = '#done';

    var note_body = "onosm.org submitted note from a business:\n" +
        "name: " + $("#name").val() + "\n" +
        "phone: " + $("#phone").val() + "\n" +
        "website: " + $("#website").val() + "\n" +
        "twitter: " + $("#twitter").val() + "\n" +
        "hours: " + $("#opening_hours").val() + "\n" +
        "category: " + $("#category").val().join(", ") + "\n" +
        "address: " + $("#address").val(),
        latlon = findme_marker.getLatLng(),
        qwarg = {
            lat: latlon.lat,
            lon: latlon.lng,
            text: note_body
        };

    $.post('https://api.openstreetmap.org/api/0.6/notes.json', qwarg);
});

function clearFields() {
    $("#name").val('');
    $("#phone").val('');
    $("#website").val('');
    $("#social").val('');
    $("#opening_hours").val('');
    $("#category").val('');
    $("#address").val('');
}
