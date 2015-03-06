define(['jquery', 'appearanceUtils'], function($, utils) {
   return [
      {
         title: "CI Blocked",
         id: "ciBlocked",
         selector: function(pull) {
            return !pull.dev_blocked() && (pull.build_failed() || (pull.cr_done() && pull.qa_done() && !pull.build_succeeded()));
         },
         sort: function(pull) {
            var score = 0;
            if (pull.is_mine()) {
               score -= 30;
            }

            score -= pull.status.CR.length * 1;
            score -= pull.status.QA.length * 2;

            if (!pull.build_failed()) {
               score += 15;
            }

            return score;
         },
         triggers: {
            onCreate: function(blob, container) {
               blob.removeClass('panel-default').addClass('panel-primary');
            },
            onUpdate: function(blob, container) {
               utils.hideIfEmpty(container, blob, '.pull');
            }
         },
         shrinkToButton: true
      },
      {
         title: "deploy_blocked Pulls",
         id: "deployBlockPulls",
         selector: function(pull) {
            return pull.ready() && pull.deploy_blocked();
         },
         triggers: {
            onCreate: function(blob, container) {
               blob.removeClass('panel-default').addClass('panel-primary');
            },
            onUpdate: function(blob, container) {
               utils.hideIfEmpty(container, blob, '.pull');
            }
         },
         shrinkToButton: true
      },
      {
         title: "Ready Pulls",
         id: "readyPulls",
         selector: function(pull) {
            return pull.ready() && !pull.deploy_blocked();
         },
         triggers: {
            onCreate: function(blob, container) {
               blob.removeClass('panel-default').addClass('panel-success');
            },
            onUpdate: function(blob, container) {
               utils.hideIfEmpty(container, blob, '.pull');
            }
         },
         shrinkToButton: true
      },
      {
         title: "dev_blocked Pulls",
         id: "blockPulls",
         selector: function(pull) {
            return pull.dev_blocked();
         },
         sort: function(pull) {
            var most_recent_block = pull.status.dev_block.slice(-1)[0].data;
            var date = new Date(most_recent_block.created_at);

            // Pulls that have been dev_blocked longer are higher priority.
            var score = -1/date.valueOf();

            if(pull.is_mine()) {
               score -= 1;
            }

            return score;
         },
         indicators: {
            actor: function actor(pull, node) {
               var current_block = pull.status.dev_block.slice(-1)[0].data;

               var date = new Date(current_block.created_at);

               var link = utils.getCommentLink(pull, current_block);

               var label = $('<span class="label label-default"></span>');

               label.text(utils.formatDate(date));
               link.append(label);
               utils.addActionTooltip(link, "dev_block'd",
               current_block.created_at, current_block.user.login);

               node.append(link);
            }
         }
      },
      {
         title: "CR Pulls",
         id: "crPulls",
         selector: function(pull) {
            return !pull.cr_done() && !pull.dev_blocked();
         },
         sort: function(pull) {
            if (pull.is_mine()) {
               return 3;
            } else if (pull.qa_done() && pull.build_succeeded()) {
               return 0;
            } else if (pull.qa_done()) {
               return 1;
            } else {
               return 2;
            }
         }
      },
      {
         title: "QA Pulls",
         id: "qaPulls",
         selector: function(pull) {
            return !pull.qa_done() && !pull.dev_blocked() &&
            !pull.build_failed();
         },
         sort: function(pull) {
            // The higher score is, the lower the pull will be sorted.
            // So a lower score means an item shows higher in the list.
            var score = 0;

            var label = pull.getLabel('QAing')

            if (label && label.user == App.user) {
               score -= 1000;
            }

            if (pull.is_mine()) {
               score += 500;
            }

            if (pull.build_succeeded()) {
               score -= 2;
            }

            if (pull.cr_done()) {
               score -= 1;
            }

            return score;
         },
         indicators: {
            qa_in_progress: function qa_in_progress(pull, node) {
               if (label = pull.getLabel('QAing')) {
                  var labelElem = $('<span>' + label.title + '</span>');
                  if (label.user == App.user) {
                     var labelclass = 'label-success';
                  } else {
                     var labelclass = 'label-warning';
                  }
                  labelElem.addClass('label ' + labelclass);
                  labelElem = utils.addActionTooltip(labelElem, '',
                  label.created_at, label.user);

                  node.append(labelElem);
               }
            }
         }
      }
      ];
   });
