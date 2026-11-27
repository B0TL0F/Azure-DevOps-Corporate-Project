output "registryname" {
  value = azurerm_container_registry.containerreg.name
}

output "registryloginsv" {
  value = azurerm_container_registry.containerreg.login_server
}

output "github_client_id" {
  value = azurerm_user_assigned_identity.github.client_id
}