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
  name                 = "custpipedev"
  resource_group_name  = "${azurerm_resource_group.custpiperg.name}"
  storage_account_name = "${azurerm_storage_account.custpipesa.name}"
}

#Create 3 Azure Storage Queues
resource "azurerm_storage_queue" "custpipeq1" {
  name                 = "custpipedev1"
  resource_group_name  = "${azurerm_resource_group.custpiperg.name}"
  storage_account_name = "${azurerm_storage_account.custpipesa.name}"
}

resource "azurerm_storage_queue" "custpipeq2" {
  name                 = "custpipedev2"
  resource_group_name  = "${azurerm_resource_group.custpiperg.name}"
  storage_account_name = "${azurerm_storage_account.custpipesa.name}"
}

resource "azurerm_storage_queue" "custpipeq3" {
  name                 = "custpipedev3"
  resource_group_name  = "${azurerm_resource_group.custpiperg.name}"
  storage_account_name = "${azurerm_storage_account.custpipesa.name}"
}

#Create Azure Function via ARM Template deployment
resource "azurerm_template_deployment" "custpipearm" {
  name                = "terraformdeploy"
  resource_group_name  = "${azurerm_resource_group.custpiperg.name}"
  parameters          = {
      appName = "custpipedev"

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
        "storageAccountType": {
            "type": "string",
            "defaultValue": "Standard_LRS",
            "allowedValues": [
                "Standard_LRS",
                "Standard_GRS",
                "Standard_ZRS",
                "Premium_LRS"
            ],
            "metadata": {
                "description": "Storage Account type"
            }
        }
    },
    "variables": {
        "functionAppName": "[parameters('appName')]",
        "hostingPlanName": "[parameters('appName')]",
        "storageAccountName": "[concat(uniquestring(resourceGroup().id), 'azfunctions')]",
        "storageAccountid": "[concat(resourceGroup().id,'/providers/','Microsoft.Storage/storageAccounts/', variables('storageAccountName'))]"
    },
    "resources": [
        {
            "type": "Microsoft.Storage/storageAccounts",
            "name": "[variables('storageAccountName')]",
            "apiVersion": "2015-06-15",
            "location": "[resourceGroup().location]",
            "properties": {
                "accountType": "[parameters('storageAccountType')]"
            }
        },
        {
            "type": "Microsoft.Web/serverfarms",
            "apiVersion": "2015-04-01",
            "name": "[variables('hostingPlanName')]",
            "location": "[resourceGroup().location]",
            "properties": {
                "name": "[variables('hostingPlanName')]",
                "computeMode": "Dynamic",
                "sku": "Dynamic"
            }
        },
        {
            "apiVersion": "2015-08-01",
            "type": "Microsoft.Web/sites",
            "name": "[variables('functionAppName')]",
            "location": "[resourceGroup().location]",
            "kind": "functionapp",            
            "dependsOn": [
                "[resourceId('Microsoft.Web/serverfarms', variables('hostingPlanName'))]",
                "[resourceId('Microsoft.Storage/storageAccounts', variables('storageAccountName'))]"
            ],
            "properties": {
                "serverFarmId": "[resourceId('Microsoft.Web/serverfarms', variables('hostingPlanName'))]",
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
                            "value": "[toLower(variables('functionAppName'))]"
                        },
                        {
                            "name": "FUNCTIONS_EXTENSION_VERSION",
                            "value": "~1"
                        },
                        {
                            "name": "WEBSITE_NODE_DEFAULT_VERSION",
                            "value": "6.5.0"
                        }
                    ]
                }
            }          
        }
    ]
    }
DEPLOY

  deployment_mode = "Incremental"
}
