
//jquery version exposes i18next object for translations
var i18n = i18next;

var successString, manualPosition, loadingText, modalText;

let activeSearchAddress = null;
let activeMarkerLatLng = null;

const circleRadiusMeters = 50;

function reloadLists(language) {

  $.getJSON('./locales/' + language + '/categories.json')
    .done(function (data) {
      category_data = data;
    })
    .fail(function () {
      // 404? Fall back to en-US
      $.getJSON('./locales/en-US/categories.json')
        .done(function (data) {
          category_data = data;
        });
    });

  $.getJSON('./locales/' + language + '/payment.json').done(function (data) {
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

const findme_map = L.map('findme-map')
  .setView([41.69, 12.71], 5),
  osmUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  osm = L.tileLayer(osmUrl, {
    minZoom: 2,
    maxZoom: 18,
    attribution: "Data &copy; OpenStreetMap contributors"
  }).addTo(findme_map),
  esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  });

const baseMaps = {
  "Mapnik": osm,
  "Esri WorldImagery": esri
};

L.control.layers(baseMaps).addTo(findme_map);

let category_data = [];
let payment_data = [];

let findme_marker = null;

L.control.locate({
  follow: true
}).addTo(findme_map);

let findme_circle = null;
let findme_boundingBox = null;

// Bounding box around map
let circleBoundsVisible = true;

// A link like onosm.org/#17/14.50479/121.06624 (zoom/lat/lon) pre-positions
// the marker so e.g. a mapper can send a business owner a link that skips
// the address search. https://github.com/osmlab/onosm.org/issues/85
const initialLocationMatch = location.hash.match(/^#(\d{1,2})\/(-?\d{1,2}(?:\.\d+)?)\/(-?\d{1,3}(?:\.\d+)?)$/);

// A link like onosm.org/#/edit/node/1234 (or #edit/node/1234) loads that
// existing OSM element for editing: the form is prefilled from its tags and
// position so a mapper can send a business owner a link to suggest changes
// to a place that's already on the map, instead of only adding new ones.
// See docs/superpowers/specs/2026-07-13-edit-existing-element-design.md
const initialEditMatch = location.hash.match(/^#\/?edit\/(node|way)\/(\d+)$/);

if (location.hash) location.hash = '';

if (initialLocationMatch) {
  // wait for translations so the marker instructions render localized
  i18n.on('initialized', function () {
    showLinkedLocation(
      Number(initialLocationMatch[2]),
      Number(initialLocationMatch[3]),
      Math.min(Number(initialLocationMatch[1]), 18));
  });
}

if (initialEditMatch) {
  // wait for translations so the marker instructions / edit-mode banner
  // render localized
  i18n.on('initialized', function () {
    loadElementForEditing(initialEditMatch[1], initialEditMatch[2]);
  });
}

// editContext records the OSM element currently being edited (null when the
// form is being used to add a brand-new place). Set by
// loadElementForEditing() and cleared by clearFields(). See
// docs/superpowers/specs/2026-07-13-edit-existing-element-design.md
let editContext = null;

// Tags shown in the read-only "Currently tagged:" line in edit mode.
const editModeTagKeys = ['amenity', 'shop', 'tourism', 'leisure', 'craft', 'office', 'cuisine'];

// Form field -> OSM tag(s) to prefill from, first match wins. Address fields
// here are re-applied after showFoundAddress()/updateAddressInfo() runs so
// that tag values win over the reverse geocoder's guess.
const editPrefillTagMap = {
  '#name': ['name'],
  '#phone': ['phone', 'contact:phone'],
  '#website': ['website', 'contact:website'],
  '#opening_hours': ['opening_hours'],
  '#hnumberalt': ['addr:housenumber'],
  '#addressalt': ['addr:street'],
  '#placenamealt': ['addr:place'],
  '#city': ['addr:city'],
  '#postcode': ['addr:postcode']
};

/**
 * Load an existing OSM node or way for editing. Fetches the element from
 * the OSM API, prefills the form from its tags/position, and reuses the
 * showLinkedLocation() flow to drop the user directly onto the details
 * step. Any fetch/parse failure just falls back to the normal blank flow
 * with a dismissible warning -- this is a nice-to-have shortcut, not a
 * required path. See
 * docs/superpowers/specs/2026-07-13-edit-existing-element-design.md
 * @param {"node"|"way"} type
 * @param {string} id
 */
function loadElementForEditing(type, id) {
  $("#findme").addClass("progress-bar progress-bar-striped progress-bar-animated");

  const url = type === 'node'
    ? 'https://api.openstreetmap.org/api/0.6/node/' + id + '.json'
    : 'https://api.openstreetmap.org/api/0.6/way/' + id + '/full.json';

  $.ajax({
    url: url,
    dataType: 'json',
    timeout: 10000
  })
    .done(function (data) {
      const extracted = extractEditElement(type, id, data);
      if (!extracted) {
        showEditFetchError();
        return;
      }

      editContext = { type: type, id: id, tags: extracted.tags, lat: extracted.lat, lon: extracted.lon };
      showEditModeBanner();

      // Same flow as showLinkedLocation(): reverse-geocode the point for
      // address fields, but keep the marker at the element's own position.
      // Unlike a plain location link, a failed reverse geocode isn't fatal
      // here -- the element itself is the source of truth, so continue with
      // its tags alone rather than leaving edit mode half-initialized.
      searchReverseLookup({ lat: extracted.lat, lon: extracted.lon })
        .catch(() => ({ address: {}, display_name: '' }))
        .then(foundAddress => {
          const boxSize = 0.002;
          foundAddress.lat = extracted.lat;
          foundAddress.lon = extracted.lon;
          foundAddress.boundingBox = [extracted.lat - boxSize, extracted.lat + boxSize, extracted.lon - boxSize, extracted.lon + boxSize];
          activeSearchAddress = foundAddress;
          showFoundAddress(foundAddress, 18);

          // updateAddressInfo() (called from showFoundAddress) just filled
          // the address fields from the geocoder -- now overwrite with tag
          // values where the element actually has them.
          prefillFromTags(editContext.tags);

          $('#step2').removeClass("disabled");
          $('.step-2 a').attr('href', '#details');
          setContinueEnabled(true);

          location.hash = '#details';
        });
    })
    .fail(function () {
      showEditFetchError();
    })
    .always(function () {
      $("#findme").removeClass("progress-bar progress-bar-striped progress-bar-animated");
    });
}

/**
 * Pull the tags and a representative lat/lon out of an OSM API response for
 * the element being edited. Returns null if the element (or its tags) can't
 * be found, so the caller can fall back to the normal blank flow.
 * @param {"node"|"way"} type
 * @param {string} id
 * @param {Object} data OSM API JSON response (node.json or way/full.json)
 * @returns {?{tags: Object, lat: Number, lon: Number}}
 */
function extractEditElement(type, id, data) {
  if (!data || !Array.isArray(data.elements)) return null;

  const element = data.elements.find(function (e) {
    return e.type === type && String(e.id) === String(id);
  });

  if (!element || !element.tags || Object.keys(element.tags).length === 0) return null;

  if (type === 'node') {
    return { tags: element.tags, lat: element.lat, lon: element.lon };
  }

  // way: centroid (arithmetic mean) of its member nodes' coordinates. A
  // closed way repeats its first node id as the last one -- drop that
  // duplicate so it isn't double-counted.
  let nodeIds = element.nodes.slice();
  if (nodeIds.length > 1 && nodeIds[0] === nodeIds[nodeIds.length - 1]) {
    nodeIds = nodeIds.slice(0, -1);
  }

  const nodesById = {};
  data.elements.forEach(function (e) {
    if (e.type === 'node') nodesById[e.id] = e;
  });

  let sumLat = 0, sumLon = 0, count = 0;
  nodeIds.forEach(function (nodeId) {
    const node = nodesById[nodeId];
    if (node) {
      sumLat += node.lat;
      sumLon += node.lon;
      count++;
    }
  });

  if (count === 0) return null;

  return { tags: element.tags, lat: sumLat / count, lon: sumLon / count };
}

/**
 * Prefill form fields from the edited element's tags (see editPrefillTagMap)
 * and remember the prefilled value of each field on editContext.prefilled
 * so getNoteBody() can later report only what changed. The category picker
 * is intentionally left blank -- see showEditModeBanner() for the
 * current-tags display instead.
 * @param {Object} tags OSM tags of the element being edited
 */
function prefillFromTags(tags) {
  Object.keys(editPrefillTagMap).forEach(function (selector) {
    const tagKeys = editPrefillTagMap[selector];
    for (let i = 0; i < tagKeys.length; i++) {
      if (tags[tagKeys[i]]) {
        $(selector).val(tags[tagKeys[i]]);
        break;
      }
    }
  });

  // #wheel is a <select> restricted to a few known values; only prefill it
  // when the tag value is one of the ones the form actually offers.
  const wheelchair = tags['wheelchair'];
  if (wheelchair === 'yes' || wheelchair === 'limited' || wheelchair === 'no') {
    $('#wheel').val(wheelchair);
  }

  // Snapshot the resulting form values -- tag-derived AND geocoder-derived
  // (updateAddressInfo() ran just before this) -- as the diff baseline.
  // Snapshotting only tag values would make an untouched geocoder-filled
  // field (say a city the element has no addr:city tag for) show up in the
  // note as a spurious "(new)" suggestion and defeat the nothing-changed
  // guard in editModeHasChanges().
  editContext.prefilled = {};
  editableFieldSpecs.forEach(function (f) {
    editContext.prefilled[f.selector] = fieldValue(f.selector);
  });
}

/**
 * Leave edit mode: clear the edit context and its banner/alerts so the next
 * note is a plain new-place submission. Called when the form is reset after
 * a submission and when the user starts a fresh address search -- a manual
 * search means they're describing some other place, and keeping the old
 * editContext would make the note misattribute that place's details as
 * changes to the originally linked element.
 */
function exitEditMode() {
  editContext = null;
  $('#edit-mode-info').addClass('d-none');
  $('#edit-mode-banner').empty();
  $('#edit-mode-tags').empty();
  $('#edit-nothing-changed-alert').hide();
}

/**
 * Show the dismissible "couldn't load that OSM object" warning used when
 * loadElementForEditing() can't fetch or make sense of the linked element.
 * The user is left on the normal blank flow.
 */
function showEditFetchError() {
  $('#edit-fetch-error')
    .text(i18n.t('editmode.fetcherror', { defaultValue: "Couldn't load that OSM object. You can still add a place normally." }))
    .show();
}

/**
 * Render the edit-mode banner ("Suggesting changes to node 1234") and the
 * read-only "Currently tagged: amenity=cafe, ..." line shown on the details
 * step while editContext is set.
 */
function showEditModeBanner() {
  if (!editContext) return;

  const osmUrl = 'https://osm.org/' + editContext.type + '/' + editContext.id;

  const $banner = $('#edit-mode-banner').empty();
  $banner.append(document.createTextNode(
    i18n.t('editmode.banner', { defaultValue: 'Suggesting changes to' }) + ' '
  ));
  $('<a>').attr('href', osmUrl).text(editContext.type + ' ' + editContext.id).appendTo($banner);

  const tagPairs = editModeTagKeys
    .filter(function (key) { return editContext.tags[key]; })
    .map(function (key) { return key + '=' + editContext.tags[key]; });

  const $tags = $('#edit-mode-tags').empty();
  if (tagPairs.length > 0) {
    $tags.text(i18n.t('editmode.currenttags', { defaultValue: 'Currently tagged:' }) + ' ' + tagPairs.join(', '));
  }

  $('#edit-mode-info').removeClass('d-none');
}

/**
 * Place the marker at a location provided in the URL hash. The address
 * fields are prefilled from a reverse geocode of the point, but the marker
 * stays at the linked coordinates: whoever made the link knows the spot
 * better than the geocoder does.
 * @param {Number} lat
 * @param {Number} lon
 * @param {Number} zoom
 */
function showLinkedLocation(lat, lon, zoom) {
  $("#findme").addClass("progress-bar progress-bar-striped progress-bar-animated");

  searchReverseLookup({ lat: lat, lon: lon })
    .then(foundAddress => {
      // Keep the linked point and geofence to a small box around it; the
      // geocoded feature's bounding box isn't guaranteed to contain the
      // linked point.
      const boxSize = 0.002;
      foundAddress.lat = lat;
      foundAddress.lon = lon;
      foundAddress.boundingBox = [lat - boxSize, lat + boxSize, lon - boxSize, lon + boxSize];
      activeSearchAddress = foundAddress;
      showFoundAddress(foundAddress, zoom);

      // The linked point is already exact, so unlike a searched address
      // (which may need the marker dragged onto the right building first)
      // the user can continue right away.
      $('#step2').removeClass("disabled");
      $('.step-2 a').attr('href', '#details');
      setContinueEnabled(true);
    })
    .catch(() => {
      // Nothing to reverse geocode there (open water etc.) -- just center
      // the map on the linked point and let the user search normally.
      findme_map.setView([lat, lon], zoom);
    })
    .finally(() => {
      $("#findme").removeClass("progress-bar progress-bar-striped progress-bar-animated");
    });
}

/**
 * user search event: action
 * @param {Object} submit event object
 *
 * Use content of address_to_find input element as search terms
 */
$("#find").submit(function (e) {
  e.preventDefault();
  $("#couldnt-find").hide();
  $("#edit-fetch-error").hide();

  // show loading indicator if user input is not empty
  let address_to_find = $("#address").val();
  if (address_to_find.length === 0) return;

  exitEditMode();

  $("#findme h4").text(loadingText);
  $("#findme").addClass("progress-bar progress-bar-striped progress-bar-animated");

  searchAddress(address_to_find)
    .then(foundAddress => {
      // save returned address
      activeSearchAddress = foundAddress;
      showFoundAddress(foundAddress, 14);
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
 * Show a found address on the map: place or move the draggable marker,
 * build the geofence region around it, and prefill the address fields.
 * @param {NominatimAddress} foundAddress
 * @param {Number} zoom map zoom level to show the location at
 */
function showFoundAddress(foundAddress, zoom) {
  // Update rest of the site with address data
  updateAddressInfo(foundAddress);

  const chosen_place = foundAddress.boundingBox;
  let bounds = new L.LatLngBounds(
    [+chosen_place[0], +chosen_place[2]],
    [+chosen_place[1], +chosen_place[3]]);

  const mapLatLng = ([
    (foundAddress.lat),
    (foundAddress.lon)
  ]);

  // Show marker at returned address
  if (findme_marker === null) {
    findme_marker = L.marker(mapLatLng, {
      draggable: true
    }).addTo(findme_map);

    /**
     * Geo-fence marker to the bounded region (Marker "drag" event)
     * @param {Object} drag_event
     */
    findme_marker.on('drag', function (drag_event) {

      const dragMarkerLocation = drag_event.latlng
      let isInsideRegion = false

      // check if marker is outside the circle

      if (!circleBoundsVisible) {
        // check if marker is inside the bounding box
        isInsideRegion = findme_boundingBox.getBounds().contains(dragMarkerLocation);
      } else {
        // check if marker is inside the circle
        isInsideRegion = isInsideCircle(dragMarkerLocation);
      }

      // reset marker to previous position when dragged outside the active bounding box
      if (!isInsideRegion) {
        findme_marker.setLatLng(activeMarkerLatLng);
      }
    });

    /**
     * Validate new marker location (Marker "drag ended" event)
     * @param {Object} dragged_event
     */
    findme_marker.on('dragend', function (dragged_event) {

      // update marker position after drag event
      const eventMarkerLocation = dragged_event.target._latlng;

      // cancel event when no movement happened (drag event cancelled)
      if (activeMarkerLatLng === eventMarkerLocation) {
        return;
      }

      // original marker position (from search results)
      const searchPositionLatLong = {
        lat: activeSearchAddress.lat,
        lng: activeSearchAddress.lon
      };

      // convert marker position from Leaflet to Nominatim format for lookup
      const userEventCoordinates = {
        lat: eventMarkerLocation.lat,
        lon: eventMarkerLocation.lng
      };


      if (circleBoundsVisible) {
        // Use raw marker position when the circle region is active (skip lookup)

        if (!findme_circle) {
          // prevent null reference to circle region
          console.error("unable to check bounds due to missing circle region")
        }
        else if (isInsideCircle(eventMarkerLocation)) {
          // save new valid marker position
          findme_marker.setLatLng(userEventCoordinates);
          activeMarkerLatLng = findme_marker.getLatLng();
        }

        return;
      }

      // show loading animation
      $("#findme h4").text(loadingText);
      $("#findme").addClass("progress-bar progress-bar-striped progress-bar-animated");

      let finalMarkerPositionLatLng = eventMarkerLocation;

      // search for valid marker location using a Nominatim point
      searchReverseLookup(userEventCoordinates)
        .then(foundAddress => {

          // convert Nominatim supplied nearby position to Leaflet
          const nominatimNearbyPosition = {
            lat: foundAddress.lat,
            lng: foundAddress.lon
          };

          const nominatim_boundingBox = foundAddress.boundingBox;
          const nominatimBounds = new L.LatLngBounds(
            [+nominatim_boundingBox[0], +nominatim_boundingBox[2]],
            [+nominatim_boundingBox[1], +nominatim_boundingBox[3]]);

          // user location is outside nominatim's bounding box (in a lake or some other bad business location)
          if (!nominatimBounds.contains(eventMarkerLocation)) {

            if (findme_boundingBox.getBounds().contains(nominatimNearbyPosition)) {
              // use the Nominatim supplied point since the user one is outside the Nominatim bounding box
              finalMarkerPositionLatLng = Object.assign({}, nominatimNearbyPosition);

            } else {
              // revert the "drag" since both locations are out of bounds
              finalMarkerPositionLatLng = Object.assign({}, activeMarkerLatLng);
            }
          }

          $("#map-information").html(manualPosition);
          $("#map-information").show();
          $('.step-2 a').attr('href', '#details');
          $('#step2').removeClass("disabled");
          setContinueEnabled(true);
        })

        .catch(err => {

          if (err) {
            if (err.error) {
              console.error(err.error);
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
          activeMarkerLatLng = findme_marker.getLatLng();

          // recenter map on original search location to deter map drifting too much
          findme_map.panTo(activeMarkerLatLng);
        });
    });
  }
  activeMarkerLatLng = findme_marker.getLatLng();

  findme_marker.setOpacity(1);
  findme_marker.setLatLng(mapLatLng);

  // start saving previous marker location
  activeMarkerLatLng = findme_marker.getLatLng();

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
  findme_circle = new L.circle(activeMarkerLatLng)
    .addTo(findme_map)
    .setRadius(circleRadiusMeters)
    .setStyle({ opacity: 0 });

  // compare default circle to returned bounding box
  circleBoundsVisible = !bounds.intersects(findme_circle.getBounds());

  if (circleBoundsVisible) {
    // show circle bounding box on map
    findme_circle.setStyle({ opacity: 1 });

  }
  // If the bounds is very small (< 1km on the diagonal), pad the bounds to make it visible
  if (bounds.getNorthEast().distanceTo(bounds.getSouthWest()) < 1000) {
    bounds = bounds.pad(0.5);
  }

  // add initial bounding box to map
  findme_boundingBox = new L.rectangle(bounds)
    .addTo(findme_map);

  // recenter map on found address
  findme_map.setView(mapLatLng, zoom);
}

/**
 * Is a point inside the circle region
 *
 * @param {string{}} LatLngPoint
 * @returns boolean
 */
function isInsideCircle(LatLngPoint) {

  if (!findme_circle) { return false }

  // distance between the current position of the marker and the center of the circle
  const markerDistance = findme_map.distance(LatLngPoint, findme_circle.getLatLng());

  // the marker is inside the circle when the distance is inferior to the radius
  return markerDistance < findme_circle.getRadius();
}

/**
 * Update address related HTML input fields
 * @param {NominatimAddress} chosen_place
 */
function updateAddressInfo(chosen_place) {

  $("#map-information").html(successString);
  $("#map-information").show();

  $('#addressalt').val(chosen_place.address.road);
  $('#hnumberalt').val(chosen_place.address.house_number);
  $('#city').val(chosen_place.address.village || chosen_place.address.town || chosen_place.address.city);
  $('#postcode').val(chosen_place.address.postcode);
  $("#address").val(chosen_place.display_name);
  if (!chosen_place.address.house_number) {
    $("#map-information").append('<hr> <i class="twa twa-warning"></i> ' + i18n.t('step1.nohousenumber'));
  } else {
    $('#step2').removeClass("disabled");
    $('.step-2 a').attr('href', '#details');
    setContinueEnabled(true);
    $("#address").addClass("is-valid");
    $("#address").removeClass("is-invalid");
  }

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
      'dataType': 'json',
      'timeout': 10000
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

  if (position.coords === undefined) {
    // leaflet
    latitude = position.lat;
    longitude = position.lon;

  } else {
    // browser (location) navigator
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;
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

        const dataError = data.error;
        // geocode error
        if (dataError !== undefined) {
          return reject(data);
        }

        resolve(parseData(data));
      },
      'error': function (error) {
        reject(error);
      },
      'dataType': 'json',
      'timeout': 10000
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

  // Nominatim returns an array of possible matches or single object
  const nominatimObject = Array.isArray(nominatimData) ? nominatimData[0] : nominatimData;

  const nominatimAddress = {};
  nominatimAddress.lon = nominatimObject.lon;
  nominatimAddress.lat = nominatimObject.lat;

  nominatimAddress.getLatLng = () => {
    return getLatLng(nominatimAddress);
  };

  // copy bounding box coordinates
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
  if (typeof (locationLatLng) == "object") {
    return {
      lat: Number(locationLatLng.lat),
      lng: locationLatLng.lon ? Number(locationLatLng.lon) : Number(locationLatLng.lng)
    };
  }
  return { lat: 0, lng: 0 };
}

// Step change

$(window).on('hashchange', function () {
  if (location.hash == '#details') {
    // check if marker location was set
    if (activeMarkerLatLng == null) {
      location.hash = '';
    }

    $('#collect-data-step').removeClass('d-none');
    $('#address-step').addClass('d-none');
    $('#confirm-step').addClass('d-none');
    $('#step2').addClass('active bg-success');
    $('#step3').removeClass('active bg-success');
  } else if (location.hash == '#done') {
    // clear global location variables to prevent duplicates
    activeMarkerLatLng = null
    activeSearchAddress = null

    clearFields();
    $('#confirm-step').removeClass('d-none');
    $('#collect-data-step').addClass('d-none');
    $('#address-step').addClass('d-none');
    $('#step3').addClass('active bg-success');
    $('#required_info_alert').addClass('alert-info').removeClass('alert-danger');
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

function disableDelivery() { $("#delivery").attr("disabled", true); $("#delivery_description").attr("disabled", true); $("#delivery-details").addClass("d-none"); }
function enableDelivery() { $("#delivery").removeAttr("disabled"); $("#delivery_description").removeAttr("disabled"); $("#delivery-details").removeClass("d-none"); }

// Show the takeaway description field only when takeaway is offered.
// https://github.com/osmlab/onosm.org/issues/106
$(function () {
  $('input[name=takeaway]').change(function () {
    $('#takeaway-description-group').toggleClass('d-none', this.value === 'no');
  });
});

// fieldValue returns the trimmed value of the given input with any line
// breaks collapsed to spaces, so a multi-line value can't masquerade as
// additional key=value lines in the note body.
function fieldValue(selector) {
  return ($(selector).val() || "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

// editableFieldSpecs lists every form field that has a corresponding OSM
// tag key in the note body, in the same order the note body has always used.
// Shared by getNoteBody() (both plain and edit-mode/diff rendering) and
// editModeHasChanges() (the "nothing changed" guard).
const editableFieldSpecs = [
  { selector: "#name", tag: "name" },
  { selector: "#category", tag: "category" },
  { selector: "#categoryalt", tag: "description" },
  { selector: "#hnumberalt", tag: "addr:housenumber" },
  { selector: "#addressalt", tag: "addr:street" },
  { selector: "#placenamealt", tag: "addr:place" },
  { selector: "#city", tag: "addr:city" },
  { selector: "#postcode", tag: "addr:postcode" },
  { selector: "#phone", tag: "phone" },
  { selector: "#website", tag: "website" },
  { selector: "#social", tag: "social" },
  { selector: "#opening_hours", tag: "opening_hours" },
  { selector: "#wheel", tag: "wheelchair" }
];

// noteBodyFieldLine renders one line of the note body for a field. Outside
// edit mode this is unchanged from before: "key=value\n" when non-empty,
// nothing otherwise. In edit mode it instead diffs the current value
// against editContext.prefilled (fields with no tag counterpart -- category,
// description, social, ... -- are treated as having had no prior value, so
// any entered value shows as "(new)"), and cleared fields are silently
// ignored rather than reported as removals.
function noteBodyFieldLine(selector, tagKey) {
  const newValue = fieldValue(selector);

  if (!editContext) {
    return newValue ? tagKey + " = " + newValue + "\n" : "";
  }

  if (!newValue) return "";

  const oldValue = (editContext.prefilled && editContext.prefilled[selector]) || "";
  if (newValue === oldValue) return "";

  return oldValue
    ? tagKey + " = " + newValue + " (was " + oldValue + ")\n"
    : tagKey + " = " + newValue + " (new)\n";
}

// markerMoveDistanceMeters returns how far the marker has moved from the
// edited element's original position, or 0 when not in edit mode / no
// marker is placed yet.
function markerMoveDistanceMeters() {
  if (!editContext || !findme_marker) return 0;
  return findme_map.distance(findme_marker.getLatLng(), { lat: editContext.lat, lng: editContext.lon });
}

// editModeHasChanges returns true when the user has actually suggested a
// change to the edited element: a differing field or a marker move of more
// than ~10 m. Used to block submitting a no-op edit-mode note.
function editModeHasChanges() {
  if (!editContext) return false;

  const fieldChanged = editableFieldSpecs.some(function (f) {
    return noteBodyFieldLine(f.selector, f.tag) !== "";
  });

  return fieldChanged || markerMoveDistanceMeters() > 10;
}

function getNoteBody() {
  var paymentIds = [];
  $.each($("#payment").select2("data"), function (_, e) {
    paymentIds.push(e.id);
  });

  var note_body = editContext
    ? "onosm.org suggested update to https://osm.org/" + editContext.type + "/" + editContext.id + " from the business:\n"
    : "onosm.org submitted note from a business:\n";

  editableFieldSpecs.forEach(function (f) {
    note_body += noteBodyFieldLine(f.selector, f.tag);
  });
  paymentIds.forEach(function (id) { note_body += id + "\n"; });

  // delivery
  if ($("input:checked[name=delivery-check]").val() && fieldValue("#delivery") != "")
    note_body += `delivery = ${fieldValue("#delivery")}\n`;
  else if ($("input:checked[name=delivery-check]").val() && fieldValue("#delivery") == "")
    note_body += "delivery = yes\n";
  else if ($('#delivery-check').not(':indeterminate') == true)
    note_body += "delivery = no\n";

  if (fieldValue("#delivery_description")) note_body += `delivery:description = ${fieldValue("#delivery_description")}\n`;

  // take-away
  if ($("input:checked[name=takeaway]").val())
    note_body += `takeaway = ${$("input:checked[name=takeaway]").val()}\n`;
  if (fieldValue("#takeaway_description"))
    note_body += `takeaway:description = ${fieldValue("#takeaway_description")}\n`;

  // If the marker was dragged away from the edited element's own position,
  // record that as part of the suggestion too.
  if (editContext && markerMoveDistanceMeters() > 10) {
    const movedTo = findme_marker.getLatLng();
    note_body += "location moved to " + movedTo.lat.toFixed(5) + ", " + movedTo.lng.toFixed(5) + "\n";
  }

  // Source hashtag so notes from onosm.org (as opposed to one of its forks)
  // can be found/filtered, and the date lets us tell whether a given issue
  // has since been fixed. See https://github.com/osmlab/onosm.org/issues/117
  var today = new Date().toISOString().slice(0, 10);
  note_body += "\n#OnOSM.org-" + today;

  return note_body;
}

// hasMinimumData returns true if the form has the minimum data required to create a note.
// We want to see at least a name, a city, and a category/description. In
// edit mode the category picker is intentionally left blank (see
// showEditModeBanner()), so it isn't required there.
function hasMinimumData() {
  if (editContext) {
    return $("#name").val() && $("#city").val();
  }
  return $("#name").val() && $("#city").val() && ($("#category").val() || $("#categoryalt").val());
}

// hasValidLocation returns true if the user has actually searched for and/or
// placed a marker for this note. Relying only on hash-based navigation to
// keep users off step 2 without a location isn't enough on its own -- e.g. a
// keyboard user can activate the visually-"disabled" Continue link, or a
// stale marker from a previous note can be left in place -- so this is
// checked again immediately before a note is submitted.
// https://github.com/osmlab/onosm.org/issues/103
function hasValidLocation() {
  return findme_marker !== null && activeMarkerLatLng !== null;
}

$("#collect-data-done").click(function (event) {
  // https://stackoverflow.com/questions/18274383/ajax-post-working-in-chrome-but-not-in-firefox
  event.preventDefault();

  $("#edit-nothing-changed-alert").hide();

  // Don't submit if the form is invalid
  if (!hasMinimumData() || !hasValidLocation()) {
    event.stopPropagation();
    $("#required_info_alert").removeClass("alert-info");
    $("#required_info_alert").addClass("alert-danger");
    if (!hasValidLocation()) {
      location.hash = '';
    }
    return;
  }

  // In edit mode, don't let a no-op "note" go out just because the user
  // clicked through without actually changing anything.
  if (editContext && !editModeHasChanges()) {
    event.stopPropagation();
    $("#required_info_alert").removeClass("alert-info");
    $("#required_info_alert").addClass("alert-danger");
    $("#edit-nothing-changed-alert").show();
    return;
  }

  var latlon = findme_marker.getLatLng(),
    qwarg = {
      lat: latlon.lat,
      lon: latlon.lng,
      text: getNoteBody()
    };

  // Disable the button while the note is created so an impatient second
  // click can't create a duplicate, and only show the "Thanks!" step once
  // the note actually exists. https://github.com/osmlab/onosm.org/issues/118
  $("#collect-data-done").prop('disabled', true);

  $.post('https://api.openstreetmap.org/api/0.6/notes.json', qwarg)
    .done(function (data) {
      var noteId = data.properties.id;
      var link = 'https://openstreetmap.org/?note=' + noteId + '#map=19/' + latlon.lat + '/' + latlon.lng + '&layers=N';
      $("#linkcoords").append('<div class="mt-3 h4"><a href="' + link + '">' + link + '</a></div>');
      $("#submit-error").hide();
      location.hash = '#done';
    })
    .fail(function () {
      $("#submit-error").show();
    })
    .always(function () {
      $("#collect-data-done").prop('disabled', false);
    });
});

// setContinueEnabled toggles the "Continue" link between its disabled and
// enabled states. The "disabled" class alone only blocks mouse clicks
// (via pointer-events: none); aria-disabled/tabindex are needed so the link
// can't be activated by keyboard (or an errant Enter) while a location
// hasn't actually been set. https://github.com/osmlab/onosm.org/issues/103
function setContinueEnabled(enabled) {
  $('#continue')
    .toggleClass('disabled', !enabled)
    .attr('aria-disabled', String(!enabled))
    .attr('tabindex', enabled ? null : '-1');
}

function clearFields() {
  $("#form")[0].reset();
  $("#address").val("");
  $("#submit-error").hide();
  $("#category").select2("val", "");
  $("#payment").select2("val", "");
  $('#delivery-check').val("");
  $('#delivery-check').prop('indeterminate', true);
  disableDelivery();
  $('#takeaway-description-group').addClass("d-none");
  $('#step2').addClass("disabled");
  setContinueEnabled(false);

  exitEditMode();
}
