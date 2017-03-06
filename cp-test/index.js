'use strict';
var nightwatch = require('nightwatch');
var request = require('request');
var azure = require('azure-storage');
var async = require('async');
module.exports = function (context, myQueueItem) {
    context.log('function triggered by item in the queue: ', myQueueItem);
    var projname = context.bindings.inputTable.PartitionKey;
    var branch = context.bindings.inputTable.branch;
    var resourceName = context.bindings.inputTable.buildrname;
    var buildurl = context.bindings.inputTable.buildurl;
    var whurl = process.env.whurl;
    var whjson = {
        "title": 'Test Started ;)',
        "text": 'Project Name:' + projname + '\nBranch: ' + branch + '\nResourceGroup: ' + resourceName + '\nBuildURL:' + buildurl,
        "themeColor": "EA4300"
    };
    //send webhook1
    request.post(
        whurl,
        {
            json: whjson
        },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                context.log(body);
            }
        }
    );
    //update table 1
    var status = "tests started";
    var teststarttime = new Date();
    var testitem = {
        "PartitionKey": { '_': myQueueItem.partitionKey },
        "RowKey": { '_': myQueueItem.rowKey },
        "status": { '_': status },
        "teststarttime": { '_': teststarttime }
    };
    process.env['AZURE_STORAGE_CONNECTION_STRING'] = process.env.custpipe_STORAGE;
    var tableSvc = azure.createTableService();
    tableSvc.mergeEntity('custpipe', testitem, function (error, result, response) {
        if (!error) {
            context.log("Entity updated");
        }
    });
    async.series([
        //functional test
        //function (callback) {
        //demoftest();
        //},
        //performance test

        function (callback) {
            //send notifications and update table
            var testendtime = new Date();
            //update table 2
            var status2 = "tests completed";
            var testitem2 = {
                "PartitionKey": { '_': myQueueItem.partitionKey },
                "RowKey": { '_': myQueueItem.rowKey },
                "status": { '_': status2 },
                "testendtime": { '_': testendtime },
            };
            process.env['AZURE_STORAGE_CONNECTION_STRING'] = process.env.custpipe_STORAGE;
            var tableSvc = azure.createTableService();
            tableSvc.mergeEntity('custpipe', testitem2, function (error, result, response) {
                if (!error) {
                    context.log("Entity updated second time");
                }
            });
            //send webhook 2
            var whjson2 = {
                "title": 'tests completed ;)',
                "text": 'Project Name:' + projname + '\nBranch: ' + branch + '\nResourceGroup: ' + resourceName,
                "themeColor": "EA4300"
            };
            request.post(
                whurl,
                {
                    json: whjson2
                },
                function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        //context.log(body);
                    }
                }
            );
            //send message to queue
            context.bindings.outputQueueItem = JSON.stringify({
                "partitionKey": projname,
                "rowKey": myQueueItem.rowKey,
                "status": status2
            });
            context.done();
        }
    ],
        function (err, results) {
            if (err) {
                context.log(util.format('\n??????Error occurred in one of the operations.\n%s',
                    util.inspect(err, { depth: null })));
            } else {
                //console.log(util.format('\n######You can browse the website at: https://%s.', results[4].enabledHostNames[0]));
            }
            process.exit();
        });
    //Helper functions
    function demoftest() {
        var done = function () { };
        var settings = {};
        nightwatch.runner({
            config: 'nightwatch.json',
        }, done, settings);
    }
};