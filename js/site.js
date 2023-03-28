
//jquery version exposes i18next object for translations
var i18n = i18next;

var successString, manualPosition, loadingText, modalText;

let lastSearchAddress = null;
let lastMarkerLatLng = null;

const circleRadiusMeters = 50;

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
lastMarkerLatLng = findme_marker.getLatLng();

findme_marker.setOpacity(0);

L.control.locate({
  follow: true
}).addTo(findme_map);

// create and hide circle
// let findme_circle = L.circle(lastMarkerLatLng)
//   .addTo(findme_map);
// findme_circle.setStyle({opacity: 0});

let findme_circle = null;
let findme_boundingBox = null;

// Bounding box around map
let circleBoundsVisible = true;
//let markerCircleVisible = false;


if (location.hash) location.hash = '';

/**
 * user search event: action
 * @param {Object} submit event object
 * 
 * Use content of address_to_find input element as search terms
 */
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
    
    const chosen_place = lastSearchAddress.boundingBox;
    var bounds = new L.LatLngBounds(
      [+chosen_place[0], +chosen_place[2]],
      [+chosen_place[1], +chosen_place[3]]);

    mapLatLng = ([
      (lastSearchAddress.lat),
      (lastSearchAddress.lon)
    ]);
    
    // Show marker at returned address
    findme_marker.setOpacity(1);
    findme_marker.setLatLng(mapLatLng);

    // start saving previous marker location
    lastMarkerLatLng = findme_marker.getLatLng();
         
    // delete previously created geo-fencing regions
    if (findme_boundingBox != null) {
      findme_boundingBox.remove();
      findme_boundingBox = null;
    } 
    else if (findme_circle != null) {
      findme_circle.remove();
      findme_circle = null;
    }

    // adjusted circle center to match search results
    findme_circle = new L.circle(lastMarkerLatLng)
    .addTo(findme_map)
    .setRadius(circleRadiusMeters)
    .setStyle({ opacity: 0 });

    // compare default circle to returned bounding box
    circleBoundsVisible =  !bounds.contains(findme_circle.getBounds());
    
    if (!circleBoundsVisible) {      
      // add initial bounding box to map
      findme_boundingBox = new L.rectangle(bounds)
        .addTo(findme_map);

    } else {
      // show circle bounding box on map
      findme_circle.setStyle({ opacity: 1 });
    }
    
    // recenter map on found address
    //findme_map.setView(mapLatLng);
    findme_map.fitBounds(bounds);    
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


/**
 * Marker "drag" event
 * @param {Object} drag_event
 */
findme_marker.on('drag', function(drag_event) {
  // check if marker is outside the circle
  let isInsideRegion = false 
 
  if (!circleBoundsVisible) {
    // check if marker is inside the bounding box     
    isInsideRegion = findme_boundingBox._bounds.contains(drag_event.latlng);
  } else {
    // check if marker is inside the circle 
    isInsideRegion = isInsideCircle(drag_event.latlng);
  }

  // reset marker to previous position when dragged outside the active bounding box
  if (!isInsideRegion){
    findme_marker.setLatLng(lastMarkerLatLng);
  } 
});

/**
 * Marker "drag ended" event
 * @param {Object} dragged_event
 */
findme_marker.on('dragend', function (dragged_event) {

  // update marker position after drag event 
  let markerEventLatLng = dragged_event.target._latlng;

  // cancel event when no movement happened
  if (lastMarkerLatLng === markerEventLatLng) {
    return;
  }

  // original marker position (from search results)
  const searchPositionLatLong = {
    lat: lastSearchAddress.lat,
    lng: lastSearchAddress.lon
  };

  // convert marker position from Leaflet to Nominatim format for lookup
  const user_coordinates = {
    lat: markerEventLatLng.lat,
    lon: markerEventLatLng.lng
  };

  
  if (circleBoundsVisible) {
    // Use raw marker position when the circle region is active (skip lookup)
    
    if (!findme_circle) {
      // prevent null reference to circle region
      console.log("missing circle bounds")      
    }
    else if (isInsideCircle(markerEventLatLng)) {
      // save new valid marker position
      findme_marker.setLatLng(user_coordinates);
      lastMarkerLatLng = findme_marker.getLatLng();
    }

    return;
  }
  
  // show loading animation
  $("#findme h4").text(loadingText);
  $("#findme").addClass("progress-bar progress-bar-striped progress-bar-animated");

  let finalMarkerPositionLatLng = markerEventLatLng;
  
  // search for valid marker location using a Nominatim point
  searchReverseLookup(user_coordinates)
    .then(foundAddress => {

      // convert Nominatim found position to Leaflet
      const nominatimLatLong = {
        lat: foundAddress.lat,
        lng: foundAddress.lon
      };

      const nominatim_boundingBox = foundAddress.boundingBox;
      const foundBounds = new L.LatLngBounds(
        [+nominatim_boundingBox[0], +nominatim_boundingBox[2]],
        [+nominatim_boundingBox[1], +nominatim_boundingBox[3]]);

      // create "safe area" for maker based on bounding box returned by lookup
      var reverseLookup_boundingBox = new L.rectangle(foundBounds);


      if (!reverseLookup_boundingBox._bounds.contains(markerEventLatLng)) {

        if (findme_boundingBox._bounds.contains(nominatimLatLong)) {
          // use the Nominatim supplied point since the user one is outside the Nominatim bounding box
          finalMarkerPositionLatLng = Object.assign({}, nominatimLatLong);
          
        } else {
          // revert the "drag" since both locations are out of bounds
          finalMarkerPositionLatLng = Object.assign({}, lastMarkerLatLng);
        }
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
      finalMarkerPositionLatLng = Object.assign({}, searchPositionLatLong);
    })

    .finally(() => {
      // stop loading animation
      $("#findme").removeClass("progress-bar progress-bar-striped progress-bar-animated");

      // place marker to initial position
      findme_marker.setLatLng(finalMarkerPositionLatLng);
      lastMarkerLatLng = findme_marker.getLatLng();

      // recenter map on original search location to deter map drifting too much
      findme_map.panTo(lastMarkerLatLng);
    });
});

/**
 * Is point inside the adjustment circle
 * 
 * @param {string{}} LatLngPoint 
 * @returns boolean 
 */
function isInsideCircle(LatLngPoint) {
  var isInside = false;
  
  if (!findme_circle) {return isInside}

  // distance between the current position of the marker and the center of the circle
  const markerDistance = findme_map.distance(LatLngPoint, findme_circle.getLatLng());

  // the marker is inside the circle when the distance is inferior to the radius
  isInside = markerDistance < findme_circle.getRadius();

  return isInside;
}

/**
 * Update address related HTML input fields
 * @param {NominatimAddress} chosen_place 
 */
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

/**
 * @param {String[]} address string array
 * @returns {Promise<NominatimAddress>}
 */
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

/** 
 * Reverse lookup functionality (promise containing the results)
 * @param {string{}} position 
 * @returns {Promise<NominatimAddress>}
 */
function searchReverseLookup(position) {
  let latitude = 0;
  let longitude = 0;

  // browser (location) navigator 
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

/**
 * List of string values describing an address
 * @typedef {string[]} display_name i.e. 1313, Mockingbird Lane, Mockingbird Heights
 */

/**
 * Nominatim address 
 * 
 * https://nominatim.org/release-docs/develop/api/Output/#json
 * 
 * @typedef {object} NominatimAddress
 * @property {string} lon Longitude
 * @property {string} lat Latitude
 * @property {number[]} boundingBox  Array of bounding points
 * @property {string{}} address      Map of OSM address key:values
 * @property {display_name} display_name Array of OSM address vales
*/

/**
 * Create a JS object from Nominatim JSON object
 * 
 * @param {object} nominatimData nominatim data
 * @returns {NominatimAddress} object initialized with Nominatim data
 */
function parseData(nominatimData) {

  // throw out any type of null values
  if (nominatimData == null) return null;
  if (Array.isArray(nominatimData) && nominatimData.length < 1) return null;
  
  // Nominatim returns an array of possible matchess or single object
  const nominatimObject = Array.isArray(nominatimData) ? nominatimData[0] : nominatimData;

  const nominatimAddress = {};
  nominatimAddress.lon = nominatimObject.lon;
  nominatimAddress.lat = nominatimObject.lat;

  nominatimAddress.getLatLng = () => {
    return getLatLng(nominatimAddress);
  };

  nominatimAddress.boundingBox = [
    Number(nominatimObject.boundingbox[0]),
    Number(nominatimObject.boundingbox[1]),
    Number(nominatimObject.boundingbox[2]),
    Number(nominatimObject.boundingbox[3])
  ];

  nominatimAddress.address = nominatimObject.address;
  nominatimAddress.display_name = nominatimObject.display_name;
  return nominatimAddress;
}

/**
 * Convert [lat, lon|lng] to leaflet [lat, lng]
 * 
 * @param {Number[]} locationLatLng Map of [lat, lon|lng]
 * @return {Number[]} Map of [lat, lng]
 */
function getLatLng(locationLatLng) {
  let leafLetAddress = {lat: 0, lng: 0}; 
  let parameterType = typeof(locationLatLng);
  if (parameterType == "object") {    
     leafLetAddress = {
      lat: Number(locationLatLng.lat),
      lng: !locationLatLng.lon ? Number(locationLatLng.lng) : Number(locationLatLng.lon)  
    };
  }
  return leafLetAddress;
}

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
