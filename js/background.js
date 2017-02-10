//注册扩展图标点击事件
chrome.browserAction.onClicked.addListener(function(tab) {
    window.open("/options/index.html");
});
//配置indexedDB存储
// Dexie.debug = true

var db;
function opendb() {
    db = new Dexie("BugRequest");
    db.version(1).stores({
        httplog: "++id,*url,method,*requestHeaders,requestBody,*statusCode,statusLine,*responseHeaders,*redirect,*host,*querykey",
    });
    db.open();
}
opendb();

//注册webRequest事件
var filters = {
    urls: ["http://*/*", "https://*/*"],
}
function addListeners() {
    chrome.webRequest.onBeforeRequest.addListener(handleEvent, filters, ['requestBody']);
    chrome.webRequest.onSendHeaders.addListener(handleEvent, filters, ['requestHeaders']);
    chrome.webRequest.onBeforeRedirect.addListener(handleEvent, filters, ['responseHeaders']);
    chrome.webRequest.onCompleted.addListener(handleEvent, filters, ['responseHeaders']);
    chrome.webRequest.onErrorOccurred.addListener(handleEvent, filters);
}

function removeListeners() {
    chrome.webRequest.onBeforeRequest.removeListener(handleEvent);
    chrome.webRequest.onSendHeaders.removeListener(handleEvent);
    chrome.webRequest.onBeforeRedirect.removeListener(handleEvent);
    chrome.webRequest.onCompleted.removeListener(handleEvent);
    chrome.webRequest.onErrorOccurred.removeListener(handleEvent);
}
// 使用全局变量存储没有完成的请求
// 一个请求只有两种方式结束生命 
// Completed(保存到数据库且从全局变量抛弃) ErrorOccurred(从全局变量抛弃)
// chrome.webRequest无法获取返回的body
// http://stackoverflow.com/questions/17298793/modify-the-response-body-of-http-requests-with-chrome-extension
// chrome.devtools.network可以获取body，但需要一直打开开发者工具
// http://open.chrome.360.cn/extension_dev/devtools.network.html#event-onRequestFinished
addListeners();
var http = {};

function handleEvent(details) {
    if (details.error) {
        //如果出错数据抛弃掉
        delete http[details.requestId]
        return
    }
    if (!http.hasOwnProperty(details.requestId)) {
        http[details.requestId] = {};
    }
    if (!http[details.requestId].hasOwnProperty('url')) {
        http[details.requestId]['url'] = [];
        http[details.requestId]['statusCode'] = [];
    }
    if (http[details.requestId]['url'].indexOf(details.url) == -1) {
        http[details.requestId]['url'].push(details.url);
    }
    if (details.requestHeaders) {
        http[details.requestId]['method'] = details.method;
        http[details.requestId]['requestHeaders'] = details.requestHeaders;
    } else if (details.redirectUrl) {
        //可能出现多次跳转
        if (!http[details.requestId].hasOwnProperty('redirect')) {
            http[details.requestId]['redirect'] = [];
        }
        redirect = {};
        redirect['statusCode'] = details.statusCode;
        http[details.requestId]['statusCode'].push(details.statusCode);
        redirect['statusLine'] = details.statusLine;
        redirect['responseHeaders'] = Headers2Array(details.responseHeaders);
        http[details.requestId]['redirect'].push(redirect);
    } else if (details.responseHeaders) {
        http[details.requestId]['statusCode'].push(details.statusCode);
        http[details.requestId]['statusLine'] = details.statusLine;
        http[details.requestId]['responseHeaders'] = details.responseHeaders;
    
        //已经完成请求，记录并删除
        var u = parseURL(http[details.requestId]["url"]);
        db.httplog.add({
            url: http[details.requestId]["url"],
            method: http[details.requestId]["method"],
            requestHeaders: Headers2Array(http[details.requestId]["requestHeaders"]),
            requestBody: http[details.requestId].hasOwnProperty("requestBody") ? formatPost(http[details.requestId]["requestBody"]) : "",
            statusCode: http[details.requestId]["statusCode"],
            statusLine: http[details.requestId]["statusLine"],
            responseHeaders: Headers2Array(http[details.requestId]["responseHeaders"]),
            redirect : http[details.requestId]['redirect'],
            host : u.host.split("."),
            querykey: u.querykey

        });
        delete http[details.requestId]
    
    }
    if (details.requestBody) {
        http[details.requestId]['requestBody'] = details.requestBody;
    }

}

function formatPost(postData) {
    var text = "";
    for (name in postData) {
        text += name + ": " + postData[name] + "\n";
    }
    return text;
}

function Headers2Array(headers) {
    var text = [];
    for (i in headers) {
        text.push(headers[i].name + ": " + headers[i].value);
    }
    return text;
}

function parseURL(url) {   
    var a = document.createElement('a');   
    a.href = url;   
    return {   
        host: a.hostname,    
        querykey: (function(){   
            var ret = [],   
            seg = a.search.replace(/^\?/,'').split('&'),   
            len = seg.length, i = 0, s;   
            for (;i<len;i++) {   
                if (!seg[i]) { continue; }   
                s = seg[i].split('=');   
                ret.push(s[0]);   
            }   
            return ret;   
        })(),    
    };   
}  

