var findme_map = L.map('findme-map')
    .setView([37.7, -97.3], 3),
    osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    osmAttrib = 'Map data © OpenStreetMap contributors',
    osm = L.tileLayer(osmUrl, {minZoom: 2, maxZoom: 18, attribution: osmAttrib}).addTo(findme_map),
    category_data = [];

var findme_marker = L.marker([0,0], {draggable:true}).addTo(findme_map);
findme_marker.setOpacity(0);

if (location.hash) location.hash = '';

$.ajax('./categories.json')
    .done(function(data){
        $("#category").select2({
            data: data
        });
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
    $("#findme h4").text("Searching...");
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

            $('#instructions').html('We found it! Click and drag the marker to sit on your business, then you are ready to <a href="#details">add details to your business listing</a>.');
            $('.step-2 a').attr('href', '#details');
        } else {
            $('#instructions').html('<strong>We couldn\'t find your address.</strong> Try searching for your street or city without the address.');
        }
        $("#findme").removeClass("loading");
    });
});

$(window).on('hashchange', function() {
    if (location.hash == '#details') {
        $('#collect-data-step').removeClass('hide');
        $('#address-step').addClass('hide');
        $('#confirm-step').addClass('hide');
        $('#upload-step').addClass('hide');
        $('.steps').addClass('on-2');
        $('.steps').removeClass('on-3');
    } else if (location.hash == '#done') {
        $('#confirm-step').removeClass('hide');
        $('#collect-data-step').addClass('hide');
        $('#address-step').addClass('hide');
        $('#upload-step').addClass('hide');
        $('.steps').addClass('on-3');
    } else {
        $('#address-step').removeClass('hide');
        $('#collect-data-step').addClass('hide');
        $('#confirm-step').addClass('hide');
        $('#upload-step').addClass('hide');
        $('.steps').removeClass('on-2');
        $('.steps').removeClass('on-3');
    }
    findme_map.invalidateSize();
});

/** @todo Params */
function submit_note() {
    var note_body = "onosm.org submitted note from a business:\n" +
        "name: " + $("#name").val() + "\n" +
        "phone: " + $("#phone").val() + "\n" +
        "website: " + $("#website").val() + "\n" +
        "twitter: " + $("#twitter").val() + "\n" +
        "hours: " + $("#opening_hours").val() + "\n" +
        "category: " + $("#category").val() + "\n" +
        "address: " + $("#address").val(),
        latlon = findme_marker.getLatLng(),
        qwarg = {
            lat: latlon.lat,
            lon: latlon.lng,
            text: note_body
        };

    $.post('https://api.openstreetmap.org/api/0.6/notes.json', qwarg);  
}
$("#collect-data-done").click(function() {
    location.hash = '#done';

    submit_note();

    if (locations.length > 0) {
      read_next_location();
    }
});

var locations = [];

function read_next_location() {
  location.hash = '';
  $('#bulk-upload-count').text(locations.length + " location(s) remaining to process");

  var business_location = locations.pop();

  console.log("Reading", business_location);

  $("#address").val(business_location["Address"]);

  $("#name").val(business_location["Location Name"]);
  $("#phone").val(business_location["Phone Number"]);
  $("#opening_hours").val(business_location["Opening Hours (“Monday to Friday 10am-5pm”)"]);
  $("#website").val(business_location["Website"]);
  $("#twitter").val(business_location["Twitter"]);
  $("#category").val(business_location["Category"]);


  $('#find').submit();
}

function read_local_file(file) {
    locations = Papa.parse(file, {
      delimiter: "",  // auto-detect
      newline: "",  // auto-detect
      quoteChar: '"',
      header: true,
      dynamicTyping: false,
      preview: 0,
      encoding: "",
      worker: false,
      comments: false,
      step: undefined,
      complete: function (csv) {
        locations = csv.data;
        
        console.log("Read data", locations);

        read_next_location();
      },
      error: undefined,
      download: false,
      skipEmptyLines: true,
      chunk: undefined,
      fastMode: undefined,
      beforeFirstChunk: undefined,
      withCredentials: undefined
    });


}
