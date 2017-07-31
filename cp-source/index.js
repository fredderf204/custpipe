'use strict';
var uuid = require('node-uuid');
var request = require('request');
var moment = require('moment-timezone');
module.exports = function (context, data) {
    context.log('github webhook recieved');
    var rowKey = uuid.v1();
    var status = 'git webhook recieved';
    var projectname = data.repository.name;
    var branch = data.ref.substring(11);
    var commitedby = data.head_commit.committer.name;
    var ghmess = data.head_commit.message;
    var mess = 'Project Name: ' + projectname + '\nBranch: ' + branch + '\nCommitted By: ' + commitedby + '\nGitHub Message: ' + ghmess
    context.bindings.outputQueueItemNotify = {mess};
    context.bindings.outputTable = {
        "partitionKey": projectname,
        "rowKey": rowKey,
        "repourl": data.repository.html_url,
        "branch": branch,
        "buildnum": 4,
        "commitid": data.head_commit.id,
        "committime": moment.tz(data.head_commit.timestamp, "Australia/Sydney").format(),
        "commitmesg": ghmess,
        "committedby": commitedby,
        "status": status
    }
    context.bindings.outputQueueItem = JSON.stringify({
        "partitionKey": projectname,
        "rowKey": rowKey,
        "status": status
    });
    context.res = { body: 'New GitHub comment: ' + ghmess };
    context.done();
};
