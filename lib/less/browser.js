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

less.isMainCache = false;
less.cache = {};

var cache = new function() {
	if (window.parent == window) {
		less.isMainCache = true;
		this.pointer = less.cache;
	} else {
		this.pointer = window.parent.less.cache;
	}
	
	less.cache = this.pointer;
	
	var _writer = null;
	
	this.getItem = function(itemName) {
		if (this.pointer !== null && typeof this.pointer[itemName] != 'undefined') {
			return this.pointer[itemName];
		} else {
			return undefined;
		}
	};
	
	this.setItem = function(itemName, itemValue) {
		if (this.pointer == null) this.pointer = {};
		
		this.pointer[itemName] = itemValue;
		
		clearTimeout(_writer);
		var pointer = this.pointer;
		_writer = setTimeout(function() {
			var DirService 	= Components.classes["@mozilla.org/file/directory_service;1"]
							.getService(Components.interfaces.nsIProperties);
			var ProfD 		= DirService.get("ProfD", Components.interfaces.nsIFile).path
			var file 		= getFile(ProfD + '/_cache', true);
			
			writeFile(file, JSON.stringify(pointer));
		}, 200);
	};
};
less._fileCache = {};

var getFile = function(fileUri, cache) {
	var _fileUri = cache ? "cache_" + fileUri : fileUri;
	
	if (typeof less._fileCache[_fileUri] !== 'undefined')  {
		return less._fileCache[_fileUri];
	}
	
	if (/^[a-z]*\:\/\//.test(fileUri)) {
		var nsIIOService = Components.classes['@mozilla.org/network/io-service;1']
							.getService(Components.interfaces["nsIIOService"]);
		var nsIChromeReg = Components.classes['@mozilla.org/chrome/chrome-registry;1']
							.getService(Components.interfaces["nsIChromeRegistry"]);
		var nsIFilePh 	 = Components.classes["@mozilla.org/network/protocol;1?name=file"]
							.createInstance(Components.interfaces.nsIFileProtocolHandler);
						
		var filePath 	= nsIIOService.newURI(fileUri, "UTF-8", null);
		filePath		= nsIChromeReg.convertChromeURL(filePath).spec;
		filePath 		= nsIFilePh.getFileFromURLSpec(/^file:/.test(filePath) ? filePath : 'file://' + filePath).path;
		filePath 		= filePath.replace(/^.*\:\/\//, '');
	} else {
		filePath = fileUri;
	}
	
	if (cache) {
		var DirService = Components.classes["@mozilla.org/file/directory_service;1"]
						.getService(Components.interfaces.nsIProperties);
		var FileUtils = Components.utils
						.import("resource://gre/modules/FileUtils.jsm").FileUtils;
						
		var ProfD = DirService.get("ProfD", Components.interfaces.nsIFile).path;
		var AppD  = DirService.get("AChrom", Components.interfaces.nsIFile).path.replace(/\/chrome$/,'');
			
		filePath = filePath.replace(ProfD, '').replace(AppD,'');
		filePath = filePath.replace(/\.less$/, '.css');
		filePath = filePath.split('/');
		filePath.unshift("lessCache");
		
		less._fileCache[_fileUri] = FileUtils.getFile("ProfD", filePath, true);
	} else {
		var file = Components.classes["@mozilla.org/file/local;1"]
					.createInstance(Components.interfaces.nsILocalFile);
		file.initWithPath(filePath);
		less._fileCache[_fileUri] = file;
	}
	
	return less._fileCache[_fileUri];
}

var writeFile = function(file, data) {
	try {
		if ( ! file.exists()) {
			file.create(file.NORMAL_FILE_TYPE, 0666);
		}
		
		// Open stream to file
		var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"].
		createInstance(Components.interfaces.nsIFileOutputStream);
		foStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0);
		
		// Use converter to ensure UTF-8 encoding
		var converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"].
		createInstance(Components.interfaces.nsIConverterOutputStream);
		
		// Write to file
		converter.init(foStream, "UTF-8", 0, 0);
		converter.writeString(data);
		converter.close();
		
		return true;
	} catch(e) {
		e.message = 'Error when trying to write to file: ' + e.message;
		error(e, file.path);
		return false;
	}
}

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
		if ( ! variables.hasOwnProperty(name) || typeof less.variables[name] === 'undefined') {
			continue;
		}
		
		// Get sheet id's that are connected to this varialble
		var sheets = less.variables[name];
		
		for (var sheetId in sheets) {
			if ( ! sheets.hasOwnProperty(sheetId) || typeof less.contextStorage.sheetmap[sheetId] == 'undefined') {
				continue;
			}
			
			if (sheetUrl) { // If a sheet url was defined only process sheets that have a matching url
				var _sheet = less.contextStorage.sheetmap[sheetId];
				if ( ! _sheet || _sheet.href.indexOf(sheetUrl) === -1) {
					continue;
				}
			}
			
			if (typeof sheetUpdates[sheetId] == 'undefined')
			{
				sheetUpdates[sheetId] = {sheet: less.contextStorage.sheetmap[sheetId], variables: {}};
				
				if (typeof less.variableStorage[sheetId] !== 'undefined') {
					sheetUpdates[sheetId].variables = less.variableStorage[sheetId];
				}
				
				len++;
			}
			
			sheetUpdates[sheetId].variables[name] = variables[name];
		}
		
	}
	
	var updateSheet = function(id, sheetUpdate) {
		less.variableStorage[id] = sheetUpdate.variables;
		var sheet 		= sheetUpdate.sheet;
		var contents  	= sheet.contents || {}; 
		var href 		= sheet.href;
		
		xhr(href, function(css) {
			css = injectVariables(sheetUpdate.variables, css);
			
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
		});
	}

	// Iterate though sheets an update (recompile) them with new variables
	for (var id in sheetUpdates) {
		if ( ! sheetUpdates.hasOwnProperty(id)) {
			continue;
		}
		
		updateSheet(id, sheetUpdates[id]);
	}
}

var _init = function() {
	if (cache && cache.getItem('lessVariables')) {
		var _variables = cache.getItem('lessVariables');
		
		for (var k in _variables) {
			if (_variables.hasOwnProperty(k)) {
				less.variables[k] = _variables[k];
			}
		}
	}
	
	less.restoreContext();
	less.refresh(less.env === 'development');
}

if (less.isMainCache === false) {
	_init();
} else {
	var DirService 	= Components.classes["@mozilla.org/file/directory_service;1"]
					.getService(Components.interfaces.nsIProperties);
	var ProfD 		= DirService.get("ProfD", Components.interfaces.nsIFile).path
	var cacheFile 	= getFile(ProfD + '/_cache', true);
	
	try {
		Components.utils.import("resource://gre/modules/NetUtil.jsm");
		NetUtil.asyncFetch(cacheFile, function(inputStream, status) {
			if ( ! Components.isSuccessCode(status)) return;
			var data = NetUtil.readInputStreamToString(inputStream, inputStream.available());
			data = JSON.parse(data);
			
			for (var k in data) {
				if (data.hasOwnProperty(k)) {
					less.cache[k] = data[k];
				}
			}
			
			_init();
		});
	} catch(e) {
		_init();
	}
}

function loadStyleSheets(callback, reload) {
    for (var i = 0; i < less.contextStorage.sheets.length; i++) {
        loadStyleSheet(less.contextStorage.sheets[i], callback, reload, less.contextStorage.sheets.length - (i + 1));
    }
}

function loadStyleSheet(sheet, callback, reload, remaining) {
    var contents  = sheet.contents || {};  // Passing a ref to top importing parser content cache trough 'sheet' arg.
    var url       = window.location.href.replace(/[#?].*$/, '');
    var href      = sheet.href.replace(/\?.*$/, '');
	
	var file 		= getFile(href);
	var cacheFile 	= getFile(href, true);
	
	if (cacheFile.exists() && file.exists() && cacheFile.lastModifiedTime > file.lastModifiedTime) {
		insertCss(sheet, cacheFile.path);
		return callback(null, null, null, sheet, { local: true, remaining: remaining });
	}
	
	xhr(sheet.href, function (data, lastModified) {
		// Use remote copy (re-parse)
		try {
			contents[href] = data;  // Updating top importing parser content cache
			new(less.Parser)({
				optimization: less.optimization,
				paths: [href.replace(/[\w\.-]+$/, '')],
				mime: sheet.type,
				filename: href,
				sheet: sheet,				'contents': contents,    // Passing top importing parser content cache ref down.
				dumpLineNumbers: less.dumpLineNumbers
			}).parse(data, function (e, root) {
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
	return 'less:' + extractId(href);
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

function createCSS(styles, sheet) {
    if ( ! sheet.nodeName.match(/link|xml-stylesheet/i)) return;

    // Strip the query-string
    var href = sheet.href ? sheet.href.replace(/\?.*$/, '') : '';
	
	var file = getFile(href, true);
	
	if ( ! writeFile(file, styles)) {
		log('Reverting to inline styling');
		var fileUri = 'data:text/css,' + encodeURIComponent(styles);
	} else {
		var fileUri = file.path;
	}
	
	insertCss(sheet, fileUri);
	
    // Don't update the local store if the file wasn't modified
	log('saving ' + href + ' to cache.');
	try {
		cache.setItem('lessVariables', less.variables);
	} catch(e) {
		//TODO - could do with adding more robust error handling
		log('failed to save');
	}
}

function insertCss(sheet, fileUri) {
    // If there is no title set, use the filename, minus the extension
    var id = extractIdFromSheet(sheet);
	var sibling = sheet.previousSibling || {};
	
	if (sibling.nodeValue !== undefined && sibling.nodeValue.indexOf(id) !== -1) {
		sibling.nodeValue = sibling.nodeValue.replace(/(href=").*?"/i, '$1file://'+fileUri+'"');
	} else {
		var css = less.context.document.createProcessingInstruction(
			'xml-stylesheet', "type=\"text/css\" id=\""+id+"\" href=\"file://"+fileUri+"\""
		);
		sheet.parentNode.insertBefore(css, sheet);
	}
}

function xhr(url, callback) {
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
		ko.logging.getLogger('lessCss').debug(str);
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

