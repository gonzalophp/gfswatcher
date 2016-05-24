#!/usr/bin/env node

'use strict';

var watcher = {
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
        watcher.app.modules = {
            yargs:require('yargs'),
            path:require('path'),
            fs:require('fs'),
            childProcess:require('child_process'),
            crypto:require('crypto'),
            async:require('async')
        };
    },
    walkSync:function(dir, opts, filelist) {
        var fs = watcher.app.modules.fs,
            filelist = (filelist || []),
            ps = watcher.app.modules.path.sep;

        try {
            fs.statSync(dir);
        } catch (e) {
            console.log('Source directory not found: ', dir);
            process.exit(1);
        }

        fs.readdirSync(dir).forEach(function(file) {
            try {
                var stat = fs.lstatSync(dir + ps + file);
                if (!stat.isSymbolicLink() && stat.isDirectory()) {
                    filelist = watcher.walkSync(dir + ps + file, opts, filelist);
                    if (opts.dirs) {
                        filelist.push(dir + ps + file);
                    }
                }
                else {
                    if (!opts.dirs) {
                        filelist.push(dir + file);
                    }
                }
            }
            catch(e) {
            }
        });
        return filelist;
    },
    buildSettings:function() {
        var argv = watcher.app.modules.yargs.argv,
            fs = watcher.app.modules.fs,
            settings = watcher.app.settings,
            ps=watcher.app.modules.path.sep;

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
                var js, shell, opts;
                for (var i=0; i<config.sync.length; i++) {
                    if (!config.sync[i].source) {
                        console.log("Source not defined ", config.sync[i]);
                        process.exit(1);
                    }

                    shell = (config.sync[i].shell) ? config.sync[i].shell : null;
                    opts = (config.sync[i].opts) ? config.sync[i].opts : null;

                    if (config.sync[i].js) {
                        try {
                            eval("js=" + config.sync[i].js);
                        } catch (e) {
                            console.log("Callback error for source (" + config.sync[i].source + "): \"", config.sync[i].js + "\"");
                            process.exit(1);
                        }
                    } else {
                        if(!shell) {
                            console.log("Some kind of action (js callback/shell command) must be defined for source (" + config.sync[i].source + ")");
                            process.exit(1);
                        }
                        js=function(){}
                    }

                    settings.sync.push({
                        source: config.sync[i].source,
                        js: js,
                        shell: shell,
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
        var nextInputBuffer = watcher.app.status.processBuffer;

        watcher.app.status.processBuffer = watcher.app.status.inputBuffer;
        watcher.app.status.inputBuffer = nextInputBuffer;
    },
    log2:function(error, stdout, stderr){
        if (stdout) {
            console.log(stdout.replace("\\n","\n"));
        }
    },
    processModified:function() {
        if(watcher.app.status.processing){
            setTimeout(watcher.processModified, watcher.app.settings.interval);
            return;
        }
        watcher.swapBuffers();

        var m = watcher.app.status.modifiedFiles[watcher.app.status.processBuffer],
            a = watcher.app.modules.async,
            fw, sync={}, k;
        if (Object.keys(m).length>0) {
            watcher.app.status.processing = true;

            for (k in m) {
                fw = m[k].fsWatcher;
                if (m[k].isDir) {
                    if (!m[k].deleted) {
                        watcher.createWatchMonitor(
                                m[k].path,
                                fw.source,
                                fw.js,
                                fw.shell,
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
                                if (sync[k].shell) {
                                    var shellCommand = watcher.parseTemplate(sync[k].shell , sync[k]);
                                    if (sync[k].shell.error) {
                                        console.log("Placeholder (\"" + sync[k].shell.error + "\") undefined for source \"" + sync[k].source + "\"");
                                        process.exit(1);
                                    }
                                    child = watcher.app.modules.childProcess.exec(shellCommand, {maxBuffer:10000*1024});
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
                    watcher.app.status.modifiedFiles[watcher.app.status.processBuffer]={};
                    watcher.app.status.processing = false;
                    cb1(null);
                }
            ]);
        }

        setTimeout(watcher.processModified, watcher.app.settings.interval);
    },
    markModified:function(e, f) {
        var fs = watcher.app.modules.fs,
            ps = watcher.app.modules.path.sep,
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

        hash = watcher.app.modules.crypto.createHash('sha256').update(path).digest('hex');

        var event = this.grouped ? null : {
            type: (dirDeleted||fileDeleted) ? 'deleted' : ((e=='rename') ? 'created' : 'changed'),
            path:path,
            isDir:isDir
        };

        watcher.app.status.modifiedFiles[watcher.app.status.inputBuffer][hash]={
            path:path,
            deleted:(dirDeleted||fileDeleted),
            isDir:isDir,
            fsWatcher:{
                source:this.source,
                js:this.js,
                shell:this.shell,
                opts:this.opts,
                grouped:this.grouped,
                event:event
            }
        };
    },
    createWatchMonitor: function(dir,source,js,shell,opts,grouped) {
        var fs = watcher.app.modules.fs,
            fsOptions = {},
            w = fs.watch(dir, fsOptions, watcher.markModified);
        w.dir = dir;
        w.source = source;
        w.js = js;
        w.shell = shell;
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

            return watcher.getObjectValue(newObj,newKey);
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
                    phValue = watcher.getObjectValue(obj, match);
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
        watcher.initializeModules();
        watcher.buildSettings();

        var i, j;
        for (i=0; i<watcher.app.settings.sync.length; i++) {

            var sync = watcher.app.settings.sync[i],
                dirs = watcher.walkSync(sync.source, {"dirs":true});

            console.log('Watching', sync.source);

            dirs.push(sync.source);
            for (j=0; j<dirs.length; j++) {
                watcher.createWatchMonitor(dirs[j], sync.source, sync.js, sync.shell, sync.opts, sync.grouped);
            }
        }
        setTimeout(watcher.processModified, watcher.app.settings.interval);
    }
};
watcher.init();