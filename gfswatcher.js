'use strict';

var gfswatcher = {
    app:{
        modules:{},
        settings:{},
        status:{
            modifiedFiles:{
                A:{},
                B:{}
            },
            inputBuffer:'A',
            processBuffer:'B',
            processing:false
        }
    },
    initializeModules:function(){
        gfswatcher.app.modules = {
            yargs:require('yargs'),
            path:require('path'),
            fs:require('fs'),
            childProcess:require('child_process'),
            crypto:require('crypto'),
            async:require('async')
        };
    },
    walkSync:function(dir, opts, filelist) {
        var fs = gfswatcher.app.modules.fs,
            filelist = (filelist || []),
            ps = gfswatcher.app.modules.path.sep;
        try {
            fs.statSync(dir);
        } catch (e1) {
            throw new Error('Source directory not found: ' + dir);
        }

        try{
            fs.readdirSync(dir).forEach(function(dirEntry) {
                try {
                    var stat = fs.lstatSync(dir + ps + dirEntry);
                    if (!stat.isSymbolicLink() && stat.isDirectory()) {
                        filelist = gfswatcher.walkSync(dir + ps + dirEntry, opts, filelist);
                        if (opts.dirs) {
                            filelist.push(dir + ps + dirEntry);
                        }
                    }
                    else {
                        if (!opts.dirs) {
                            filelist.push(dir + dirEntry);
                        }
                    }
                }
                catch(e2) {
                }
            });
        } catch (e1) {
            console.log('Cannot find path: ', dir);
            process.exit(1);
        }

        return filelist;
    },
    buildSettings:function() {
        var argv = gfswatcher.app.modules.yargs.argv,
            fs = gfswatcher.app.modules.fs,
            settings = gfswatcher.app.settings,
            ps=gfswatcher.app.modules.path.sep;

        var config;
        settings.config = config;
        if (argv.config) {
            config = JSON.parse(fs.readFileSync(argv.config, 'utf8'));
        }

        settings.sync=[];
        if (argv.source) {
            var source,regExp;
            regExp = new RegExp("(.*)(" + ps + ")$");
            source = argv.source.replace(regExp,"$1");
            regExp = new RegExp("^" + ps);
            if (!regExp.test(source)) {
                source = process.cwd() + ps + source;
            }
            settings.sync.push({source:source});
        } else {
            if (config && config.sync && (config.sync.length > 0)) {
                var js, cmd, opts;
                for (var i=0; i<config.sync.length; i++) {
                    if (!config.sync[i].source) {
                        console.log("Source not defined ", config.sync[i]);
                        process.exit(1);
                    }

                    cmd = (config.sync[i].cmd) ? config.sync[i].cmd : null;
                    opts = (config.sync[i].opts) ? config.sync[i].opts : null;

                    if (config.sync[i].js) {
                        try {
                            eval("js=" + config.sync[i].js);
                        } catch (e) {
                            console.log("Callback error for source (" + config.sync[i].source + "): \"", config.sync[i].js + "\"");
                            process.exit(1);
                        }
                    } else {
                        if(!cmd) {
                            console.log("Some kind of action (js callback/cmd command) must be defined for source (" + config.sync[i].source + ")");
                            process.exit(1);
                        }
                        js=function(){}
                    }

                    settings.sync.push({
                        source: config.sync[i].source,
                        js: js,
                        cmd: cmd,
                        opts:opts,
                        grouped:(config.sync[i].grouped!=undefined)?config.sync[i].grouped:false});
                }
            } else {
                settings.sync.push({source:process.cwd()});
            }
        }

        settings.interval = argv.interval ? argv.interval : ((config && config.interval) ? config.interval : 2000);
    },
    swapBuffers:function() {
        var nextInputBuffer = gfswatcher.app.status.processBuffer;

        gfswatcher.app.status.processBuffer = gfswatcher.app.status.inputBuffer;
        gfswatcher.app.status.inputBuffer = nextInputBuffer;
    },
    log2:function(error, stdout, stderr){
        if (stdout) {
            console.log(stdout.replace("\\n","\n"));
        }
    },
    processModified:function() {
        if(gfswatcher.app.status.processing){
            setTimeout(gfswatcher.processModified, gfswatcher.app.settings.interval);
            return;
        }
        gfswatcher.swapBuffers();

        var m = gfswatcher.app.status.modifiedFiles[gfswatcher.app.status.processBuffer],
            a = gfswatcher.app.modules.async,
            fw, sync={}, k;
        if (Object.keys(m).length>0) {
            gfswatcher.app.status.processing = true;

            for (k in m) {
                fw = m[k].fsWatcher;
                if (m[k].isDir) {
                    if (!m[k].deleted) {
                        gfswatcher.createWatchMonitor(
                                m[k].path,
                                fw.source,
                                fw.js,
                                fw.cmd,
                                fw.opts,
                                fw.grouped);
                    }
                }

                if (fw.grouped) {
                    if (sync[fw.source]==undefined) {
                        sync[fw.source] = fw;
                    }
                } else {
                    if (sync[m[k].path]==undefined) {
                        sync[m[k].path] = fw;
                    }
                }
            }
            a.series([
                function(cb1){
                    for (k in sync) {
                        var child;
                        a.series([
                            function(cb2){
                                if (sync[k].js) {
                                    try {
                                        sync[k].js();
                                    } catch(e) {
                                        console.log("Error: callback error for source ("+sync[k].source+")", e);
                                    }
                                }
                                cb2(null);
                            },
                            function(cb2){
                                if (sync[k].cmd) {
                                    var cmdCommand = gfswatcher.parseTemplate(sync[k].cmd , sync[k]);
                                    if (sync[k].cmd.error) {
                                        console.log("Placeholder (\"" + sync[k].cmd.error + "\") undefined for source \"" + sync[k].source + "\"");
                                        process.exit(1);
                                    }
                                    child = gfswatcher.app.modules.childProcess.exec(cmdCommand, {maxBuffer:10000*1024});
                                    child.on('close', function() {cb2(null)});

                                    if (child.stdout) child.stdout.pipe(process.stdout);
                                    if (child.stderr) child.stderr.pipe(process.stdout);

                                } else {
                                    cb2(null);
                                }
                            }, function(cb2) {
                                sync[k].event = null;
                                cb2(null);
                            }
                        ]);
                    }
                    cb1(null);
                },
                function(cb1) {
                    gfswatcher.app.status.modifiedFiles[gfswatcher.app.status.processBuffer]={};
                    gfswatcher.app.status.processing = false;
                    cb1(null);
                }
            ]);
        }

        setTimeout(gfswatcher.processModified, gfswatcher.app.settings.interval);
    },
    markModified:function(e, f) {
        var fs = gfswatcher.app.modules.fs,
            ps = gfswatcher.app.modules.path.sep,
            isDir = false,
            fileDeleted = false,
            dirDeleted = false,
            path, hash, dirStat, fileStat;

        try {
            dirStat = fs.lstatSync(this.dir);
        } catch (e) {
            path = this.dir;
            isDir=true;
            dirDeleted=true;
        }

        if (!dirDeleted) {
            path = this.dir + ps + f;
            try {
                fileStat = fs.lstatSync(path);
                isDir = fileStat.isDirectory();
            } catch(e) {
                fileDeleted = true;
            }
        }

        if (this.event && (this.event.path == path)) {
            return;
        }

        hash = gfswatcher.app.modules.crypto.createHash('sha256').update(path).digest('hex');

        var event = this.grouped ? null : {
            type: (dirDeleted||fileDeleted) ? 'deleted' : ((e=='rename') ? 'created' : 'changed'),
            path:path,
            isDir:isDir
        };

        gfswatcher.app.status.modifiedFiles[gfswatcher.app.status.inputBuffer][hash]={
            path:path,
            deleted:(dirDeleted||fileDeleted),
            isDir:isDir,
            fsWatcher:{
                source:this.source,
                js:this.js,
                cmd:this.cmd,
                opts:this.opts,
                grouped:this.grouped,
                event:event
            }
        };
    },
    createWatchMonitor: function(dir,source,js,cmd,opts,grouped) {
        var fs = gfswatcher.app.modules.fs,
            fsOptions = {},
            w = fs.watch(dir, fsOptions, gfswatcher.markModified);
        w.dir = dir;
        w.source = source;
        w.js = js;
        w.cmd = cmd;
        w.opts = opts;
        w.grouped = grouped;
    },
    getObjectValue:function(obj,key) {
        if (key.indexOf('.') > 0) {
            var keyArray = key.split('.'),
                newObj = obj[keyArray[0]],
                newKey;

            keyArray.shift();
            newKey = keyArray.join('.');

            return gfswatcher.getObjectValue(newObj,newKey);
        }
        else {
            return obj[key];
        }
    },
    parseTemplate:function(template, obj){
        var matches = template.match(/({{[^\s]+}})/g),
            placeholders = {},
            phValue;

        if (matches) {
            for (var n=0; n<matches.length; n++) {
                var match = matches[n].replace(/{{(.*)}}/,"$1");

                try {
                    phValue = gfswatcher.getObjectValue(obj, match);
                } catch(e) {
                    console.log("Error: cannot parse {{"+match+"}} for source ("+obj.source+")");
                    process.exit(1);
                }

                if (phValue==undefined) {
                    return {error:match}
                }
                placeholders[match]=phValue;
            }

            for (var k in placeholders) {
                template = template.replace(new RegExp("{{" + k + "}}",'g'), placeholders[k]);
            }
        }

        return template;
    },
    init:function(){
        gfswatcher.initializeModules();
        gfswatcher.buildSettings();
    },
    watch:function(){
        gfswatcher.init();
        var i, j;
        for (i=0; i<gfswatcher.app.settings.sync.length; i++) {

            var sync = gfswatcher.app.settings.sync[i],
                dirs = gfswatcher.walkSync(sync.source, {"dirs":true});

            console.log('Watching', sync.source);

            dirs.push(sync.source);
            for (j=0; j<dirs.length; j++) {
                gfswatcher.createWatchMonitor(dirs[j], sync.source, sync.js, sync.cmd, sync.opts, sync.grouped);
            }
        }
        setTimeout(gfswatcher.processModified, gfswatcher.app.settings.interval);
    }
};

module.exports = gfswatcher;