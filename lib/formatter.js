var _ = require('underscore');
function Formatter() {
}

function format(template, data, diff) {
   var root = template.root;
   var result = {};
   root.forEach(function(field) {
      var context = data[field];
      if (diff && diff[field]) {
         var diffContext = diff[field];
         value = formatDiff(context, data, diffContext);
      } else if (template[field]) {
         value = formatSubstructure(field, context, template);
      } else {
         if (_.isArray(context) || _.isObject(context)) {
            throw new TypeError("Code attempted to map a deep structure: " + field);
         }
         value = context;
      }
      result[field] = value;
   });
   return result;
}

function formatSubstructure(field, context, template) {
   var subTemplate = _.clone(template);
   var subRoot = template[field];
   subTemplate.root = subRoot;
   return format(subTemplate, context);
}

function formatDiff(context, data, diffContext) {
      if (_.isFunction(diffContext)) {
         return diffContext(context, data);
      } else if (_.isArray(diffContext)) {
         return format({root: diffContext}, context);
      } else if (_.isObject(diffContext)) {
         var keys = _.keys(diffContext);
         var result = {};
         keys.forEach(function(field) {
            var fieldContext = null;
            if (_.isObject(context)) {
               fieldContext = context[field];
            }
            var fieldDiff = diffContext[field];
            result[field] = formatDiff(fieldContext, data, fieldDiff);
         });
         return result;
      } else if (diffContext === null) {
         return context;
      } else {
         return data[diffContext];
      }
}

Formatter.prototype.format = format;
module.exports = Formatter;
