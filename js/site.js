var findme_map = L.map('findme-map', {zoomControl:false}).setView([37.7, -97.3], 15);
var osmUrl='http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
var osmAttrib='Map data © OpenStreetMap contributors';
var osm = new L.TileLayer(osmUrl, {minZoom: 8, maxZoom: 19, attribution: osmAttrib});
osm.addTo(findme_map);

$("#findme").click(function() {
    var address_to_find = $("#address").val();

    if (address_to_find.length === 0) {
        return;
    }

    var qwarg = {
        'format': 'json',
        'q': address_to_find
    };
    var url = "http://nominatim.openstreetmap.org/search?" + $.param(qwarg);
    console.log("Nominatim URL is " + url);

    $("#findme").val("Searching...");
    $.getJSON(url, function(data) {
        if (data.length > 0) {
            console.log("Found at least one place.");
            var chosen_place = data[0];

            findme_map.panTo([chosen_place.lat, chosen_place.lon]);
            $("#findme-map").show();
            findme_map.invalidateSize();
        } else {
            console.log("No places found :(");
        }
        console.log(data);
    });
});