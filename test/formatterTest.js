var assert = require('assert');
var Formatter = require('../lib/formatter');
var chai = require('chai');
var expect = chai.expect;

var fields = {
   root: [
      'number',
      'title',
      'milestone',
      'assignee',
      'labels'
   ],
   milestone: [
      'title',
      'due_date'
   ],
   labels: [[
      'name'
   ]]
};

var fromGHMapping = {
   milestone: {
      title: null,
      dueDate: function(get, data) {
         return new Date(get('due_on'));
      }
   },
   assignee: ['login']
};

describe('Format', function() {
  describe('#format', function() {
    var data;
    var formatter;
    beforeEach(function() {
      data = {
        number: 1234,
        title: "title this",
        another: "don't copy this",
        milestone: {
          title: "this title",
          due_date: "Sep 09, 2015",
          start_date: "Sep 02, 2015"
        }
      };
      formatter = new Formatter();
    });

    it('should copy only the fields specified by the object description',
     function() {
      var objectSpec = {
        root: [
          'number',
          'title'
        ]
      };

      var result = {
        number: 1234,
        title: "title this"
      };
      var formatter = new Formatter();
      expect(formatter.format(objectSpec, data)).to.eql(result);
    });

    it('should copy only specified subfields of structured fields',
     function() {
      var spec = {
        root: [
          'milestone'
        ],
        milestone: [
          'title',
          'due_date'
        ]
      };

      var result = {
        milestone: {
          title: "this title",
          due_date: "Sep 09, 2015"
        }
      };

      expect(formatter.format(spec, data)).to.eql(result);
    });

    it('should throw an error when flat-mapping a deep structure', function() {
      var spec = {
        root: [
          'milestone'
        ]
      };

      expect(formatter.format.bind(formatter, spec, data)).to.throw(TypeError, 'deep structure');
    });

    context('specifying a diff', function() {
      var spec;
      var result;
      beforeEach(function() {
        spec = {
          root: [
            'milestone'
          ]
        };

        result = {
          milestone: "title this"
        };
      });

      it('should allow overriding fields', function() {
        var diff = {
          milestone: 'title'
        };

        expect(formatter.format(spec, data, diff)).to.eql(result);
      });

      it('should run functions to get values', function() {
        var diff = {
          milestone: function() {
            return 'title this';
          }
        };

        expect(formatter.format(spec, data, diff)).to.eql(result);
      });

      it('should provide the context to function values', function() {
        var diff = {
          milestone: function(context) {
            expect(context).to.equal(data.milestone);
          }
        };

        formatter.format(spec, data, diff);
      });

      it('should provide the full data object to function values', function() {
        var diff = {
          milestone: function(context, fullData) {
            expect(fullData).to.equal(data);
          }
        };

        formatter.format(spec, data, diff);
      });

      context('on a complex value', function() {
        beforeEach(function() {
          result.milestone = {
            title: data.milestone.title,
            due_date: data.milestone.due_date
          };
        });
        it('should use arrays for basic object mapping', function() {
          var diff = {
            milestone: ['title', 'due_date']
          };

          expect(formatter.format(spec, data, diff)).to.eql(result);
        });

        it('should use objects for complex object mapping', function() {
          spec = {
            root: ['milestone'],
            milestone: ['start_date']
          };

          var diff = {
            milestone: {
              title: function() {
                return 'ping';
              },
              due_date: null,
              new_prop: function() {
                return "I'm new!";
              }
            }
          };

          var result = {
            milestone: {
              title: 'ping',
              due_date: data.milestone.due_date,
              new_prop: "I'm new!"
            }
          };

          expect(formatter.format(spec, data, diff)).to.eql(result);
        });

        it('should support the usual features on complex mapping objects', function() {
          spec = {
            root: ['milestone']
          };

          var diff = {
            milestone: {
              title: function(context, fullData) {
                expect(context).to.eql(data.milestone.title);
                expect(fullData).to.eql(data);
              }
            }
          };

          formatter.format(spec, data, diff);
        });

        it('allows mapping of arrays with doubled arrays');
      });
    });
  });
});
