
//jquery version exposes i18next object for translations
var i18n = i18next;

var successString, manualPosition, loadingText, modalText;

let lastSearchAddress = null;

let pullValue = 0.1;

function reloadLists(language) {

  $.getJSON('./locales/' + language + '/categories.json')
    .success(function (data) {
      category_data = data;
    })
    .fail(function () {
      // 404? Fall back to en-US
      $.getJSON('./locales/en-US/categories.json')
      .success(function (data) {
        category_data = data;
      });
    });

  $.getJSON('./locales/' + language + '/payment.json').success(function (data) {
    payment_data = data;
  });

  $('#category').children().remove().end();
  $("#category").select2({
    query: function (query) {
      var data = {
        results: []
      },
        i;
      for (i = 0; i < category_data.length; i++) {
        if (query.term.length === 0 || category_data[i].toLowerCase().indexOf(query.term.toLowerCase()) >= 0) {
          data.results.push({
            id: category_data[i],
            text: category_data[i]
          });
        }
      }
      query.callback(data);
    }
  });

  $('#payment').children().remove().end();
  $("#payment").select2({
    multiple: true,
    query: function (query) {
      var data = {
        results: []
      };
      data.results = payment_data;
      query.callback(data);
    }
  });
}

/* HERE BE DRAGONS */
var findme_map = L.map('findme-map')
  .setView([41.69, 12.71], 5),
  osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  osm = L.tileLayer(osmUrl, {
    minZoom: 2,
    maxZoom: 18,
    attribution: "Data &copy; OpenStreetMap contributors"
  }).addTo(findme_map),
  esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  });

var baseMaps = {
  "Mapnik": osm,
  "Esri WorldImagery": esri
};
L.control.layers(baseMaps).addTo(findme_map);

var category_data = [];
var payment_data = [];

var findme_marker = L.marker([41.69, 12.71], {
  draggable: true
}).addTo(findme_map);

findme_marker.setOpacity(0);

L.control.locate({
  follow: true
}).addTo(findme_map);

findme_circle = null;


if (location.hash) location.hash = '';

/* user search: action */
$("#find").submit(function (e) {
  e.preventDefault();
  $("#couldnt-find").hide();

  // show loading indicator if user input is not empty
  var address_to_find = $("#address").val();
  if (address_to_find.length === 0) return;

  $("#findme h4").text(loadingText);
  $("#findme").addClass("progress-bar progress-bar-striped progress-bar-animated");

  searchAddress(address_to_find)
  .then(foundAddress => {    
   
    // save returned address
    lastSearchAddress = foundAddress;

    // Update rest of the site with address data
    updateAddressInfo(lastSearchAddress);

    const chosen_place = lastSearchAddress.boundingbox;
    var bounds = new L.LatLngBounds(
      [+chosen_place[0], +chosen_place[2]],
      [+chosen_place[1], +chosen_place[3]]);

    mapLatLng = ([
      (lastSearchAddress.lat),
      (lastSearchAddress.lon)
    ]);
      
    // recenter map on found address
    findme_map.fitBounds(bounds);
    findme_map.setView(mapLatLng, 16);

    // Place marker at found address
    findme_marker.setOpacity(1);
    findme_marker.setLatLng(mapLatLng);

    // create the "adjusment" circle around marker based on house number
    const circleRadius = !lastSearchAddress.address.house ? 50 : 25;
    findme_circle = L.circle(mapLatLng, circleRadius).addTo(findme_map);
  })
  .catch(e => {
    $("#couldnt-find").show();
    $("#map-information").hide();
    $("#address").addClass("is-invalid");
    $("#address").removeClass("is-valid");
  })
  .finally(() => {
    // stop loading animation
    $("#findme").removeClass("progress-bar progress-bar-striped progress-bar-animated");
  }); 
});

// toggle circle color when marker leaves the circle
findme_marker.on('drag', function(e) {
  var inside = isInsideCircle(e);

  // let's manifest this by toggling the color
  findme_circle.setStyle({
    fillColor: inside ? 'green' : '#f03'
  });
});

/* user moved map marker: action */
findme_marker.on('dragend', function (e) {

  // marker position after drag event 
  let event_cordinate = e.target._latlng;
  let maker_coordinates = event_cordinate;

  if (!isInsideCircle(event_cordinate)) {

    // validate new marker location
    const user_coordinates = {
      lat: event_cordinate.lat,
      lon: event_cordinate.lng
    };
    
    // show loading animation
    $("#findme h4").text(loadingText);
    $("#findme").addClass("progress-bar progress-bar-striped progress-bar-animated");

    searchReverseLookup(user_coordinates)
      .then(foundAddress => {

      
        const nominatim_cooridantes = {
          lat: foundAddress.lat,
          lon: foundAddress.lon
        };

        if (!pointsWithinCircleDiameter(event_cordinate, nominatim_cooridantes)) {        
          maker_coordinates = nominatim_cooridantes;
        }

        $("#map-information").html(manualPosition);
        $("#map-information").show();
        $('.step-2 a').attr('href', '#details');
        $('#step2').removeClass("disabled");
        $('#continue').removeClass("disabled");
      })

      .catch(err => {

        if (err) {
          if (err.error) {
            console.log(err.error);
          }
        }
        else {
          $("#couldnt-find").show();
          $("#map-information").hide();
        }

        // assume error is due to an invalid location (marker is in the ocean, etc)
        maker_coordinates = ([
          (lastSearchAddress.lat),
          (lastSearchAddress.lon)
        ]);

      })
      .finally(() => {
        // stop loading animation
        $("#findme").removeClass("progress-bar progress-bar-striped progress-bar-animated");
      });
    }

    // place marker to initial position
    findme_marker.setLatLng(maker_coordinates).addTo(findme_map);

    // recenter map on orginial search location to deter user drifting
    findme_map.setView(lastSearchAddress.getLatLng, 16);
  });

function isInsideCircle(e) {
  var isInside = true;

  if (findme_circle !== null) {
    // distance between the current position of the marker and the center of the circle
    const markerDistance = findme_map.distance(e.latlng, findme_circle.getLatLng());

    // the marker is inside the circle when the distance is inferior to the radius
    isInside = markerDistance < findme_circle.getRadius();
  }
  return isInside;
}

function pointsWithinCircleDiameter(point1LatLng, point2LatLng) {
  var withinDiameter = true;

  if (findme_circle !== null) {
    // distance between the current position of the marker and the center of the circle
    const pointsDistance = findme_map.distance(point1LatLng, point2LatLng);
    const circleDiameter = findme_circle.getRadius() * 2

    // the marker is inside the circle when the distance is inferior to the radius
    withinDiameter = pointsDistance < circleDiameter;
  }
  return withinDiameter;
}

// function solr_callback(data) {
//   if (data.response.docs.length > 0) {
//     var docs = data.response.docs;
//     var coords = docs[0].coordinate.split(',');
//     findme_marker.setOpacity(1);
//     findme_marker.setLatLng([coords[0], coords[1]]);
//     findme_map.setView([coords[0], coords[1]], 16);
//     $("#map-information").html(successString);
//     $("#map-information").show();

//     $('.step-2 a').attr('href', '#details');
//     $('#step2').removeClass("disabled");
//     $('#continue').removeClass("disabled");
//   } else {
//     $("#couldnt-find").show();
//     $("#map-information").hide();
//   }
//   $("#findme").removeClass("loading");
// }

function updateAddressInfo(chosen_place) {

  $('.step-2 a').attr('href', '#details');
  $('#step2').removeClass("disabled");
  $('#continue').removeClass("disabled");
  
  $('#addressalt').val(chosen_place.address.road);
  $('#hnumberalt').val(chosen_place.address.house_number);
  $('#city').val(chosen_place.address.village || chosen_place.address.town || chosen_place.address.city);
  $('#postcode').val(chosen_place.address.postcode);
  $("#address").val(chosen_place.display_name);
  $("#map-information").html(successString);
  $("#map-information").show();
  if (!chosen_place.address.house_number) {
    $("#map-information").append('<hr> <i class="twa twa-warning"></i> ' + i18n.t('step1.nohousenumber'));
  }

  $("#address").addClass("is-valid");
  $("#address").removeClass("is-invalid");
}

function searchAddress(address_to_find) {

  // setup callback
  const qwArgNominatim = {
      format: 'json',
      q: address_to_find,
      addressdetails: 1,
      namedetails: 1
  };

  var addressSearchUrl = "https://nominatim.openstreetmap.org/search?" + $.param(qwArgNominatim);

  // handle request - should include a timeout 
  return new Promise((resolve, reject) => {
      $.ajax({
          'url': addressSearchUrl,
          'success': function (data) {

              // address not found
              if (data.length < 1)
                  return reject({});

              // found the address
              resolve(parseData(data));
          },
          'error': function (error) {
              reject(error);
          },
          'dataType': 'jsonp',
          'jsonp': 'json_callback'
      });
  });
}

// lookup functionality (promise containing the results)
function searchReverseLookup(position) {
  let latitude = 0;
  let longitude = 0;

  // browser navigator 
  if (position.coords !== undefined ) {
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
  } else {
      // leaflet
      latitude = position.lat;
      longitude = position.lon;
  }

  /* NOMINATIM PARAM */
  const qwArgNominatim = {
      format: 'json',
      lat: latitude,
      lon: longitude,
      addressdetails: 1,
      namedetails: 1
  };

  var reverseSearchUrl = "https://nominatim.openstreetmap.org/reverse?" + $.param(qwArgNominatim);


  return new Promise((resolve, reject) => {
      $.ajax({
          'url': reverseSearchUrl,
          'success': function (data) {
              // Nominatim returns no data when address not found
              if (data == null) {
                  return reject({});
              }

              let dataError = data.error;
              // geocode error
              if (dataError !== undefined) {
                return reject(data);
              }

              resolve(parseData(data));
          },
          'error': function (error) {
              reject(error);
          },
          'dataType': 'jsonp',
          'jsonp': 'json_callback'
      });
  });
}

// Create a copy of the nominatim data
function parseData(data) {

  // throw out any type of null values
  if (data == null) return null;
  if (Array.isArray(data) && data.length < 1) return null;
  
  // Nominatim returns an array of possible matchess or single object
  const nominatimObject = Array.isArray(data) ? data[0] : data;

  const nominatimAddress = {};
  nominatimAddress.lon = nominatimObject.lon;
  nominatimAddress.lat = nominatimObject.lat;

  nominatimAddress.getLatLng = () => {
    return getLatLng(nominatimAddress);
  };

  nominatimAddress.boundingbox = [
    Number(nominatimObject.boundingbox[0]),
    Number(nominatimObject.boundingbox[1]),
    Number(nominatimObject.boundingbox[2]),
    Number(nominatimObject.boundingbox[3])
  ];

  nominatimAddress.address = nominatimObject.address;
  nominatimAddress.display_name = nominatimObject.display_name;
  return nominatimAddress;
}

function getLatLng(locationLatLng) {
  let leaftletAddress = {lat: 0, lng: 0}; 
  let parameterType = typeof(locationLatLng);
  if (parameterType == "object") {    
     leaftletAddress = {
      lat: Number(locationLatLng.lat),
      lng: !locationLatLng.lon ? Number(locationLatLng.lng) : Number(locationLatLng.lon)  
    };
  }
  return leaftletAddress;
}

// function getLatLng(lat, lng) {
//   return [Number(lat), Number(lng)];
// }

// // Nominatim uses {lat,lon}; LeaftLet use {lat,lng}
// function nominatimToLeaflet(lat, lon){
//   return L.getLatLng({lat: lat, lng: lon});
// }
// function round(value, decimals) {
//   return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
// }

// function sigDigits(numb) {
//   if (Number.isInteger(numb)) {
//      return 0;
//   } else {
//      return numb.toString().split('.')[1].length;
//   }
// }

// function outsideBBox(p){
//   if (!lastSearchAddress){
//     return false;
//   }

//   return [p.lat, p.lon];
// }

// function inRange(min, max, value){
//   return value === Math.max( Math.min( [min, max, value]), value );
// }

// Step change

$(window).on('hashchange', function () {
  if (location.hash == '#details') {
    $('#collect-data-step').removeClass('d-none');
    $('#address-step').addClass('d-none');
    $('#confirm-step').addClass('d-none');
    $('#step2').addClass('active bg-success');
    $('#step3').removeClass('active bg-success');
  } else if (location.hash == '#done') {
    $('#confirm-step').removeClass('d-none');
    $('#collect-data-step').addClass('d-none');
    $('#address-step').addClass('d-none');
    $('#step3').addClass('active bg-success');
    //confetti.start(1000);
  } else {
    $('#address-step').removeClass('d-none');
    $('#collect-data-step').addClass('d-none');
    $('#confirm-step').addClass('d-none');
    $('#step2').removeClass('active bg-success');
    $('#step3').removeClass('active bg-success');
  }
  findme_map.invalidateSize();
});

// Disables the input if delivery is not checked
$('#delivery-check').prop('indeterminate', true);
$(function () { deliveryCheck(); $("#delivery-check").click(deliveryCheck); });
function deliveryCheck() { if (this.checked) { enableDelivery(); } else { disableDelivery(); } }

function disableDelivery() { $("#delivery").attr("disabled", true); $("#delivery_description").attr("disabled", true); $("#label-delivery-check").html(i18n.t('step2.no')); }
function enableDelivery() { $("#delivery").removeAttr("disabled"); $("#delivery_description").removeAttr("disabled"); $("#label-delivery-check").html(i18n.t('step2.yes')); }

function getNoteBody() {
  var paymentIds = [],
    paymentTexts = [];
  $.each($("#payment").select2("data"), function (_, e) {
    paymentIds.push(e.id);
    paymentTexts.push(e.text);
  });


  // add back translation of note header
  
  var note_body = "onosm.org submitted note from a business:\n";
  if ($("#name").val()) note_body += i18n.t('step2.name') + ": " + $("#name").val() + "\n";
  if ($("#hnumberalt").val()) note_body += "addr:housenumber=" + $("#hnumberalt").val() + "\n";
  if ($("#addressalt").val()) note_body += "addr:street=" + $("#addressalt").val() + "\n";
  if ($("#city").val()) note_body += "addr:city=" + $("#city").val() + "\n";
  if ($("#postcode").val()) note_body += "addr:postcode=" + $("#postcode").val() + "\n";
  if ($("#phone").val()) note_body += i18n.t('step2.phone') + ": " + $("#phone").val() + "\n";
  // fixme - this should be default to an empty string or be escaped
  if ($("#website").val()) note_body += i18n.t('step2.website') + ": " + $("#website").val() + "\n";
  if ($("#social").val()) note_body += i18n.t('step2.social') + ": " + $("#social").val() + "\n";
  if ($("#opening_hours").val()) note_body += i18n.t('step2.opening') + ": " + $("#opening_hours").val() + "\n";
  if ($("#wheel").val()) note_body += i18n.t('step2.wheel') + ": " + $("#wheel").val() + "\n";
  if ($("#category").val()) note_body += i18n.t('step2.catlabel') + ": " + $("#category").val() + "\n";
  if ($("#categoryalt").val()) note_body += i18n.t('step2.cataltdesc') + ": " + $("#categoryalt").val() + "\n";
  if (paymentIds) note_body += i18n.t('step2.payment') + ": " + paymentTexts.join(",") + "\n";
 
  if ($("input:checked[name=delivery-check]").val() && $("#delivery").val() != "") note_body += " delivery=" + $("#delivery").val() + "\n"; else if ($("input:checked[name=delivery-check]").val() && $("#delivery").val() == "") note_body += "delivery=yes" + "\n"; else if ($('#delivery-check').not(':indeterminate') == true) note_body += "delivery=no" + "\n";
  if ($("#delivery_description").val()) note_body += "delivery:description=" + $("#delivery_description").val() + "\n";
 
  if ($("input:checked[name=takeaway]").val() != "undefined") note_body += "takeaway=" + $("input:checked[name=takeaway]").val() + "\n";
  if ($("#takeaway_description").val()) note_body += "takeaway:description=" + $("#takeaway_description").val() + "\n";
  if ($("input:checked[name=takeaway_covid]").val() == "yes" || $("input:checked[name=takeaway_covid]").val() == "only") note_body += "takeaway:covid19=" + $("input:checked[name=takeaway_covid]").val() + "\n";
 
  if ($("input:checked[name=delivery_covid]").val() === 'Y') note_body += "delivery:covid19=yes\n";
  if ($("#delivery_covid_description").val() || $("#takeaway_covid_description").val()) note_body += "description:covid19=";
  if ($("#delivery_covid_description").val()) note_body += $("#delivery_covid_description").val() + " ";
  if ($("#takeaway_covid_description").val()) note_body += $("#takeaway_covid_description").val() + "\n";
  return note_body;
}

$("#collect-data-done").click(function () {

  location.hash = '#done';

  var latlon = findme_marker.getLatLng(),
    qwarg = {
      lat: latlon.lat,
      lon: latlon.lng,
      text: getNoteBody()
    };

  $.post('https://api.openstreetmap.org/api/0.6/notes.json', qwarg, function (data) {
    // console.log(data);
    var noteId = data.properties.id;
    var link = 'https://openstreetmap.org/?note=' + noteId + '#map=19/' + latlon.lat + '/' + latlon.lng + '&layers=N';
    $("#linkcoords").append('<div class="mt-3 h4"><a href="' + link + '">' + link + '</a></div>');
  });
});

function clearFields() {
  $("#form")[0].reset();
  $("#address").val("");
  $("#category").select2("val", "");
  $("#payment").select2("val", "");
  $('#delivery-check').val("");
  $('#delivery-check').prop('indeterminate', true);
  disableDelivery();
}
