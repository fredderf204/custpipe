'use strict';
var util = require('util');
var request = require('request');
var azure = require('azure-storage');
var async = require('async');
var msRestAzure = require('ms-rest-azure');
var ResourceManagementClient = require('azure-arm-resource').ResourceManagementClient;
var WebSiteManagement = require('azure-arm-website');
module.exports = function (context, myQueueItem) {
    context.log('function triggered by item in the queue: ', myQueueItem);
    var clientId = process.env.CLIENT_ID;
    var domain = process.env.DOMAIN;
    var secret = process.env.APPLICATION_SECRET;
    var subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    var resourceClient;
    var resourceGroupName = context.bindings.inputTable.buildrname;
    var webSiteName = context.bindings.inputTable.buildrname;
    var projname = context.bindings.inputTable.PartitionKey;
    var branch = context.bindings.inputTable.branch;
    var resourceName = context.bindings.inputTable.buildrname;
    var buildurl = context.bindings.inputTable.buildurl;
    var whurl = process.env.whurl;
    var whjson = {
        "title": 'Deploy Started ;)',
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
    var status = "deploy started";
    var deploystarttime = new Date();
    var deployitem = {
        "PartitionKey": { '_': myQueueItem.partitionKey },
        "RowKey": { '_': myQueueItem.rowKey },
        "status": { '_': status },
        "deploystarttime": { '_': deploystarttime }
    };
    process.env['AZURE_STORAGE_CONNECTION_STRING'] = process.env.custpipe_STORAGE;
    var tableSvc = azure.createTableService();
    tableSvc.mergeEntity('custpipe', deployitem, function (error, result, response) {
        if (!error) {
            context.log("Entity updated");
        }
    });
    msRestAzure.loginWithServicePrincipalSecret(clientId, secret, domain, function (err, credentials) {
        if (err) return context.log(err);
        //resourceClient = new ResourceManagementClient(credentials, subscriptionId);
        var webSiteClient = new WebSiteManagement(credentials, subscriptionId);
        async.series([
            function (callback) {
                //azure slot swap 
                slotswap(function (err, result, request, response) {
                    if (err) {
                        return callback(err);
                    }
                    callback(null, result);
                });
            },
            function (callback) {
                //send notifications and update table
                var deployendtime = new Date();
                //update table 2
                var status2 = "deploy completed";
                var deployitem2 = {
                    "PartitionKey": { '_': myQueueItem.partitionKey },
                    "RowKey": { '_': myQueueItem.rowKey },
                    "status": { '_': status2 },
                    "deployendtime": { '_': deployendtime },
                };
                process.env['AZURE_STORAGE_CONNECTION_STRING'] = process.env.custpipe_STORAGE;
                var tableSvc = azure.createTableService();
                tableSvc.mergeEntity('custpipe', deployitem2, function (error, result, response) {
                    if (!error) {
                        context.log("Entity updated second time");
                    }
                });
                //send webhook 2
                var whjson2 = {
                    "title": 'deploy completed ;)',
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
                context.done();
                process.exit();
            });
        //Helper functions
        function slotswap(callback) {
            var slotSwapEntity = {
                targetSlot: "staging"
            };
            context.log('\nUpdating config for website : ' + webSiteName);
            return webSiteClient.sites.swapSlotWithProduction(resourceGroupName, webSiteName, slotSwapEntity, null, callback);
        }
    });
};