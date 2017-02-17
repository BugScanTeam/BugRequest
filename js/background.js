//注册扩展图标点击事件
chrome.browserAction.onClicked.addListener(function(tab) {
    window.open("/options/index.html");
});


localStorage.setItem("origfilter",`(function (log) {
    return false;//true for drop
})
/*
use param log
log = {
    "url": [
        "http://www.baidu.com/",
        "https://www.baidu.com/"
    ],
    "statusCode": [
        307,
        200
    ],
    "redirect": [
        {
            "statusCode": 307,
            "statusLine": "HTTP/1.1 307 Internal Redirect",
            "responseHeaders": [
                "Location: https://www.baidu.com/",
                "Non-Authoritative-Reason: HSTS"
            ]
        }
    ],
    "method": "GET",
    "requestHeaders": [
        {
            "name": "User-Agent",
            "value": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36"
        },
        {
            "name": "Accept-Encoding",
            "value": "gzip, deflate, sdch, br"
        },
        {
            "name": "Accept-Language",
            "value": "zh-CN,zh;q=0.8,en;q=0.6"
        }
    ],
    "statusLine": "HTTP/1.1 200 OK",
    "responseHeaders": [
        {
            "name": "Content-Type",
            "value": "text/html;charset=utf-8"
        },
        {
            "name": "Content-Encoding",
            "value": "gzip"
        },
    ]
}
*/`)
if(localStorage.getItem('filter') == null){
    localStorage.setItem('filter',localStorage.getItem('origfilter'));
}

var filter = eval(localStorage.getItem('filter'));
//配置indexedDB存储
// Dexie.debug = true
var db;
function opendb() {
    db = new Dexie("BugRequest");
    db.version(2).stores({
        httplog: "++id,*url,method,*requestHeaders,requestBody,*statusCode,statusLine,*responseHeaders,*redirect,*host,*querykey,pathname,urlhash",
        savelog: "++id,*url,method,*requestHeaders,requestBody,*statusCode,statusLine,*responseHeaders,*redirect,*host,*querykey,pathname,urlhash"
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
    
        
        var u = parseURL(http[details.requestId]["url"]);
        //过滤
        var drop = false; 
        if(this.filter){
            drop = this.filter(http[details.requestId]);
        }
        if(drop == false){
            //去重
            db.httplog.where('urlhash').equals(urlhash(u)).count(function (count) {
                if(count==0){
                    //入库
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
                        querykey: u.querykey,
                        pathname: u.pathname,
                        urlhash: urlhash(u)

                    });

                }
                delete http[details.requestId];
            })
        }else{
            delete http[details.requestId];
        }

        
        

    
    }
    if (details.requestBody) {
        http[details.requestId]['requestBody'] = details.requestBody;
    }

}


function urlhash(u) {
    return u.host + "|" + u.pathname + "|" + u.querykey.join("|");
}

function formatPost(postData) {
    return decodeURIComponent(String.fromCharCode.apply(null,new Uint8Array(postData.raw[0].bytes)));
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
        pathname : a.pathname,    
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

