var findme_map = L.map('findme-map')
    .setView([41.69, 12.71], 5),
    osmUrl = 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    osmAttrib = 'Dati © OpenStreetMap contributors',
    osm = L.tileLayer(osmUrl, {minZoom: 2, maxZoom: 18, attribution: osmAttrib}).addTo(findme_map),
    category_data = [];

var findme_marker = L.marker([41.69, 12.71], {draggable:true}).addTo(findme_map);
findme_marker.setOpacity(0);


if (location.hash) location.hash = '';

$.getJSON('./categories.json').success(function(data){
    category_data = data;
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

/* search action */
$("#find").submit(function(e) {
    e.preventDefault();
    $("#couldnt-find").hide();
    var address_to_find = $("#address").val();
    if (address_to_find.length === 0) return;
    var qwarg = {
        format: 'json',
        q: address_to_find
    };
    var url = "http://nominatim.openstreetmap.org/search?" + $.param(qwarg);
    $("#findme h4").text("Sto cercando...");
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

            $('#instructions').html('Trovato! Clicca e trascina l\'indicatore sulla posizione della tua attività commerciale, così sarai pronto/a a <a href="#details">aggiungere dettagli alla tua scheda</a>.');
            $('.step-2 a').attr('href', '#details');
        } else {
            $('#instructions').html('<strong>Non siamo riusciti a trovare il tuo indirizzo.</strong> Prova a cercare la tua strada o città con meno dettagli.');
        }
        $("#findme").removeClass("loading");
    });
});

/* map action */
findme_map.on('click', function(e){ 
findme_marker.setOpacity(1);
findme_marker.setLatLng(e.latlng); 
$('#instructions').html('Hai attivato l\'indicatore! Cliccalo e trascinalo sulla posizione della tua attività commerciale, così sarai pronto/a a <a href="#details">aggiungere dettagli alla tua scheda</a>.');
$('.step-2 a').attr('href', '#details');
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

    var note_body = "E' stata inviata una nota tramite su.openstreetmap.it:\n";
	if ($("#name").val()) note_body += "Nome: " + $("#name").val() + "\n";
        if ($("#phone").val()) note_body += "Telefono: " + $("#phone").val() + "\n";
        if ($("#phone").val()) note_body += "Sito web: " + $("#website").val() + "\n";
        if ($("#twitter").val()) note_body += "Twitter: " + $("#twitter").val() + "\n";
        if ($("#opening_hours").val()) note_body += "Orario di apertura: " + $("#opening_hours").val() + "\n";
        if ($("#category").val()) note_body += "Categoria: " + $("#category").val() + "\n";
        if ($("#categoryalt").val()) note_body += "Descrizione: " + $("#categoryalt").val() + "\n";
        if ($("#address").val()) note_body += "Indirizzo: " + $("#address").val();
    var latlon = findme_marker.getLatLng();
    var qwarg = {
            lat: latlon.lat,
            lon: latlon.lng,
            text: note_body
        };

    $.post('http://api.openstreetmap.org/api/0.6/notes.json', qwarg);
});
