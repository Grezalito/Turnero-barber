# ==============================================================================
# Variables de entrada.
#
# Las credenciales NO tienen valor por defecto (igual que la API: falla si
# faltan). Pasalas con un terraform.tfvars local (ignorado por git) o con
# variables de entorno TF_VAR_<nombre>.
# ==============================================================================

# --- Conexión al cluster -------------------------------------------------------

variable "kubeconfig_path" {
  description = "Ruta al kubeconfig que usa el provider."
  type        = string
  default     = "~/.kube/config"
}

variable "kube_context" {
  description = "Contexto de kubeconfig a usar. null = el contexto actual."
  type        = string
  default     = null
}

variable "namespace" {
  description = "Namespace donde se despliega todo."
  type        = string
  default     = "turnazo"
}

# --- Imágenes y recursos -------------------------------------------------------

variable "backend_image" {
  description = "Imagen del backend. Con Rancher Desktop (dockerd) alcanza con 'docker build -t turnazo-backend:local backend'."
  type        = string
  default     = "turnazo-backend:local"
}

variable "backend_image_pull_policy" {
  description = "Never = la imagen tiene que existir en el nodo (build local). Usá IfNotPresent o Always con una imagen de un registry."
  type        = string
  default     = "Never"
}

variable "postgres_image" {
  description = "Imagen de PostgreSQL."
  type        = string
  default     = "postgres:17-alpine"
}

variable "postgres_storage" {
  description = "Tamaño del volumen persistente de PostgreSQL."
  type        = string
  default     = "1Gi"
}

# --- Configuración de la aplicación --------------------------------------------

variable "frontend_url" {
  description = "Orígenes permitidos por CORS (FRONTEND_URL). El primero se usa para armar links."
  type        = string
  default     = "http://localhost:5173"
}

variable "metrics_enabled" {
  description = "Habilita GET /metrics. Seguro con Service ClusterIP; en un deploy público dejalo en false."
  type        = bool
  default     = true
}

variable "mp_access_token" {
  description = "Token de Mercado Pago. El valor por defecto activa el modo simulado (no cobra nada)."
  type        = string
  default     = "APP_USR-CENTRAL-PLATFORM-TOKEN"
  sensitive   = true
}

# --- Credenciales (sin default) -----------------------------------------------

variable "superadmin_dni" {
  description = "DNI del SuperAdmin. Obligatorio: la API y el seed fallan si falta."
  type        = string
}

variable "superadmin_password" {
  description = "Contraseña del SuperAdmin. Obligatoria y distinta del placeholder CAMBIAR_..."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.superadmin_password) >= 8 && !startswith(var.superadmin_password, "CAMBIAR_")
    error_message = "superadmin_password tiene que tener al menos 8 caracteres y no puede ser el placeholder CAMBIAR_..."
  }
}

variable "jwt_secret" {
  description = "Secreto de firma JWT (mínimo 32 caracteres). null = se genera uno aleatorio y queda en el state."
  type        = string
  default     = null
  sensitive   = true

  validation {
    condition     = var.jwt_secret == null || length(var.jwt_secret) >= 32
    error_message = "jwt_secret tiene que tener al menos 32 caracteres (la API no arranca con menos)."
  }
}

variable "mp_webhook_secret" {
  description = "Secreto para validar la firma HMAC de los webhooks de Mercado Pago. null = se genera uno aleatorio."
  type        = string
  default     = null
  sensitive   = true
}
