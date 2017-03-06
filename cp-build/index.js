'use strict';
//https://github.com/Azure-Samples/resource-manager-node-template-deployment/blob/master/index.js
var fs = require('fs');
var path = require('path');
var util = require('util');
var async = require('async');
var randomstring = require("randomstring");
var msRestAzure = require('ms-rest-azure');
var ResourceManagementClient = require('azure-arm-resource').ResourceManagementClient;
var fetch = require('node-fetch');
var request = require('request');
var azure = require('azure-storage');
module.exports = function (context, myQueueItem) {
    context.log('function triggered by item in the queue: ', myQueueItem);
    var clientId = process.env.CLIENT_ID;
    var domain = process.env.DOMAIN;
    var secret = process.env.APPLICATION_SECRET;
    var subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    var resourceClient;
    var randomIds = randomstring.generate({ length: 4, charset: 'alphabetic' });
    var location = 'australia east';
    var projname = context.bindings.inputTable.PartitionKey;
    var deploymentName = 'custpipe';
    var repoURL = context.bindings.inputTable.repourl;
    var branch = context.bindings.inputTable.branch;
    var resourceName = randomIds + projname + branch;
    var buildurl = 'http://' + resourceName + '.azurewebsites.net';
    process.env['buildurl'] = buildurl;
    var templateuri = 'https://raw.githubusercontent.com/fredderf204/ARMTemplates/master/webapp_github/azuredeploy.json';
    var whurl = process.env.whurl;
    var whjson = {
        "title": 'Build Started ;)',
        "text": 'Project Name:' + projname + '\nBranch: ' + branch + '\nARM Template: ' + templateuri + '\nResourceGroup: ' + resourceName,
        "themeColor": "EA4300"
    };
    context.log(resourceName);
    //send webhook 1
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
    var status = "azure build started";
    var buildstarttime = new Date();
    var builditem = {
        "PartitionKey": { '_': myQueueItem.partitionKey },
        "RowKey": { '_': myQueueItem.rowKey },
        "status": { '_': status },
        "buildstarttime": { '_': buildstarttime }
    };
    process.env['AZURE_STORAGE_CONNECTION_STRING'] = process.env.custpipe_STORAGE;
    var tableSvc = azure.createTableService();
    tableSvc.mergeEntity('custpipe', builditem, function (error, result, response) {
        if (!error) {
            context.log("Entity updated");
        }
    });
    //build in azure
    msRestAzure.loginWithServicePrincipalSecret(clientId, secret, domain, function (err, credentials) {
        if (err) return context.log(err);
        resourceClient = new ResourceManagementClient(credentials, subscriptionId);
        async.series([
            function (callback) {
                //create resource group
                createResourceGroup(function (err, result, request, response) {
                    if (err) {
                        return callback(err);
                    }
                    callback(null, result);
                });
            },
            function (callback) {
                //deploy arm template
                loadTemplateAndDeploy(function (err, result, request, response) {
                    if (err) {
                        return callback(err);
                    }
                    context.log(util.format('\nDeployed template %s : \n%s', deploymentName, util.inspect(result, { depth: null })));
                    callback(null, result);
                });
            },
            function (callback) {
                //send notifications and update table
                var buildendtime = new Date();
                //update table 2
                var status2 = "azure build completed";
                var builditem2 = {
                    "PartitionKey": { '_': myQueueItem.partitionKey },
                    "RowKey": { '_': myQueueItem.rowKey },
                    "status": { '_': status2 },
                    "buildendtime": { '_': buildendtime },
                    "buildrname": { '_': resourceName },
                    "buildurl": { '_': 'http://' + resourceName + '.azurewebsites.net' }
                };
                process.env['AZURE_STORAGE_CONNECTION_STRING'] = process.env.custpipe_STORAGE;
                var tableSvc = azure.createTableService();
                tableSvc.mergeEntity('custpipe', builditem2, function (error, result, response) {
                    if (!error) {
                        context.log("Entity updated second time");
                    }
                });
                //send webhook 2
                var whjson2 = {
                    "title": 'Build completed ;)',
                    "text": 'Project Name:' + projname + '\nBranch: ' + branch + '\nResourceGroup: ' + resourceName + '\nBuildURL: http://' + resourceName + '.azurewebsites.net',
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
    });
    // Helper functions
    function createResourceGroup(callback) {
        var groupParameters = { location: location };
        context.log('\nCreating resource group: ' + resourceName);
        return resourceClient.resourceGroups.createOrUpdate(resourceName, groupParameters, callback);
    }
    function loadTemplateAndDeploy(callback) {
        try {
            //var templateFilePath = path.join(__dirname, "templates/template.json");
            //fetch(templateuri)
            //.then(function (res) {
            //var dest = fs.createWriteStream('./temp.json');
            //res.body.pipe(dest);
            // });
            var templateFilePath = path.join(__dirname, "temp1.json");
            var template = JSON.parse(fs.readFileSync(templateFilePath, 'utf8'));
            //var publicSSHKey = fs.readFileSync(expandTilde(publicSSHKeyPath), 'utf8');
        } catch (ex) {
            return callback(ex);
        }
        context.log('\nLoaded template from template.json');
        var parameters = {
            "appServicePlanName": {
                "value": resourceName
            },
            "webappname": {
                "value": resourceName
            },
            "repoURL": {
                "value": repoURL
            },
            "branch": {
                "value": branch
            },
            "slotName": {
                "value": "staging"
            }
        };
        var deploymentParameters = {
            "properties": {
                "parameters": parameters,
                "template": template,
                "mode": "Incremental"
            }
        };
        //context.log(util.format('\nDeploying template %s : \n%s', deploymentName, util.inspect(template, { depth: null })));
        return resourceClient.deployments.createOrUpdate(resourceName,
            deploymentName,
            deploymentParameters,
            callback);
    }
};