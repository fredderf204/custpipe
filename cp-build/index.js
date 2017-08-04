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
var uuid = require('node-uuid');
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
    var mess0 = 'Build Started ;) \n\nProject Name:' + projname + '\n\nBranch: ' + branch + '\n\nARM Template: ' + templateuri + '\n\nResourceGroup: ' + resourceName;
    var rowKey = uuid.v1();
    context.log(resourceName);
    //send webhook 1
    context.bindings.outputQueueItemNotify = mess0;
    //update table 1
    var status = "azure build started";
    var buildstarttime = new Date();
    context.bindings.outputTable = {
        "partitionKey": projname,
        "rowKey": rowKey,
        "status": status,
        "buildstarttime": buildstarttime
    }
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
                //update table 2
                var buildendtime = new Date();
                var status2 = "azure build completed";
                context.bindings.outputTable = {
                    "partitionKey": projname,
                    "rowKey": rowKey,
                    "status": status2,
                    "buildendtime": buildendtime,
                    "buildrname": resourceName,
                    "buildurl": 'http://' + resourceName + '.azurewebsites.net'
                }
                //send webhook 2
                var mess1 = 'Build completed ;) \n\nProject Name:' + projname + '\n\nBranch: ' + branch + '\n\nResourceGroup: ' + resourceName + '\n\nBuildURL: http://' + resourceName + '.azurewebsites.net'
                context.bindings.outputQueueItemNotify = mess1;
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