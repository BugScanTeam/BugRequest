var bg = chrome.extension.getBackgroundPage()
var db = bg.db;

function jsonp() {
    return db.httplog.where('querykey').anyOfIgnoreCase(["callback", "cb"]);
}

function redirect_url() {
    return db.httplog.where('statusCode').between(300, 400).and(function(item) {
        //由于Dexie,无法对多个字段进行联合查询，所以只能扫表了
        if (item.querykey.indexOf('url') != -1 || item.querykey.indexOf('u') != -1) {
            return true;
        } else {
            return false;
        }
    });
}

function all() {
    return db.httplog;
}
rules = {
    "all": all,
    "jsonp": jsonp,
    "redirect_url": redirect_url
}

function Controller($scope) {
    $scope.tab = 1;
    $scope.page = 1;
    $scope.pageitem = 10;
    $scope.pagenum = 0;
    $scope.logs = [];
    $scope.pagerange = [];
    $scope.rules = rules;
    $scope.selectedfn = all;
    $scope.flush = function(page) {
        $scope.page = page;
        col = $scope.selectedfn();
        col.count(function(count) {
            $scope.count = count;
            $scope.pagenum = count / $scope.pageitem;
            $scope.pagerange = [];
            for (var i = 0; i < $scope.pagenum; ++i) $scope.pagerange.push(i + 1);
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
                    log["response"] += data.statusLine + '\n' + data.responseHeaders.join('\n');
                });
            }
            log["response"] += lograw.statusLine + '\n' + lograw.responseHeaders.join('\n');
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
}