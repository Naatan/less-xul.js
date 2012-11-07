//
// browser.js - client-side engine
//

var isFileProtocol = /^(file|chrome(-extension)?|resource|qrc|app):/.test(location.protocol);

less.env = less.env || (location.hostname == '127.0.0.1' ||
                        location.hostname == '0.0.0.0'   ||
                        location.hostname == 'localhost' ||
                        location.port.length > 0         ||
                        isFileProtocol                   ? 'development'
                                                         : 'production');

// Load styles asynchronously (default: false)
//
// This is set to `false` by default, so that the body
// doesn't start loading before the stylesheets are parsed.
// Setting this to `true` can result in flickering.
//
less.async = less.async || false;
less.fileAsync = less.fileAsync || false;

// Interval between watch polls
less.poll = less.poll || (isFileProtocol ? 1000 : 1500);

var dumpLineNumbers = /!dumpLineNumbers:(comments|mediaquery|all)/.exec(location.hash);
if (dumpLineNumbers) {
    less.dumpLineNumbers = dumpLineNumbers[1];
}

//
// Watch mode
//
less.watch   = function () {	
	if (!less.watchMode ){		
		less.env = 'development';
		initRunningMode();
	}
	return this.watchMode = true 
};

less.unwatch = function () {clearInterval(less.watchTimer); return this.watchMode = false; };

function initRunningMode(){
	if (less.env === 'development') {		
		less.optimization = 0;		
		less.watchTimer = setInterval(function () {			
			if (less.watchMode) {
				loadStyleSheets(function (e, root, _, sheet, env) {
					if (root) {
						createCSS(root.toCSS(), sheet, env.lastModified);
					}
				});
			}
		}, less.poll);
	} else {
		less.optimization = 3;
	}
}

if (/!watch/.test(location.hash)) {
	less.watch();
}

var cache = null;
var localCache = {};

if (less.env != 'development') {
    try {
        cache = (typeof(window.localStorage) === 'undefined') ? null : window.localStorage;
    } catch (_) {}
}

//
// Get all <link> tags with the 'rel' attribute set to "stylesheet/less"
//
var links = document.getElementsByTagName('link');
var typePattern = /^text\/(x-)?less$/;

less.sheets = [];
less.variables = {};
less.variableStorage = {};
less.sheetmap = {};

for (var i = 0; i < links.length; i++) {
    if (links[i].getAttribute("rel") === 'stylesheet/less' || (links[i].getAttribute("rel").match(/stylesheet/) &&
       (links[i].type.match(typePattern)))) {
        
        var sheet = links[i];
        var attributes = sheet.attributes;
        for (var x=0;x<attributes.length;x++)
        {
            sheet[attributes[x].name] = attributes[x].value;
        }
        
        less.sheets.push(sheet);
		less.sheetmap[extractIdFromSheet(sheet)] = sheet;
    }
}

less.refresh = function (reload) {
    var startTime, endTime;
    startTime = endTime = new(Date);

    loadStyleSheets(function (e, root, _, sheet, env) {
        if (env.local) {
            log("loading " + sheet.href + " from cache.");
        } else {
            log("parsed " + sheet.href + " successfully.");
            createCSS(root.toCSS(), sheet, env.lastModified);
        }
        log("css for " + sheet.href + " generated in " + (new(Date) - endTime) + 'ms');
        (env.remaining === 0) && log("css generated in " + (new(Date) - startTime) + 'ms');
        endTime = new(Date);
    }, reload);

    loadStyles();
};
less.refreshStyles = loadStyles;

less.refresh(less.env === 'development');

less.updateVariables = function(variables, sheetUrl) {
	var sheetUpdates = {};
	var len = 0;
	
	// Merge variableStorage into variables
	for (var name in less.variableStorage) {
		if ( ! less.variableStorage.hasOwnProperty(name) || variables[name] !== undefined) {
			continue;
		}
		variables[name] = less.variableStorage[name];
	}
	less.variableStorage = variables;
	
	// Iterate through variables and filter out the sheets that are affected
	for (var name in variables) {
		if ( ! variables.hasOwnProperty(name) || less.variables[name] === undefined) {
			continue;
		}
		
		// Get sheet id's that are connected to this varialble
		var sheets = less.variables[name];
		
		for (var i=0;i<sheets.length;i++) {
			if (sheetUrl) { // If a sheet url was defined only process sheets that have a matching url
				var _sheet = less.sheetmap[sheets[i]];
				if (_sheet.href.indexOf(sheetUrl) === -1) {
					continue;
				}
			}
			if (sheetUpdates[sheets[i]] == undefined)
			{
				sheetUpdates[sheets[i]] = {sheet: less.sheetmap[sheets[i]], variables: []};
				len++;
			}
			sheetUpdates[sheets[i]].variables.push({name: name, value: variables[name]})
		}
		
	}

	// Iterate though sheets an update (recompile) them with new variables
	for (id in sheetUpdates) {
		if (localCache[id] === undefined) continue;
		
		var sheet 		= sheetUpdates[id].sheet;
		var contents  	= sheet.contents || {}; 
		var href 		= sheet.href;
		var css 		= _injectVariables(sheetUpdates[id].variables, localCache[id]);
		
		try {
			contents[href] = css;
			new(less.Parser)({
				optimization: less.optimization,
				paths: [sheet.href.replace(/[\w\.-]+$/, '')],
				mime: sheet.type,
				filename: href,
				sheet: sheet,
				'contents': contents,
				dumpLineNumbers: less.dumpLineNumbers
			}).parse(css, function (e, root) {
				if (e) { return error(e, href) }
				try {
					createCSS(root.toCSS(), sheet);
					removeNode(document.getElementById('less-error-message:' + extractId(href)));
				} catch (e) {
					error(e, href);
				}
			});
		} catch (e) {
			error(e, href);
		}
	}
}

function loadStyles() {
	if (cache) {
		if (cache.getItem('lessVariables')) {
			less.variables = JSON.parse(cache.getItem('lessVariables'));
		}
		if (cache.getItem('lessRawCache')) {
			localCache = JSON.parse(cache.getItem('lessRawCache'));
		}
	}
    var styles = document.getElementsByTagName('style');
    for (var i = 0; i < styles.length; i++) {
        if (styles[i].type.match(typePattern)) {
            new(less.Parser)({
                filename: document.location.href.replace(/#.*$/, ''),
                dumpLineNumbers: less.dumpLineNumbers
            }).parse(styles[i].innerHTML || '', function (e, tree) {
                var css = tree.toCSS();
                var style = styles[i];
                style.type = 'text/css';
                if (style.styleSheet) {
                    style.styleSheet.cssText = css;
                } else {
                    style.innerHTML = css;
                }
            });
        }
    }
}

function loadStyleSheets(callback, reload) {
    for (var i = 0; i < less.sheets.length; i++) {
        loadStyleSheet(less.sheets[i], callback, reload, less.sheets.length - (i + 1));
    }
}

function loadStyleSheet(sheet, callback, reload, remaining) {
    var contents  = sheet.contents || {};  // Passing a ref to top importing parser content cache trough 'sheet' arg.
    var url       = window.location.href.replace(/[#?].*$/, '');
    var href      = sheet.href.replace(/\?.*$/, '');
    var css       = cache && cache.getItem(href);
    var timestamp = cache && cache.getItem(href + ':timestamp');
    var styles    = { css: css, timestamp: timestamp };

    // Stylesheets in IE don't always return the full path
    if (! /^[a-z-]+:/.test(href)) {
        if (href.charAt(0) == "/") {
            href = window.location.protocol + "//" + window.location.host + href;
        } else {
            href = url.slice(0, url.lastIndexOf('/') + 1) + href;
        }
    }
    xhr(sheet.href, sheet.type, function (data, lastModified) {
        if (!reload && styles && lastModified &&
           (new(Date)(lastModified).valueOf() ===
            new(Date)(styles.timestamp).valueOf())) {
            // Use local copy
            createCSS(styles.css, sheet);
            callback(null, null, data, sheet, { local: true, remaining: remaining });
        } else {
            // Use remote copy (re-parse)
            try {
                contents[href] = data;  // Updating top importing parser content cache
                new(less.Parser)({
                    optimization: less.optimization,
                    paths: [href.replace(/[\w\.-]+$/, '')],
                    mime: sheet.type,
                    filename: href,
					sheet: sheet,
                    'contents': contents,    // Passing top importing parser content cache ref down.
                    dumpLineNumbers: less.dumpLineNumbers
                }).parse(data, function (e, root) {
					localCache[extractIdFromSheet(sheet)] = data;
                    if (e) { return error(e, href) }
                    try {
                        callback(e, root, data, sheet, { local: false, lastModified: lastModified, remaining: remaining });
                        removeNode(document.getElementById('less-error-message:' + extractId(href)));
                    } catch (e) {
                        error(e, href);
                    }
                });
            } catch (e) {
                error(e, href);
            }
        }
    }, function (status, url) {
        throw new(Error)("Couldn't load " + url + " (" + status + ")");
    });
}

function extractId(href) {
    return href.replace(/^[a-z]+:\/\/?[^\/]+/, '' )  // Remove protocol & domain
               .replace(/^\//,                 '' )  // Remove root /
               .replace(/\?.*$/,               '' )  // Remove query
               .replace(/\.[^\.\/]+$/,         '' )  // Remove file extension
               .replace(/[^\.\w-]+/g,          '-')  // Replace illegal characters
               .replace(/\./g,                 ':'); // Replace dots with colons(for valid id)
}

function extractIdFromSheet(sheet) {
	var href = sheet.href ? sheet.href.replace(/\?.*$/, '') : '';
	return 'less:' + (sheet.title || extractId(href));
}

function _injectVariables(variables, css) {
	console.log(css);
	for (var i=0;i<variables.length;i++) {
		var _var = variables[i];
		var regex = new RegExp("(\\@"+_var.name+"\\:\\s?)(.*?)\\;", "g");
		
		if (css.match(regex) === null) {
			var _prepend = "@"+_var.name+": "+_var.value+";\n";
			
			if (css.match(/\@import\s/) !== null) {
				css = css.replace(/(.*\@import\s.*?\n)/, "$1\n"+_prepend+"\n");
			} else {
				css = _prepend + css;
			}
		} else {
			css = css.replace(regex, '$1'+_var.value+';');	
		}
	}
	console.log(css);
	return css;
}

function createCSS(styles, sheet, lastModified) {
    if (sheet.tagName != 'link') return;
    
    var css;

    // Strip the query-string
    var href = sheet.href ? sheet.href.replace(/\?.*$/, '') : '';

    // If there is no title set, use the filename, minus the extension
    var id = 'less:' + (sheet.title || extractId(href));
    
    var _i, _len, _ref, child, pi, _lastChild;
    for (_i = 0, _len = (_ref = document.childNodes).length; _i < _len; _i++) {
        child = _ref[_i];
        if (child.nodeType === Node.PROCESSING_INSTRUCTION_NODE && child.nodeValue.indexOf(id) > 0) {
            child.nodeValue = 'discard="discard"';
            document.removeChild(child);
            break;
        }
        else if (child.nodeName == 'xml-stylesheet')
        {
            _lastChild = child;
        }
    }
    
    css = document.createProcessingInstruction('xml-stylesheet', "type=\"text/css\"\nid=\""+id+"\"\
                                               href=\"data:text/css," + (encodeURIComponent(styles)) + "\"");
    
    _lastChild.parentNode.insertBefore(css, _lastChild);

    // Don't update the local store if the file wasn't modified
    if (lastModified && cache) {
        log('saving ' + href + ' to cache.');
        try {
            cache.setItem(href, styles);
            cache.setItem(href + ':timestamp', lastModified);
			cache.setItem('lessVariables', JSON.stringify(less.variables));
			cache.setItem('lessRawCache', JSON.stringify(localCache));
        } catch(e) {
            //TODO - could do with adding more robust error handling
            log('failed to save');
        }
    }
}

function xhr(url, type, callback, errback) {
    Components.utils.import("resource://gre/modules/NetUtil.jsm");
    NetUtil.asyncFetch(url, function(inputStream, status) {
        if (!Components.isSuccessCode(status)) {
            return errback(status);
        }
        
        var data = NetUtil.readInputStreamToString(inputStream, inputStream.available());
        return callback(data);
    });
}

function getXMLHttpRequest() {
    if (window.XMLHttpRequest) {
        return new(XMLHttpRequest);
    } else {
        try {
            return new(ActiveXObject)("MSXML2.XMLHTTP.3.0");
        } catch (e) {
            log("browser doesn't support AJAX.");
            return null;
        }
    }
}

function removeNode(node) {
    return node && node.parentNode.removeChild(node);
}

function log(str) {
    if (less.env == 'development' && typeof(dump) !== "undefined") { dump('less: ' + str + "\n"); }
}

function error(e, href) {
    var id = 'less-error-message:' + extractId(href);
    var template = ' - {line}: {content}' + "\n";
	var errorString = 'LESS ERROR - ' + "\n\n";
    var filename = e.filename || href;
    var filenameNoPath = filename.match(/([^\/]+)$/)[1];
	var error = [];

    errorString += (e.message || 'There is an error in your .less file') + "\n" +
              'in ' + filenameNoPath + "\n\n";

    var errorline = function (e, i, classname) {
        if (e.extract[i]) {
            error.push(template.replace(/\{line\}/, parseInt(e.line) + (i - 1))
                               .replace(/\{class\}/, classname)
                               .replace(/\{content\}/, e.extract[i]));
        }
    };

    if (e.stack) {
        errorString += "\n" + e.stack.split('\n').slice(1).join("\n");
    } else if (e.extract) {
        errorline(e, 0, '');
        errorline(e, 1, 'line');
        errorline(e, 2, '');
        errorString += 'on line ' + e.line + ', column ' + (e.column + 1) + ':' + "\n" +
                    error.join('');
    }
    dump(errorString);
}

