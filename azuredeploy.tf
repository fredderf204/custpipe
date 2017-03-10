#Configure the Microsoft Azure Provider
provider "azurerm" {}

#ARM_subscription_id 
#ARM_client_id       
#ARM_client_secret   
#ARM_tenant_id      

#Create a resource group
resource "azurerm_resource_group" "custpiperg" {
  name     = "custpipedev"
  location = "Australia East"

  tags {
    environment = "dev"
    service     = "custpipe"
  }
}

#Create storage account
resource "azurerm_storage_account" "custpipesa" {
  name                = "custpipedev1"
  resource_group_name = "${azurerm_resource_group.custpiperg.name}"

  location     = "Australia East"
  account_type = "Standard_GRS"

  tags {
    environment = "dev"
    service     = "custpipe"
  }
}

#Create a Azure Storage Table
resource "azurerm_storage_table" "custpipetb" {
  name                 = "custpipe"
  resource_group_name  = "${azurerm_resource_group.custpiperg.name}"
  storage_account_name = "${azurerm_storage_account.custpipesa.name}"
}

#Create 3 Azure Storage Queues
resource "azurerm_storage_queue" "custpipeq1" {
  name                 = "custpipe1"
  resource_group_name  = "${azurerm_resource_group.custpiperg.name}"
  storage_account_name = "${azurerm_storage_account.custpipesa.name}"
}

resource "azurerm_storage_queue" "custpipeq2" {
  name                 = "custpipe2"
  resource_group_name  = "${azurerm_resource_group.custpiperg.name}"
  storage_account_name = "${azurerm_storage_account.custpipesa.name}"
}

resource "azurerm_storage_queue" "custpipeq3" {
  name                 = "custpipe3"
  resource_group_name  = "${azurerm_resource_group.custpiperg.name}"
  storage_account_name = "${azurerm_storage_account.custpipesa.name}"
}

#Create Azure Function via ARM Template deployment
resource "azurerm_template_deployment" "custpipearm" {
  name                = "terraformdeploy"
  resource_group_name = "${azurerm_resource_group.custpiperg.name}"

  parameters = {
    appName               = "custpipedev"
    repoURL               = "https://github.com/fredderf204/custpipe.git"
    branch                = "master"
    cpStorageAccountName  = "${azurerm_storage_account.custpipesa.name}"
    cpStorageKey          = "${azurerm_storage_account.custpipesa.primary_access_key}"
    CLIENT_ID             = "$${ARM_CLIENT_ID}"
    DOMAIN                = "mfriedrich.cloud"
    APPLICATION_SECRET    = "$${ARM_CLIENT_SECRET}"
    AZURE_SUBSCRIPTION_ID = "$${ARM_SUBSCRIPTION_ID}"
    whurl                 = "$${whurl}"
  }

  template_body = <<DEPLOY
{
    "$schema": "https://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#",
    "contentVersion": "1.0.0.0",
    "parameters": {
        "appName": {
            "type": "string",
            "metadata": {
                "description": "The name of the function app that you wish to create."
            }
        },
        "repoURL": {
            "type": "string",
            "metadata": {
                "description": "The URL to the GitHub repo"
            }
        },
        "branch": {
            "type": "string",
            "metadata": {
                "description": "The branch name of the GitHub repo"
            }
        },
        "cpStorageAccountName": {
            "type": "string",
            "metadata": {
                "description": "The name of the custpipe storage account"
            }

        },
        "cpStorageKey": {
            "type": "string",
            "metadata": {
                "description": "The primary access key for you custpipe storage account"
            }
        },
        "CLIENT_ID": {
            "type": "string",
            "metadata": {
                "description": "Service Principle ID"
            }
        },
        "DOMAIN": {
            "type": "string",
            "metadata": {
                "description": "DOmain for the Service Principle to sign into"
            }
        },
        "APPLICATION_SECRET": {
            "type": "string",
            "metadata": {
                "description": "Service Principle Secret"
            }
        },
        "AZURE_SUBSCRIPTION_ID": {
            "type": "string",
            "metadata": {
                "description": "ID of the target Azure Subscription"
            }
        },
        "whurl": {
            "type": "string",
            "metadata": {
                "description": "Microsoft teams channel webhook addresses"
            }
        }
    },
    "variables": {
        "storageAccountName": "[concat(uniquestring(resourceGroup().id), 'azfunctions')]",
        "storageAccountid": "[concat(resourceGroup().id,'/providers/','Microsoft.Storage/storageAccounts/', variables('storageAccountName'))]",
        "cpstorageconnstring": "[concat('DefaultEndpointsProtocol=https;AccountName=', parameters('cpStorageAccountName'), ';AccountKey=', parameters('cpStorageKey'))]"
    },
    "resources": [
        {
            "type": "Microsoft.Storage/storageAccounts",
            "name": "[variables('storageAccountName')]",
            "apiVersion": "2015-06-15",
            "location": "[resourceGroup().location]",
            "properties": {
                "accountType": "Standard_LRS"
            }
        },
        {
            "type": "Microsoft.Web/serverfarms",
            "apiVersion": "2015-04-01",
            "name": "[parameters('appName')]",
            "location": "[resourceGroup().location]",
            "properties": {
                "name": "[parameters('appName')]",
                "computeMode": "Dynamic",
                "sku": "Dynamic"
            }
        },
        {
            "apiVersion": "2015-08-01",
            "type": "Microsoft.Web/sites",
            "name": "[parameters('appName')]",
            "location": "[resourceGroup().location]",
            "kind": "functionapp",            
            "dependsOn": [
                "[resourceId('Microsoft.Web/serverfarms', parameters('appName'))]",
                "[resourceId('Microsoft.Storage/storageAccounts', variables('storageAccountName'))]"
            ],
            "properties": {
                "serverFarmId": "[resourceId('Microsoft.Web/serverfarms', parameters('appName'))]",
                "siteConfig": {
                    "appSettings": [
                        {
                            "name": "AzureWebJobsDashboard",
                            "value": "[concat('DefaultEndpointsProtocol=https;AccountName=', variables('storageAccountName'), ';AccountKey=', listKeys(variables('storageAccountid'),'2015-05-01-preview').key1)]"
                        },
                        {
                            "name": "AzureWebJobsStorage",
                            "value": "[concat('DefaultEndpointsProtocol=https;AccountName=', variables('storageAccountName'), ';AccountKey=', listKeys(variables('storageAccountid'),'2015-05-01-preview').key1)]"
                        },
                        {
                            "name": "WEBSITE_CONTENTAZUREFILECONNECTIONSTRING",
                            "value": "[concat('DefaultEndpointsProtocol=https;AccountName=', variables('storageAccountName'), ';AccountKey=', listKeys(variables('storageAccountid'),'2015-05-01-preview').key1)]"
                        },
                        {
                            "name": "WEBSITE_CONTENTSHARE",
                            "value": "[toLower(parameters('appName'))]"
                        },
                        {
                            "name": "FUNCTIONS_EXTENSION_VERSION",
                            "value": "~1"
                        },
                        {
                            "name": "WEBSITE_NODE_DEFAULT_VERSION",
                            "value": "6.5.0"
                        },
                        {
                            "name": "custpipe_STORAGE",
                            "value": "[variables('cpstorageconnstring')]"
                        },
                        {
                            "name": "CLIENT_ID",
                            "value": "[parameters('CLIENT_ID')]"
                        },
                        {
                            "name": "DOMAIN",
                            "value": "[parameters('DOMAIN')]"
                        },
                        {
                            "name": "APPLICATION_SECRET",
                            "value": "[parameters('APPLICATION_SECRET')]"
                        },
                        {
                            "name": "AZURE_SUBSCRIPTION_ID",
                            "value": "[parameters('AZURE_SUBSCRIPTION_ID')]"
                        },
                        {
                            "name": "whurl",
                            "value": "[parameters('whurl')]"
                        }               
                    ]
                }
            },
                "resources": [
                {
                    "apiVersion": "2015-08-01",
                    "name": "web",
                    "type": "sourcecontrols",
                    "dependsOn": [
                    "[resourceId('Microsoft.Web/serverfarms', parameters('appName'))]",
                    "[resourceId('Microsoft.Web/sites', parameters('appName'))]"
                    ],
                    "properties": {
                    "RepoUrl": "[parameters('repoURL')]",
                    "branch": "[parameters('branch')]",
                    "IsManualIntegration": false
                }
            }
        ]          
        }
    ]
}

DEPLOY

  deployment_mode = "Incremental"
}
