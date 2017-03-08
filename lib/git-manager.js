var GithubApi = require('github'),
    Promise = require('promise'),
    config = require('../config'),
    _ = require('underscore'),
    debug = require('debug')('pulldasher:github'),
    utils = require('./utils'),
    Pull = require('../models/pull'),
    Issue = require('../models/issue'),
    Comment = require('../models/comment'),
    Label = require('../models/label'),
    Status = require('../models/status'),
    Signature = require('../models/signature'),
    getLogin  = require('./get-user-login');
    // rateLimit = require('./rate-limit.js');

const github = new GithubApi({
      debug: true,
      version: '3.0.0'
});

github.authenticate({
   type: 'oauth',
   token: config.github.token
});

// TODO: Super important. Bake rate limit into export object

module.exports = {
   /**
    * Returns a promise which resolves to a GitHub API response to
    * a query for a particular Pull Request.
    */
   getPull: function(number) {
      debug("Getting pull %s", number);
      return github.pullRequests.get(params({number}));
   },

   /**
    * Get all *open* pull requests for a repo.
    *
    * Returns a promise which resolves to an array of all open pull requests
    */
   getOpenPulls: function() {
      debug("Getting open pulls");
      return github.pullRequests.getAll(params()).then(getAllPages());
   },

   /**
    * Get *all* pull requests for a repo.
    *
    * Returns a promise which resolves to an array of all pull requests
    */
   getAllPulls: function() {
      debug("Getting all pulls");
      return github.pullRequests.getAll(params({
         state:      'all'
      })).then(getAllPages());
   },

   /**
    * Get an issue for a repo.
    *
    * Returns a promise which resolves to a github issue
    */
   getIssue: function(number) {
      debug("Getting issue %s", number);
      return github.issues.get(params({number}));
   },

   /**
    * Get all open issues for a repo.
    *
    * Returns a promise which resolves to an array of all open issues
    */
   getOpenIssues: function() {
      debug("Getting open issues");
      return github.issues.getForRepo(params())
      .then(getAllPages())
      .then(filterOutPulls);
   },

   /**
    * Get *all* issues for a repo.
    *
    * Returns a promise which resolves to an array of all issues
    */
   getAllIssues: function() {
      debug("Getting all issues");
      return github.issues.getForRepo(params({
         state:      'all'
      })).then(getAllPages())
      .then(filterOutPulls);
   },

   getTeams: (org) => {
      return github.orgs.getTeams({org});
   },

   getTeamMembership: options => {
      return github.orgs.getTeamMembership(options);
   },

   getOrgMembership: options => {
      return github.orgs.getOrgMembership(options);
   },

   /**
    * Takes a promise that resolves to a GitHub pull request API response,
    * parses it, and returns a promise that resolves to a Pull objects.
    */
   parse: function(githubPull) {
      debug("Getting all information for pull %s", githubPull.number);
      // We've occasionally noticed a null pull body, so lets fix it upfront
      // before errors happen.
      githubPull.body = githubPull.body || '';

      var reviewComments = getPullReviewComments(githubPull.number);
      var comments = getIssueComments(githubPull.number);
      var headCommit = getCommit(githubPull.head.sha);
      var commitStatus = getCommitStatus(githubPull.head.sha);
      var events = getIssueEvents(githubPull.number);
      // Only so we have the canonical list of labels.
      var ghIssue = module.exports.getIssue(githubPull.number);

      // Returned to the map function. Each element of githubPulls maps to
      // a promise that resolves to a Pull.
      return Promise.all([reviewComments,
                          comments,
                          headCommit,
                          commitStatus,
                          events,
                          ghIssue])
       .then(function(results) {
         var reviewComments = results[0],
             comments       = results[1],
             headCommit     = results[2],
             commitStatus   = results[3],
             events         = results[4],
             ghIssue        = results[5];

         // Array of Signature objects.
         var signatures = comments.reduce(function(sigs, comment) {
            var commentSigs = Signature.parseComment(comment, githubPull.number);

            // Signoffs from before the most recent commit are no longer active.
            var headCommitDate = new Date(headCommit.commit.committer.date);
            commentSigs.forEach(function(signature) {
               if ((signature.data.type === 'CR' ||
                signature.data.type === 'QA') &&
                new Date(signature.data.created_at) < headCommitDate) {
                  signature.data.active = false;
               }
            });

            return sigs.concat(commentSigs);
         }, []);

         // Array of Comment objects.
         comments = comments.map(function(commentData) {
            commentData.number = githubPull.number;
            commentData.repo = githubPull.base.repo.name;
            commentData.type = 'issue';

            return new Comment(commentData);
         });

         // Array of Comment objects.
         comments = comments.concat(reviewComments.map(function(commentData) {
            commentData.number = githubPull.number;
            commentData.repo = githubPull.base.repo.name;
            commentData.type = 'review';

            return new Comment(commentData);
         }));

         // Status object.
         var status = null;
         if (commitStatus) {
            status = new Status({
               sha:           githubPull.head.sha,
               state:         commitStatus.state,
               description:   commitStatus.description,
               target_url:    commitStatus.target_url
            });
         }

         // Array of Label objects.
         var labels = getLabelsFromEvents(events, ghIssue, githubPull.base.repo.name);

         var pull = new Pull(githubPull, signatures, comments, status, labels);
         return pull.syncToIssue();
      });
   },

   /**
    * Takes a GitHub issue API response
    * parses it, and returns a promise that resolves to an Issue object.
    */
   parseIssue: function(ghIssue) {
      debug("Getting all information for issue %s", ghIssue.number);
      return getIssueEvents(ghIssue.number)
      .then(function(events) {
         // Array of Label objects.
         // Note: using the repo name from the config for now until we support
         // multiple repos. The ghIssue object doesn't contain the repo name.
         var labels = getLabelsFromEvents(events, ghIssue, config.repo.name);

         return Issue.getFromGH(ghIssue, labels);
      });
   },
};

/**
 * Traverses github's pagination to retrieve *all* the records.
 * Takes in the first page of results and returns a promise for *all* the
 * results.
 */
function getAllPages() {
   let total = [];

   let pager = (results) => {
      const data = results.data;

      debug("Got %s results", data.length);
      total = total.concat(data);

      if (github.hasNextPage(results)) {
         return github.getNextPage(results).then(pager);
      }

      debug("No more results");
      return total;
   };

   return pager;
}

/**
 * Get array of Label objects from complete list of a Issue's events.
 */
function getLabelsFromEvents(events, ghIssue, repoName) {
   debug("Extracting label assignments from %s issue events for #%s",
    events.length, ghIssue.number);

   // Narrow list to relevant labeled/unlabeled events.
   events = _.filter(events, function(event) {
      return event.event === 'labeled' || event.event === 'unlabeled';
   });

   debug("Found %s label events for #%s", events.length, ghIssue.number);

   // Build simple Event objects with all the info we care about.
   events = events.map(function(event) {
      return {
         type: event.event,
         name: event.label.name,
         user: getLogin(event.actor),
         created_at: utils.fromDateString(event.created_at)
      };
   });

   // Group label events by label name.
   var labels = _.groupBy(events, 'name');

   // Get a list of the most recent events for each label.
   labels = _.map(labels, function(events) {
      events = _.sortBy(events, 'created_at');
      return _.last(events);
   });

   labels = _.filter(labels, function(event) {
      return event.type === 'labeled';
   });

   debug("Found %s unique labels for #%s", labels.length, ghIssue.number);

   // If these are available, use them as the canonical source, only augmented
   // by the data from events. If a label is renamed, the events will retain
   // the old name but the list of labels on the issue itself will be correct.
   // So, if a label is renamed, we'll lose the labeler and the date.
   if (ghIssue.labels && ghIssue.labels.length) {
      debug("Using %s labels from the github issue", ghIssue.labels.length);
      // Includes labeller and a time from the events api
      var eventLabels = _.indexBy(labels, 'name');

      return ghIssue.labels.map(function(label) {
         var eventLabel = eventLabels[label.name];
         return new Label(
            {name: label.name},
            ghIssue.number,
            repoName,
            eventLabel && eventLabel.user,
            eventLabel && eventLabel.created_at
         );
      });
   }

   // Construct Label objects.
   return labels.map(function(label) {
      return new Label(
         {name: label.name},
         ghIssue.number,
         repoName,
         label.user,
         label.created_at
      );
   });
}

/**
 * Return the default api params merged with the overrides
 */
function params(apiParams) {
   return _.extend({
      owner:      config.repo.owner,
      repo:       config.repo.name,
      per_page:   100,
   }, apiParams);
}

/**
 * Return a promise for all issue events for the given issue / pull
 */
function getIssueEvents(number) {
   debug("Getting events for issue #%s", number);
   return github.issues.getEvents(params({
      issue_number: number
   })).then(getAllPages());
}

function getIssueComments(number) {
   debug("Getting comments for issue #%s", number);
   return github.issues.getComments(params({number}));
}

function getPullReviewComments(number) {
   debug("Getting pull review comments for pull #%s", number);
   return github.pullRequests.getComments(params({number}));
}

function getCommit(sha) {
   debug("Getting commit %s", sha);
   return github.repos.getCommit(params({sha}));
}

function getCommitStatus(sha) {
   debug("Getting commit status for %s", sha);
   return github.repos.getCommitStatuses(params({
      ref: sha
   })).then(res => {
      if (res.data.length) {
         return res.data[0];
      }

      return null;
   });
}

/**
 * Remove all entries that have the pull_request key set to something truthy
 */
function filterOutPulls(issues) {
   debug("Filtering out pulls from list of %s issues", issues.length);
   issues = _.filter(issues, issue => {
      return !issue.pull_request || !issue.pull_request.url;
   });
   debug("Filtered down to %s issues", issues.length);
   return issues;
}
