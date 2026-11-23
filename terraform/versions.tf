# ==============================================================================
# Versiones y provider.
#
# Terraform (u OpenTofu) habla con el cluster usando tu kubeconfig, igual que
# kubectl. Con Rancher Desktop el contexto se llama "rancher-desktop".
# ==============================================================================
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "kubernetes" {
  config_path    = var.kubeconfig_path
  config_context = var.kube_context
}
