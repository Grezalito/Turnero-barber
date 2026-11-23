# Turnazo con Terraform

Despliega Turnazo (PostgreSQL + backend NestJS) en un cluster de Kubernetes local con Terraform u OpenTofu. Describe el mismo stack que [`k8s/`](../k8s/README.md), pero de forma declarativa, con secretos generados y variables validadas.

```
provider kubernetes ──► namespace "turnazo"
                          ├─ Secret "turnazo-secrets"        (secretos generados + credenciales)
                          ├─ StatefulSet "postgres" + Service headless + volumen 1Gi
                          └─ Deployment "backend" + Service ClusterIP :80 (probes en /health)
```

| Archivo | Qué define |
|---|---|
| `versions.tf` | Versión mínima de Terraform, providers (`kubernetes`, `random`) y conexión al cluster |
| `variables.tf` | Entradas, con validaciones (`jwt_secret` ≥ 32 caracteres, `superadmin_password` sin el placeholder) |
| `main.tf` | Namespace, Secret, PostgreSQL y backend |
| `outputs.tf` | Namespace, nombre del Service y comando de `port-forward` |
| `terraform.tfvars.example` | Plantilla de variables (el `terraform.tfvars` real no se sube a git) |

## Requisitos

- Terraform ≥ 1.5 u OpenTofu.
- Un cluster local con kubeconfig. Pensado para Rancher Desktop con Kubernetes habilitado y motor `dockerd (moby)`, así la imagen construida con `docker build` queda disponible para k3s sin registry.

## Uso

Desde la raíz del repo:

```bash
# 1. Construir la imagen del backend (el Deployment usa imagePullPolicy: Never)
docker build -t turnazo-backend:local backend

# 2. Completar las variables
cd terraform
cp terraform.tfvars.example terraform.tfvars   # editar superadmin_dni y superadmin_password

# 3. Aplicar
terraform init
terraform plan
terraform apply

# 4. Llegar a la API
$(terraform output -raw port_forward_command)    # en otra terminal: curl http://localhost:3000/health
```

Para borrar todo: `terraform destroy` (elimina el namespace y con él el volumen de PostgreSQL).

## Variables principales

| Variable | Default | Notas |
|---|---|---|
| `superadmin_dni` | — (obligatoria) | La API y el seed fallan si falta |
| `superadmin_password` | — (obligatoria) | Mínimo 8 caracteres y distinta de `CAMBIAR_...` |
| `jwt_secret` | `null` | `null` = se genera uno aleatorio de 48 caracteres. Si lo pasás, mínimo 32 |
| `mp_webhook_secret` | `null` | `null` = se genera uno aleatorio |
| `mp_access_token` | `null` | `null` = modo simulado de pagos (usa el token de ejemplo de `.env.example`, no cobra nada) |
| `backend_image` | `turnazo-backend:local` | Con una imagen de un registry, usar `backend_image_pull_policy = "IfNotPresent"` |
| `kube_context` | `null` | `null` = contexto actual; con Rancher Desktop es `rancher-desktop` |
| `metrics_enabled` | `true` | Seguro con Service ClusterIP; en un deploy público, `false` |

La lista completa está en `variables.tf`.

## Decisiones y límites

- **Una réplica del backend, a propósito.** Los cron jobs (limpieza de locks, recordatorios) y el rate limit viven en memoria del proceso; con 2 o más réplicas se duplicarían. Es la misma decisión que en `k8s/backend.yaml`.
- **Los secretos generados quedan en el state.** `terraform.tfstate` contiene la contraseña de PostgreSQL y el JWT en texto plano; por eso está en `.gitignore`. Este módulo usa state local: para algo compartido hace falta un backend remoto cifrado.
- **No mezclar con `k8s/`.** `kubectl apply -k k8s/` y `terraform apply` crean los mismos recursos en el mismo namespace. Usá uno u otro, no los dos sobre el mismo cluster.
- **Cambiar un secreto no reinicia el backend.** Después de modificar una variable de credenciales, reiniciá a mano: `kubectl rollout restart -n turnazo deploy/backend`.
- **Sin registry ni cloud.** Todo corre en el cluster local; no se gasta nada.
