resource "azurerm_user_assigned_identity" "github" {
  location            = azurerm_resource_group.resourcegrp.location
  name                = "id-shackpulse-github"
  resource_group_name = azurerm_resource_group.resourcegrp.name
}

resource "azurerm_federated_identity_credential" "github_main" {
  name                      = "github-main"
  audience                  = ["api://AzureADTokenExchange"]
  issuer                    = "https://token.actions.githubusercontent.com"
  user_assigned_identity_id = azurerm_user_assigned_identity.github.id
  subject                   = "repo:B0TL0F@121419078/Azure-DevOps-Corporate-Project@1474052152:ref:refs/heads/main"
}

resource "azurerm_role_assignment" "github_acr_push" {
  scope                = azurerm_container_registry.containerreg.id
  role_definition_name = "AcrPush"
  principal_id         = azurerm_user_assigned_identity.github.principal_id
}