var findme_map = L.map('findme-map').setView([37.7, -97.3], 3);
var osmUrl='http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
var osmAttrib='Map data © OpenStreetMap contributors';
var osm = new L.TileLayer(osmUrl, {minZoom: 2, maxZoom: 18, attribution: osmAttrib});
osm.addTo(findme_map);

var findme_marker = L.marker([0,0], {draggable:true});
findme_marker.addTo(findme_map);
findme_marker.setOpacity(0);

$("#findme").click(function() {
    $("#couldnt-find").hide();

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

    $("#findme h4").text("Searching...");
    $("#findme").addClass("loading");
    $.getJSON(url, function(data) {
        if (data.length > 0) {
            var chosen_place = data[0];
            console.log(chosen_place);

            var bounds = new L.LatLngBounds([+chosen_place.boundingbox[0], +chosen_place.boundingbox[2]],
                                            [+chosen_place.boundingbox[1], +chosen_place.boundingbox[3]]);
            findme_map.fitBounds(bounds);

            findme_marker.setOpacity(1);
            findme_marker.setLatLng([chosen_place.lat, chosen_place.lon]);

            $("#instructions").text("We found it! Click and drag the marker to sit on your business.");

            $("#findme h4").text("Done!");
            $("#findme").removeClass("loading");
            $("#findme").unbind('click').click(function() {
                $("#address-step").hide();
                $("#collect-data-step").show();
            });
        } else {
            console.log("No data found :(");
            $("#couldnt-find").show();
            $("#findme h4").text("Find Me!");
            $("#findme").removeClass("loading");
        }
    });
});