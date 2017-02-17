var bg = chrome.extension.getBackgroundPage()
var db = bg.db;

function jsonp(table,search) {
    col =  table.where('querykey').anyOfIgnoreCase(["callback", "cb"])
    if (search != "") {
        return col.and(function (item) {
            if (item.url[0].indexOf(search)!= -1) {
                return true
            }
            else{
                return false
            }   
        })    
    }    
    return col;
}

function redirect_url(table,search) {
    return table.where('statusCode').between(300, 400).and(function(item) {
        //由于Dexie,无法对多个字段进行联合查询，所以只能扫表了
        if (item.querykey.indexOf('url') != -1 || item.querykey.indexOf('u') != -1) {
            if (search!="") {
                if (item.url[0].indexOf(search)!= -1) {
                    return true
                }
                else{
                    return false
                }                
            }
            return true;
        } else {
            return false;
        }
    });
}

function all(table,search) {
    col = table;
    if(search!=""){
        return col.where('host').startsWithAnyOfIgnoreCase(search.split("."));
    }
    return col;
    
}



var rules = {
    "all": all,
    "jsonp": jsonp,
    "redirect_url": redirect_url,
};

var tables = {
    "httplog":db.httplog,
    "savelog":db.savelog
};

function paged(pages,nowpage) {
    if (pages.length <= 10) {
        return pages;
    }
    var newpage = [];
    var left = nowpage;
    var right = pages.length - nowpage;
    var i = 0;
    if(left>5){
        i = nowpage - 5;
    }
    if (right < 5){
        i = pages.length - 10;
    }
    for (; newpage.length < 10; i++) {
        newpage.push(pages[i]);
    }
    return newpage;
}
function Controller($scope) {
    $scope.tab = 1;
    $scope.page = 1;
    $scope.pageitem = 10;
    $scope.pagenum = 0;
    $scope.logs = [];
    $scope.pagerange = [];
    $scope.rules = rules;
    $scope.tables = tables;
    $scope.table = db.httplog;
    $scope.selectedfn = all;
    $scope.search = "";
    $scope.filterfn = localStorage.getItem('filter');
    $scope.flush = function(page) {
        $scope.nosave = ($scope.table == db.httplog ? false : true);
        $scope.page = page;
        col = $scope.selectedfn($scope.table,$scope.search);
        col.count(function(count) {
            $scope.count = count;
            $scope.pagenum = count / $scope.pageitem;
            $scope.pagerange = [];
            for (var i = 0; i < $scope.pagenum; ++i) $scope.pagerange.push(i + 1);
            $scope.pagerange = paged($scope.pagerange,$scope.page);
            $scope.$apply()
        });
        col = col.offset(($scope.page - 1) * $scope.pageitem).limit($scope.pageitem);
        $scope.logs = [];
        col.each(function(lograw) {
            var log = {}
            log["url"] = lograw.url;
            log["request"] = lograw.requestHeaders.join('\n');
            if (lograw.requestBody != "") {
                log["request"] += "\n\n" + lograw.requestBody;
            }
            log["response"] = "";
            if (lograw.redirect && lograw.redirect.length != 0) {
                angular.forEach(lograw.redirect, function(data) {
                    log["response"] += data.statusLine + '\n' + data.responseHeaders.join('\n')+ '\n\n';
                });
            }
            log["response"] += lograw.statusLine + '\n' + lograw.responseHeaders.join('\n');
            log["id"] = lograw.id;
            $scope.logs.push(log);
            $scope.$apply();
        });
    };
    $scope.flush($scope.page);
    $scope.clear = function() {
        $scope.info = 'wait';
        db.close()
        db.delete().then(function(count) {
            bg.opendb();
            db = bg.db
            $scope.info = "ok";
            $scope.flush(1);
            $scope.$apply();
        }).catch(function() {
            $scope.info = "fail";
            $scope.$apply();
        });
    }
    $scope.save = function () {
        bg.localStorage.setItem('filter',$scope.filterfn)
        bg.filter = eval(localStorage.getItem('filter'));
    };
    $scope.reset = function () {
        origfilter = localStorage.getItem('origfilter')
        localStorage.setItem('filter', origfilter);
        bg.filter = eval(localStorage.getItem('filter'));
        $scope.filterfn = origfilter;
    };
    $scope.saveitem = function (log) {
        db.httplog.get(log["id"],function (item) {
            delete item["id"];
            db.savelog.add(item);
        })
         
        $scope.delitem(log);
    };
    $scope.delitem = function (log) {
        $scope.table.delete(log["id"]);
        $scope.count -= 1;
        for (var i = 0; i < $scope.logs.length; i++) {
            if($scope.logs[i] == log){
                $scope.logs.splice(i, 1);
                break;
            }
        }
    };
    $scope.delnow = function () {
        var col = $scope.selectedfn($scope.table,$scope.search);
        if(col.hasOwnProperty('name')){
            col.clear();
        }else{
            col.delete();
        }
        $scope.flush(1);
    }
}