var socketAuthenticator = require('../lib/socket-auth');

module.exports = {
   index: function(req, res) {

      // Allow returning to the page via backspace to work
      // When the user returns to the page, he usually gets a browser-cached
      //  version. This tells the browser not to cache the page so that it is
      //  always reloaded
      // http://stackoverflow.com/a/6098245
      res.header('Cache-Control',
       'no-cache, private, no-store, must-revalidate, max-stale=0,' +
       'post-check=0, pre-check=0');

      res.render('home/index', {
         socketToken: socketAuthenticator.getTokenForUser(req.user)
      });
   }
}
