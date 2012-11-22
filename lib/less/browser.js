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

var _cache = {};
less.cache = _cache;

var cache = new function() {
	this.pointer = window.parent.less === undefined ? _cache : window.parent.less.cache;
	
	less.cache = this.pointer;
	
	this.getItem = function(itemName) {
		if (typeof this.pointer[itemName] != 'undefined') {
			return this.pointer[itemName];
		} else {
			return undefined;
		}
	};
	this.setItem = function(itemName, itemValue) {
		this.pointer[itemName] = itemValue;
	}
};
var localCache = {};

//
// Get all <link> tags with the 'rel' attribute set to "stylesheet/less"
//
var typePattern = /^text\/(x-)?less$/;

less.variables = {};
less.variableStorage = {};

less.context = null;
less.contextStorage = null;

less.setContext = function(_window) {
	log('Setting Context: ' + _window.document.location);
	less.context = _window;
	
	if (typeof less.context[_window['document'].location] == 'undefined') {
		less.context[_window['document'].location] = {
			sheets: [],
			sheetmap: {}
		};
		var _n = true;
	}
	
	less.contextStorage = less.context[_window['document'].location];
	
	if (typeof _n !== 'undefined') less.detectStyleSheets();
};

less.restoreContext = function() {
	less.setContext(window);
};

if (cache) {
	if (cache.getItem('lessVariables')) {
		less.variables = JSON.parse(cache.getItem('lessVariables'));
	}
	if (cache.getItem('lessLocalCache')) {
		localCache = JSON.parse(cache.getItem('lessLocalCache'));
	}
}

less.detectStyleSheets = function() {
	var attrMatch = '([a-z]*?)="([a-z0-9:/_.\-]*)"';
	var links = [];
	var _i, _len, _ref, child, pi;
	for (_i = 0, _len = (_ref = less.context.document.childNodes).length; _i < _len; _i++) {
		child = _ref[_i];
		if (child.nodeName == 'xml-stylesheet' && child.nodeValue.match(/media=\"(?:\s*?|[a-z]*?\s+)less/)) {
			var attributes = child.nodeValue.match(new RegExp(attrMatch, 'gi'));
			
			for (var x=0;x<attributes.length;x++) {
				var attribute = attributes[x].match(new RegExp(attrMatch, 'i'));
				child[attribute[1]] = attribute[2];
			}
			
			links.push(child);
		}
	}
	
	for (var i = 0; i < links.length; i++) {
		var sheet = links[i];
		less.contextStorage.sheets.push(sheet);
		less.contextStorage.sheetmap[extractIdFromSheet(sheet)] = sheet;
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
		
		if (env.remaining === 0) {
			less.context = window;
		}
		
    }, reload);
};

less.inject = function(lessCss) {
	new(less.Parser)({
		filename: less.context.document.location.href.replace(/#.*$/, ''),
		dumpLineNumbers: less.dumpLineNumbers
	}).parse(lessCss, function (e, tree) {
		var css = tree.toCSS();
			css = less.context.document.createProcessingInstruction('xml-stylesheet', "type=\"text/css\"\n\
													   href=\"data:text/css," + (encodeURIComponent(css)) + "\"");
			less.context.document.insertBefore(css, less.context.document.childNodes[less.context.document.childNodes.length-1]);
	});
};

less.updateVariables = function(variables, sheetUrl) {
	var sheetUpdates = {};
	var len = 0;
	
	// Iterate through variables and filter out the sheets that are affected
	for (var name in variables) {
		if ( ! variables.hasOwnProperty(name) || less.variables[name] === undefined) {
			continue;
		}
		
		// Get sheet id's that are connected to this varialble
		var sheets = less.variables[name];
		
		for (var sheetId in sheets) {
			if ( ! sheets.hasOwnProperty(sheetId)) {
				continue;
			}
			
			if (sheetUrl) { // If a sheet url was defined only process sheets that have a matching url
				var _sheet = less.contextStorage.sheetmap[sheetId];
				if (_sheet.href.indexOf(sheetUrl) === -1) {
					continue;
				}
			}
			
			if (sheetUpdates[sheetId] == undefined)
			{
				sheetUpdates[sheetId] = {sheet: less.contextStorage.sheetmap[sheetId], variables: {}};
				
				if (less.variableStorage[sheetId] !== undefined) {
					sheetUpdates[sheetId].variables = less.variableStorage[sheetId];
				}
				
				len++;
			}
			
			sheetUpdates[sheetId].variables[name] = variables[name];
		}
		
	}

	// Iterate though sheets an update (recompile) them with new variables
	for (id in sheetUpdates) {
		if (localCache[id] === undefined) continue;
		
		less.variableStorage[sheetId] = sheetUpdates[id].variables;
		
		var sheet 		= sheetUpdates[id].sheet;
		var contents  	= sheet.contents || {}; 
		var href 		= sheet.href;
		var css 		= injectVariables(sheetUpdates[id].variables, localCache[id]);
		
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
				} catch (e) {
					error(e, href);
				}
			});
		} catch (e) {
			error(e, href);
		}
	}
}

less.restoreContext();

less.refresh(less.env === 'development');

function loadStyleSheets(callback, reload) {
    for (var i = 0; i < less.contextStorage.sheets.length; i++) {
        loadStyleSheet(less.contextStorage.sheets[i], callback, reload, less.contextStorage.sheets.length - (i + 1));
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
	
	if (styles.css) {
		createCSS(styles.css, sheet);
		callback(null, null, null, sheet, { local: true, remaining: remaining });
	} else {
		xhr(sheet.href, sheet.type, function (data, lastModified) {
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
						removeNode(less.context.document.getElementById('less-error-message:' + extractId(href)));
					} catch (e) {
						error(e, href);
					}
				});
			} catch (e) {
				error(e, href);
			}
		}, function (status, url) {
			throw new(Error)("Couldn't load " + url + " (" + status + ")");
		});
	}
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

function injectVariables(variables, css) {
	for (var name in variables) {
		if ( ! variables.hasOwnProperty(name)) {
			continue;
		}
		
		var regex = new RegExp("(\\@"+name+"\\:\\s?)(.*?)\\;", "g");
		
		if (css.match(regex) === null) {
			var _prepend = "@"+name+": "+variables[name]+";\n";
			
			if (css.match(/\@import\s/) !== null) {
				css = css.replace(/([\s\S]*.*@import.*?\n)/, "$1\n"+_prepend+"\n");
			} else {
				css = _prepend + css;
			}
		} else {
			css = css.replace(regex, '$1'+variables[name]+';');	
		}
	}
	return css;
}

function createCSS(styles, sheet, lastModified) {
    if ( ! sheet.nodeName.match(/link|xml-stylesheet/i)) return;
    
    var css;

    // Strip the query-string
    var href = sheet.href ? sheet.href.replace(/\?.*$/, '') : '';

    // If there is no title set, use the filename, minus the extension
    var id = extractIdFromSheet(sheet);
	var sibling = sheet.previousSibling || {};
	
	if (sibling.nodeValue !== undefined && sibling.nodeValue.indexOf(id) !== -1) {
		sibling.nodeValue = sibling.nodeValue.replace(/(href=")(.*?)"/i, '$1data:text/css,'+encodeURIComponent(styles)+'"');
	} else {
		css = less.context.document.createProcessingInstruction('xml-stylesheet', "type=\"text/css\"\nid=\""+id+"\"\
												   href=\"data:text/css," + (encodeURIComponent(styles)) + "\"");
		sheet.parentNode.insertBefore(css, sheet);
	}

    // Don't update the local store if the file wasn't modified
	log('saving ' + href + ' to cache.');
	try {
		cache.setItem(href, styles);
		cache.setItem(href + ':timestamp', lastModified);
		cache.setItem('lessVariables', JSON.stringify(less.variables));
		cache.setItem('lessLocalCache', JSON.stringify(localCache));
	} catch(e) {
		//TODO - could do with adding more robust error handling
		log('failed to save');
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
	if (typeof ko !== 'undefined') {
		var log = ko.logging.getLogger('lessCss');
		log.debug(str);
	} else {
		if (less.env != 'development' || typeof(dump) !== "undefined") { return false; }
		dump('less: ' + str + "\n");
	}
}

function error(e, href) {
    var id = 'less-error-message:' + extractId(href);
    var template = ' - {line}: {content}' + "\n";
	var errorString = ' - LESS ERROR - ' + "\n";
    var filename = e.filename || href;
    var filenameNoPath = filename.match(/([^\/]+)$/)[1];
	var error = [];

    errorString += (e.message || 'There is an error in your .less file') + ' (' + filenameNoPath + ")\n";

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

