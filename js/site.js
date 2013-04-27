var map = L.map('refine-map', { }).setView([37.7, -97.3], 15);

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
            $("#findme").val("Found you!");
        } else {
            $("#findme").val("We couldn't find that address");
        }
        console.log(data);
    });
});