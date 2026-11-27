output "registryname" {
  value = azurerm_container_registry.containerreg.name
}

output "registryloginsv" {
  value = azurerm_container_registry.containerreg.login_server
}