# ==============================================================================
# Turnazo en Kubernetes, declarado con Terraform.
#
# Replica lo que hoy define k8s/ con kustomize: namespace, Secret, PostgreSQL
# (StatefulSet con volumen) y el backend NestJS (Deployment con probes).
# Lo que suma Terraform: los secretos se generan solos, hay variables validadas
# y un state que sabe qué existe.
# ==============================================================================

locals {
  secret_name = "turnazo-secrets"

  backend_selector  = { "app.kubernetes.io/name" = "backend" }
  postgres_selector = { "app.kubernetes.io/name" = "postgres" }

  backend_labels  = merge(local.backend_selector, { "app.kubernetes.io/part-of" = "turnazo" })
  postgres_labels = merge(local.postgres_selector, { "app.kubernetes.io/part-of" = "turnazo" })

  jwt_secret        = coalesce(var.jwt_secret, random_password.jwt.result)
  mp_webhook_secret = coalesce(var.mp_webhook_secret, random_password.mp_webhook.result)
}

# --- Secretos generados ---------------------------------------------------------
# Quedan en el state: por eso terraform.tfstate está en .gitignore.

# Sólo letras y números: va dentro de la URL de conexión (DATABASE_URL).
resource "random_password" "postgres" {
  length  = 24
  special = false
}

resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "random_password" "mp_webhook" {
  length  = 32
  special = false
}

# --- Namespace y Secret ---------------------------------------------------------

resource "kubernetes_namespace_v1" "turnazo" {
  metadata {
    name = var.namespace
  }
}

resource "kubernetes_secret_v1" "turnazo" {
  metadata {
    name      = local.secret_name
    namespace = kubernetes_namespace_v1.turnazo.metadata[0].name
    labels    = { "app.kubernetes.io/part-of" = "turnazo" }
  }

  # El provider codifica en base64 por vos.
  data = {
    POSTGRES_PASSWORD   = random_password.postgres.result
    JWT_SECRET          = local.jwt_secret
    MP_WEBHOOK_SECRET   = local.mp_webhook_secret
    MP_ACCESS_TOKEN     = var.mp_access_token
    SUPERADMIN_DNI      = var.superadmin_dni
    SUPERADMIN_PASSWORD = var.superadmin_password
  }
}

# --- PostgreSQL -------------------------------------------------------------------

# Service "headless": sólo da un nombre DNS estable ("postgres") dentro del cluster.
resource "kubernetes_service_v1" "postgres" {
  metadata {
    name      = "postgres"
    namespace = kubernetes_namespace_v1.turnazo.metadata[0].name
    labels    = local.postgres_labels
  }

  spec {
    cluster_ip = "None"
    selector   = local.postgres_selector

    port {
      name        = "postgres"
      port        = 5432
      target_port = "postgres"
    }
  }
}

# StatefulSet (no Deployment): la base necesita identidad estable y su propio disco.
resource "kubernetes_stateful_set_v1" "postgres" {
  metadata {
    name      = "postgres"
    namespace = kubernetes_namespace_v1.turnazo.metadata[0].name
    labels    = local.postgres_labels
  }

  spec {
    service_name = kubernetes_service_v1.postgres.metadata[0].name
    replicas     = 1

    selector {
      match_labels = local.postgres_selector
    }

    template {
      metadata {
        labels = local.postgres_labels
      }

      spec {
        container {
          name  = "postgres"
          image = var.postgres_image

          port {
            name           = "postgres"
            container_port = 5432
          }

          env {
            name  = "POSTGRES_DB"
            value = "turnazo"
          }

          env {
            name  = "POSTGRES_USER"
            value = "turnazo"
          }

          env {
            name = "POSTGRES_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.turnazo.metadata[0].name
                key  = "POSTGRES_PASSWORD"
              }
            }
          }

          # Subcarpeta: el volumen trae un "lost+found" que Postgres no tolera en la raíz.
          env {
            name  = "PGDATA"
            value = "/var/lib/postgresql/data/pgdata"
          }

          readiness_probe {
            exec {
              command = ["pg_isready", "-U", "turnazo", "-d", "turnazo"]
            }
            initial_delay_seconds = 5
            period_seconds        = 5
          }

          liveness_probe {
            exec {
              command = ["pg_isready", "-U", "turnazo", "-d", "turnazo"]
            }
            initial_delay_seconds = 30
            period_seconds        = 10
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              memory = "512Mi"
            }
          }

          volume_mount {
            name       = "data"
            mount_path = "/var/lib/postgresql/data"
          }
        }
      }
    }

    # Cada réplica recibe su propio disco (en k3s lo crea el provisioner "local-path").
    volume_claim_template {
      metadata {
        name = "data"
      }

      spec {
        access_modes = ["ReadWriteOnce"]

        resources {
          requests = {
            storage = var.postgres_storage
          }
        }
      }
    }
  }
}

# --- Backend NestJS ---------------------------------------------------------------

resource "kubernetes_deployment_v1" "backend" {
  metadata {
    name      = "backend"
    namespace = kubernetes_namespace_v1.turnazo.metadata[0].name
    labels    = local.backend_labels
  }

  spec {
    # 1 réplica a propósito: los cron jobs (limpieza de locks, recordatorios) y el
    # rate limit viven en memoria del proceso; con 2+ réplicas se duplicarían.
    replicas = 1

    selector {
      match_labels = local.backend_selector
    }

    template {
      metadata {
        labels = local.backend_labels
      }

      spec {
        # Misma idea que "USER node" del Dockerfile: nunca correr como root.
        security_context {
          run_as_non_root = true
          run_as_user     = 1000
          run_as_group    = 1000
        }

        container {
          name              = "backend"
          image             = var.backend_image
          image_pull_policy = var.backend_image_pull_policy

          port {
            name           = "http"
            container_port = 3000
          }

          env {
            name  = "NODE_ENV"
            value = "production"
          }

          env {
            name  = "PORT"
            value = "3000"
          }

          env {
            name  = "METRICS_ENABLED"
            value = tostring(var.metrics_enabled)
          }

          env {
            name  = "FRONTEND_URL"
            value = var.frontend_url
          }

          env {
            name = "POSTGRES_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.turnazo.metadata[0].name
                key  = "POSTGRES_PASSWORD"
              }
            }
          }

          # $(POSTGRES_PASSWORD) lo reemplaza Kubernetes con la variable de arriba
          # (por eso tiene que estar definida antes). "postgres" es el DNS del Service.
          env {
            name  = "DATABASE_URL"
            value = "postgresql://turnazo:$(POSTGRES_PASSWORD)@postgres:5432/turnazo?schema=public"
          }

          # El resto (JWT_SECRET, MP_*, SUPERADMIN_*) sale del Secret.
          env_from {
            secret_ref {
              name = kubernetes_secret_v1.turnazo.metadata[0].name
            }
          }

          security_context {
            allow_privilege_escalation = false
            capabilities {
              drop = ["ALL"]
            }
          }

          # startupProbe: margen para el arranque (incluye "prisma migrate deploy"):
          # hasta 30 x 5s = 150s. Mientras no pase, las otras dos no se evalúan.
          startup_probe {
            http_get {
              path = "/health"
              port = "http"
            }
            period_seconds    = 5
            failure_threshold = 30
          }

          # Si falla 3 veces seguidas, Kubernetes REINICIA el contenedor.
          liveness_probe {
            http_get {
              path = "/health"
              port = "http"
            }
            period_seconds    = 10
            timeout_seconds   = 3
            failure_threshold = 3
          }

          # Si falla, el pod deja de recibir tráfico (sin reiniciarlo).
          readiness_probe {
            http_get {
              path = "/health"
              port = "http"
            }
            period_seconds    = 5
            timeout_seconds   = 3
            failure_threshold = 2
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "256Mi"
            }
            limits = {
              memory = "512Mi"
            }
          }
        }
      }
    }
  }

  # Esperar a que PostgreSQL esté listo antes de arrancar la API (que migra al iniciar).
  depends_on = [kubernetes_stateful_set_v1.postgres]

  timeouts {
    create = "5m"
    update = "5m"
  }
}

# Service = nombre y puerto estables para llegar al backend aunque el pod cambie de IP.
resource "kubernetes_service_v1" "backend" {
  metadata {
    name      = "backend"
    namespace = kubernetes_namespace_v1.turnazo.metadata[0].name
    labels    = local.backend_labels
  }

  spec {
    type     = "ClusterIP"
    selector = local.backend_selector

    port {
      name        = "http"
      port        = 80
      target_port = "http"
    }
  }
}
