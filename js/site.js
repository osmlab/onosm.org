/*select language to use*/
var onOSMlang = 'it-IT';

var successString, manualPosition, loadingText, modalText;

i18n.init({
  fallbackLng: 'it-IT',
  lngWhitelist: ['en-GB', 'it-IT'],
  postAsync: 'false'
}, function() {
  $("body").i18n();
  successString = i18n.t('messages.success', {
    escapeInterpolation: false
  });
  manualPosition = i18n.t('messages.manualPosition', {
    escapeInterpolation: false
  });
  loadingText = i18n.t('messages.loadingText');
  modalText = {};
  modalText.text = i18n.t('messages.modalTitle');
  modalText.button = i18n.t('messages.modalButton');

  onOSMlang = i18n.lng();
  $.getJSON('./locales/' + onOSMlang + '/categories.json').success(function(data) {
    category_data = data;
  });

  $.getJSON('./locales/' + onOSMlang + '/payment.json').success(function(data) {
    payment_data = data;
  });

});

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


if (location.hash) location.hash = '';




$("#category").select2({
  query: function(query) {
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

$("#payment").select2({
  multiple: true,
  query: function(query) {
    var data = {
      results: []
    };
    data.results = payment_data;
    query.callback(data);
  }
});


/* search action */
$("#find").submit(function(e) {
  e.preventDefault();
  $("#couldnt-find").hide();
  var address_to_find = $("#address").val();
  if (address_to_find.length === 0) return;

  /* NOMINATIM PARAM */
  var qwarg_nominatim = {
    format: 'json',
    q: address_to_find,
    addressdetails: 1,
    namedetails: 1
  };
  var url_nominatim = "https://nominatim.openstreetmap.org/search?" + $.param(qwarg_nominatim);


  $("#findme h4").text(loadingText);
  $("#findme").addClass("progress-bar progress-bar-striped progress-bar-animated");


  $.ajax({
    'url': url_nominatim,
    'success': nominatim_callback,
    'dataType': 'jsonp',
    'jsonp': 'json_callback'
  });

});

function nominatim_callback(data) {
  if (data.length > 0) {
    var chosen_place = data[0];

    var bounds = new L.LatLngBounds(
      [+chosen_place.boundingbox[0], +chosen_place.boundingbox[2]],
      [+chosen_place.boundingbox[1], +chosen_place.boundingbox[3]]);

    findme_map.fitBounds(bounds);
    findme_marker.setOpacity(1);
    findme_marker.setLatLng([chosen_place.lat, chosen_place.lon]);
    $('#instructions').html(successString);
    $('#step2').removeClass("disabled");
    $('#continue').removeClass("disabled");
    $('.step-2 a').attr('href', '#details');
    $('#addressalt').val(chosen_place.address.road);
    $('#hnumberalt').val(chosen_place.address.house_number);
    $('#city').val(chosen_place.address.village || chosen_place.address.town || chosen_place.address.city);
    $('#postcode').val(chosen_place.address.postcode);
  } else {
    $("#couldnt-find").show();
  }
  $("#findme").removeClass("progress-bar progress-bar-striped progress-bar-animated");
}

function solr_callback(data) {
  if (data.response.docs.length > 0) {
    var docs = data.response.docs;
    var coords = docs[0].coordinate.split(',');
    findme_marker.setOpacity(1);
    findme_marker.setLatLng([coords[0], coords[1]]);
    findme_map.setView([coords[0], coords[1]], 16);
    $('#instructions').html(successString);
    $('#step2').removeClass("disabled");
    $('#continue').removeClass("disabled");
    $('.step-2 a').attr('href', '#details');
  } else {
    $("#couldnt-find").show();
  }
  $("#findme").removeClass("loading");
}

/* map action */
findme_map.on('click', function(e) {
  findme_marker.setOpacity(1);
  findme_marker.setLatLng(e.latlng);
  $('#instructions').html(manualPosition);
  $('.step-2 a').attr('href', '#details');
  $('#step2').removeClass("disabled");
  $('#continue').removeClass("disabled");
});

$(window).on('hashchange', function() {
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
    confetti.start(1000);
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
$(function() {deliveryCheck(); $("#delivery-check").click(deliveryCheck);});
function deliveryCheck() { if (this.checked){ $("#delivery").removeAttr("disabled"); $("#delivery_description").removeAttr("disabled"); $("#label-delivery-check").html(i18n.t('step2.yes'));} else {$("#delivery").attr("disabled", true);$("#delivery_description").attr("disabled", true); $("#label-delivery-check").html(i18n.t('step2.no'));}}

function getNoteBody() {
  var paymentIds = [],
    paymentTexts = [];
  $.each($("#payment").select2("data"), function(_, e) {
    paymentIds.push(e.id);
    paymentTexts.push(e.text);
  });

  var note_body = "E' stata inviata una nota tramite su.openstreetmap.it:\n";
  if ($("#name").val()) note_body += i18n.t('step2.name') + ": " + $("#name").val() + "\n";
  if ($("#phone").val()) note_body += i18n.t('step2.phone') + ": " + $("#phone").val() + "\n";
  if ($("#website").val() != "https://") note_body += i18n.t('step2.website') + ": " + $("#website").val() + "\n";
  if ($("#social").val()) note_body += i18n.t('step2.social') + ": " + $("#social").val() + "\n";
  if ($("#opening_hours").val()) note_body += i18n.t('step2.opening') + ": " + $("#opening_hours").val() + "\n";
  if ($("#wheel").val()) note_body += i18n.t('step2.wheel') + ": " + $("#wheel").val() + "\n";
  if ($("#category").val()) note_body += i18n.t('step2.catlabel') + ": " + $("#category").val() + "\n";
  if ($("#categoryalt").val()) note_body += i18n.t('step2.cataltdesc') + ": " + $("#categoryalt").val() + "\n";
  if ($("#addressalt").val()) note_body += i18n.t('step2.addressaltdesc') + ": " + $("#addressalt").val() + " " + $("#hnumberalt").val() + ", " + $("#postcode").val() + " " + $("#city").val() + "\n";
  if (paymentIds) note_body += i18n.t('step2.payment') + ": " + paymentTexts.join(",") + "\n";
  if ($("input:checked[name=delivery-check]").val() && $("#delivery").val() != "") note_body += i18n.t('step2.deliverydesc') + $("#delivery").val() + "\n"; else if ($("input:checked[name=delivery-check]").val() && $("#delivery").val() == "") note_body += i18n.t('step2.deliverydesc') + i18n.t('step2.yes') + "\n"; else if ($('#delivery-check').not(':indeterminate') == true) note_body += i18n.t('step2.deliverydesc') + i18n.t('step2.no') + "\n";
  if ($("#delivery_description").val()) note_body += i18n.t('step2.delivery_descriptiondesc') + ": " + $("#delivery_description").val() + "\n";
  if ($("input:checked[name=takeaway]").val() === 'yes') note_body += i18n.t('step2.takeawaydesc') + ": " + i18n.t('step2.yes') + "\n";
  if ($("input:checked[name=takeaway]").val() === 'only') note_body += i18n.t('step2.takeawaydesc') + ": " + i18n.t('step2.only_takeaway') + "\n";
  if ($("#takeaway_description").val()) note_body += i18n.t('step2.takeaway_descriptiondesc') + ": " + $("#takeaway_description").val() + "\n";


  note_body += "\nTag suggeriti: (⚠️ = "+ i18n.t('messages.needsChecking') + ")\n";
  if ($("#name").val()) note_body += "name=" + $("#name").val() + "\n";
  if ($("#addressalt").val()) note_body += "addr:street=" + $("#addressalt").val() + "\n";
  if ($("#hnumberalt").val()) note_body += "addr:housenumber=" + $("#hnumberalt").val() + "\n";
  if ($("#city").val()) note_body += "addr:city=" + $("#city").val() + "\n";
  if ($("#postcode").val()) note_body += "addr:postcode=" + $("#postcode").val() + "\n";
  if ($("#phone").val()) note_body += "⚠️ contact:phone|mobile=" + $("#phone").val() + "\n";
  if ($("#website").val() != "https://") note_body += "contact:website=" + $("#website").val() + "\n";
  if ($("#social").val()) note_body += "⚠️ contact:facebook|instagram|other=" + $("#social").val() + "\n";
  if ($("#opening_hours").val()) note_body += "⚠️ opening_hours=" + $("#opening_hours").val() + "\n";
  if ($("#wheel").val()) note_body += "wheelchair=" + $("#wheel").val() + "\n";
  if ($("#categoryalt").val()) note_body += "description=" + $("#categoryalt").val() + "\n";
  if (paymentIds) note_body += paymentIds.join("\n") + "\n";
  if ($("input:checked[name=delivery-check]").val() && $("#delivery").val() != "") note_body += "⚠️ delivery=" + $("#delivery").val() + "\n"; else if ($("input:checked[name=delivery-check]").val() && $("#delivery").val() == "") note_body += "delivery=yes" + "\n"; else if($('#delivery-check').not(':indeterminate') == true) note_body += "delivery=no" + "\n";
  if ($("#delivery_description").val()) note_body += "delivery:description=" + $("#delivery_description").val() + "\n";
  if ($("input:checked[name=takeaway]").val() != "undefined") note_body += "takeaway=" + $("input:checked[name=takeaway]").val() + "\n";
  if ($("#takeaway_description").val()) note_body += "takeaway:description=" + $("#takeaway_description").val() + "\n";
  if ($("input:checked[name=delivery_covid]").val() === 'Y') note_body += "delivery:covid19=yes\n";
  if ($("input:checked[name=takeaway_covid]").val() == "yes" || $("input:checked[name=takeaway_covid]").val() == "only") note_body += "takeaway:covid19=" + $("input:checked[name=takeaway_covid]").val() + "\n";
  if ($("#delivery_covid_description").val() || $("#takeaway_covid_description").val()) note_body += "description:covid19=";
  if ($("#delivery_covid_description").val()) note_body += $("#delivery_covid_description").val() + " ";
  if ($("#takeaway_covid_description").val()) note_body += $("#takeaway_covid_description").val() + "\n";
  return note_body;
}

$("#collect-data-done").click(function() {
  location.hash = '#done';

  var latlon = findme_marker.getLatLng(),
    qwarg = {
      lat: latlon.lat,
      lon: latlon.lng,
      text: getNoteBody()
    };

  $.post('https://api.openstreetmap.org/api/0.6/notes.json', qwarg, function(data) {
    // console.log(data);
    var noteId = data['properties']['id'];
    var link = 'https://openstreetmap.org/?note=' + noteId + '#map=19/' + latlon.lat + '/' + latlon.lng + '&layers=N';
    $("#linkcoords").append('<div class="mt-3 h4"><a href="' + link + '">' + link + '</a></div>');
  });
});

function clearFields() {
  $("#form")[0].reset();
  $("#category").select2("val", "");
  $("#payment").select2("val", "");
  $('#delivery-check').prop('indeterminate', true);
}
