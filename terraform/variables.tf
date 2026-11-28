variable "subscription_id" {
  type        = string
  description = "subscription id"
}

variable "location" {
  type        = string
  description = "location for resources"
  default     = "centralindia"
}

variable "resource_group_name" {
  type        = string
  description = "resource group name"
  default     = "rg-shackpulse"
}

variable "acr_name" {
  type        = string
  description = "Container Registry Name"
}

variable "my_ip_cidr" {
  type        = string
  description = "My Public IP"
}