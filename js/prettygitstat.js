"use strict";

function some(obj, f, thisArg) {
    if (obj.constructor === Array) {
        return obj.some(f, thisArg);
    }

    return Object.keys(obj).some(function(value, index, array) {
        return f(obj[value], index, obj);
    }, thisArg);
}

function Node(ntype, nparent, nname, attributions) {
    this.type = ntype;
    this.parentnode = nparent;
    this.name = nname;
    this.children = {};
    this.attributions = attributions || {};
    this.enabled = true;

    if (this.parentnode === null) {
        this.path = nname;
    } else {
        this.path = nparent.path + '/' + nname;
    }
}
Node.prototype.traverse_preorder = function(f) {
    f(this);
    angular.forEach(this.children, function (childnode) {
        childnode.traverse_preorder(f);
    });
};
Node.prototype.traverse_postorder = function(f) {
    angular.forEach(this.children, function (childnode) {
        childnode.traverse_postorder(f);
    });
    f(this);
};
Node.prototype.setDirectoryAttributionsRecursive = function() {
    this.traverse_postorder(function(node) {
        if (node.type != 'dir') {
            return;
        }

        node.attributions = {};
        angular.forEach(node.children, function (childnode) {
            angular.forEach(childnode.attributions, function (count, author) {
                if (childnode.enabled) {
                    node.attributions[author] = (node.attributions[author] || 0) + count;
                }
            });
        });
    });
};
Node.prototype.setEnabledByExcludes = function(excludesFilter) {
    if (this.type == 'dir' && !some(this.children, function (ch) { return ch.enabled; })) {
        this.enabled = false;
        return;
    }
    this.enabled = excludesFilter.keep(this.path);
};
Node.prototype.setEnabledByExcludesRecursive = function(excludesFilter) {
    this.traverse_postorder(function(node) {
        node.setEnabledByExcludes(excludesFilter);
    });
};


function AuthorStats() {
}
AuthorStats.prototype.update_global = function(pathList) {
    var rootNode = pathList[0];

    this.totalLines = 0;
    this.authors = {};
    angular.forEach(rootNode.attributions, function(lines, authorName) {
        this.totalLines += lines;
        this.authors[authorName] = (this.authors[authorName] || 0) + lines;
    }, this);

    angular.forEach(this.authors, function(lines, authorName) {
        var percent = lines * 100.0 / this.totalLines;
        this.authors[authorName] = { name: authorName, lines: lines, percent: percent };
    }, this);

    this.authorNames = Object.keys(this.authors);
    this.authorNames.sort(function (lhs, rhs) {
        return rootNode.attributions[lhs] < rootNode.attributions[rhs];
    });

    this.maxLines = 0;
    angular.forEach(pathList, function(node) {
        if (node.type != 'file' || !node.enabled) {
            return;
        }

        var fileLines = 0;
        angular.forEach(node.attributions, function(lines) { fileLines += lines; });
        this.maxLines = Math.max(this.maxLines, fileLines)
    }, this);
};
AuthorStats.prototype.update_one = function(node) {
    var totalLines = 0;
    angular.forEach(node.attributions, function(count) {
        totalLines += count;
    });

    var authorInfo = this.authorNames.map(function(authorName) {
        var lines = node.attributions[authorName] || 0;
        var percent = lines * 100.0 / totalLines;
        return { name: authorName, lines: lines, percent: percent };
    }, this);

    return { totalLines: totalLines,
             percentOfMaxLines: totalLines * 100.0 / this.maxLines,
             authorInfo: authorInfo };
};
AuthorStats.prototype.update = function(pathList) {
    this.update_global(pathList);

    angular.forEach(pathList, function(path) {
        path.stat = this.update_one(path);
    }, this);
}


function PathFilter(excludes) {
    var excludeLines = excludes
            .split('\n')
            .filter(function (exclude) { return exclude != ''; });

    this.excludes = excludeLines.map(function (exclude) {
        var negate = (exclude[0] == '!');
        if (negate) {
            exclude = exclude.slice(1);
        }
        return { negate: negate, re: RegExp(exclude) };
    });
}
PathFilter.prototype.exclude = function(path) {
    for (var i=0; i < this.excludes.length; i++) {
        var negate = this.excludes[i].negate;
        var re = this.excludes[i].re;

        if (negate && re.test(path)) {
            return false;
        }
        if (!negate && re.test(path)) {
            return true;
        }
    }
    return false;
};
PathFilter.prototype.keep = function(path) {
    return !this.exclude(path);
};


function dirTreeFromJSON(attributions) {
    var paths = Object.keys(attributions);

    var topDir = new Node('dir', null, '.');
    for (var i=0; i < paths.length; i++)  {
        var path = paths[i];
        var components = path.split('/');
        var fname = components[components.length - 1];
        var dirComponents = components.slice(0, -1);

        var curDir = topDir;
        for (var j=0; j < dirComponents.length; j++) {
            var component = dirComponents[j];
            if (!(component in curDir.children)) {
                curDir.children[component] = new Node('dir', curDir, component);
            }
            curDir = curDir.children[component];
        }

        curDir.children[fname] = new Node('file', curDir, fname, attributions[path]);
    }

    return topDir;
}


var gitStatApp = angular.module('gitStatApp', ['ui.bootstrap']);

gitStatApp.controller('StatViewerController', function($scope, $http) {
    $scope.excludes = '';
    $scope.dirTree = null;
    $scope.pathList = [];
    $scope.authorStats = new AuthorStats();
    $scope.colors = ["#5DA5DA", "#FAA43A", "#60BD68", "#F17CB0", "#B2912F",
                     "#B276B2", "#DECF3F", "#F15854", "#4D4D4D"];

    $scope.update = function() {
        console.time("update");
        if ($scope.dirTree === null) {
            return;
        }

        $scope.dirTree.setEnabledByExcludesRecursive(new PathFilter($scope.excludes));
        $scope.dirTree.setDirectoryAttributionsRecursive();

        $scope.authorStats.update($scope.pathList);
        console.timeEnd("update");
    };
    $scope.$watch("excludes", $scope.update);

    var httpRequest = $http.get('stat.json').success(function(data) {
        $scope.dirTree = dirTreeFromJSON(data);

        $scope.pathList = [];
        $scope.dirTree.traverse_preorder(function(node) {
            $scope.pathList.push(node);
        });
        $scope.pathList.sort(function (lhs, rhs) { return lhs.path >= rhs.path; });

        $scope.update();
    });
});
