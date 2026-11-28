resource "azurerm_virtual_network" "vnet" {
  name                = "vnet-shackpulse"
  location            = azurerm_resource_group.resourcegrp.location
  resource_group_name = azurerm_resource_group.resourcegrp.name
  address_space       = ["10.0.0.0/16"]
}

resource "azurerm_subnet" "subnet" {
  name                 = "snet-k3s"
  resource_group_name  = azurerm_resource_group.resourcegrp.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.1.0/24"]
}