/*
 * Extended of example from http://craigsworks.com/projects/qtip/demos/effects/modal
 */
$(document).ready(function()
{   
   $.get('wheelchair.html', function(data) {

      $('a[rel="modal"]:first').qtip(
      {
         content: {
            title: {
               text: 'Classificazione dell\'accessibilità in sedia a rotelle',
               button: 'Chiudi'
            },
            text: data
         },
         position: {
            target: $(document.body), // Position it via the document body...
            corner: 'center' // ...at the center of the viewport
         },
         show: {
            when: 'click', // Show it on click
            solo: true // And hide all other tooltips
         },
         hide: false,
         style: {
            width: { max: 650 },
            padding: '14px',
            border: {
               width: 9,
               radius: 9,
               color: '#666666'
            },
            name: 'light'
         },
         api: {
            beforeShow: function()
            {
               // Fade in the modal "blanket" using the defined show speed
               $('#qtip-blanket').fadeIn(this.options.show.effect.length);
            },
            beforeHide: function()
            {
               // Fade out the modal "blanket" using the defined hide speed
               $('#qtip-blanket').fadeOut(this.options.hide.effect.length);
            }
         }
      });
   
   });

   // Create the modal backdrop on document load so all modal tooltips can use it
   $('<div id="qtip-blanket">')
      .css({
         position: 'absolute',
         top: $(document).scrollTop(), // Use document scrollTop so it's on-screen even if the window is scrolled
         left: 0,
         height: $(document).height(), // Span the full document height...
         width: '100%', // ...and full width

         opacity: 0.7, // Make it slightly transparent
         backgroundColor: 'black',
         zIndex: 5000  // Make sure the zIndex is below 6000 to keep it below tooltips!
      })
      .appendTo(document.body) // Append to the document body
      .hide(); // Hide it initially

});
