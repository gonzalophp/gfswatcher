var assert = require('chai').assert;
var chai = require('chai');
var sinon = require('sinon');

describe('walkSync', function(){
    var mockfs = require('mock-fs');

    var path=require('path'),
        fs = require('fs'),
        gfswatcher = require('../gfswatcher'),
        getPathString = function(p) {return path.sep + p.join(path.sep);};

    beforeEach(function(){
        gfswatcher.initializeModules();
        sinon.spy(fs,'statSync');
        sinon.spy(fs,'readdirSync');
        sinon.spy(fs,'lstatSync');
    });

    afterEach(function(){
        mockfs.restore();
        fs.statSync.restore();
        fs.readdirSync.restore();
        fs.lstatSync.restore();
    });

    it('it returns an empty array when there are no elements inside the path provided', function(){
        mockfs({
            '/a/b':{}
        });
        var dirs = gfswatcher.walkSync(getPathString(['a','b']), {dirs:true});
        assert.deepEqual(dirs, []);
        assert(fs.readdirSync.withArgs(getPathString(['a','b'])).calledOnce, true);
    });

    it('it returns an empty array when there are no directories inside the path provided', function(){
        mockfs({
            '/a/b':{
                'c':'',
                'd':''
            }
        });
        var dirs = gfswatcher.walkSync(getPathString(['a','b']), {dirs:true});
        assert.deepEqual(dirs, []);
        assert(fs.readdirSync.withArgs(getPathString(['a','b'])).called, true);
        assert(fs.lstatSync.withArgs(getPathString(['a','b','c'])).called, true);
        assert(fs.lstatSync.withArgs(getPathString(['a','b','d'])).called, true);
    });

    it('it returns an empty array when no directories found', function(){
        mockfs({
            '/a/b':{
                'c':mockfs.symlink({'path':'/a/x/y'}),
                'd':mockfs.symlink({'path':'/a/x/z'})
            },
            '/a/x':{
                'y':'',
                'z':''
            }
        });
        var dirs = gfswatcher.walkSync(getPathString(['a','b']), {dirs:true});
        assert.deepEqual(dirs, []);
        assert(fs.readdirSync.withArgs(getPathString(['a','b'])).called, true);
        assert(fs.lstatSync.withArgs(getPathString(['a','b','c'])).called, true);
        assert(fs.lstatSync.withArgs(getPathString(['a','b','d'])).called, true);
    });

    it('it returns an empty array when the directories found are symbolic links', function(){
        mockfs({
            '/a/b':{
                'c':mockfs.symlink({'path':'/a/x/y'}),
                'd':mockfs.symlink({'path':'/a/x/z'})
            },
            '/a/x':{
                'y':{},
                'z':{}
            }
        });

        var dirs = gfswatcher.walkSync(getPathString(['a','b']), {dirs:true});
        assert.deepEqual(dirs, []);
        assert(fs.readdirSync.withArgs(getPathString(['a','b'])).called, true);
        assert(fs.lstatSync.withArgs(getPathString(['a','b','c'])).called, true);
        assert(fs.lstatSync.withArgs(getPathString(['a','b','d'])).called, true);
    });

    it('it will return an array of directories when the directories found are not symbolic links', function(){
        mockfs({
            '/a/b':{
                'c':{},
                'd':{}
            }
        });
        dirs = gfswatcher.walkSync(getPathString(['a','b']), {dirs:true});

        assert(fs.readdirSync.withArgs(getPathString(['a','b'])).called, true);
        assert(fs.lstatSync.withArgs(getPathString(['a','b','c'])).called, true);
        assert(fs.lstatSync.withArgs(getPathString(['a','b','d'])).called, true);

        assert.deepEqual(dirs, [getPathString(['a','b','c']),getPathString(['a','b','d'])]);
    });

    it('it will terminate with an error message if the path does not exists', function(){
        mockfs({
            '/a/b':{
                'c':{},
                'd':{}
            }
        });
        assert.throws(
                function(){gfswatcher.walkSync(getPathString(['a','x']), {dirs:true})},
                Error,
                'Source directory not found: /a/x');
    });
});