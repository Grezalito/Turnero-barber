# Turnazo en Kubernetes (cluster local con Rancher Desktop / k3s)

Manifiestos para correr el backend + PostgreSQL en un cluster de Kubernetes local.

```
                     cluster k3s (Rancher Desktop)
  ┌──────────────────────── namespace: turnazo ────────────────────────┐
  │                                                                     │
  │   Service "backend" ──► Deployment "backend" ──► pod NestJS :3000   │
  │                                                    │  probes /health │
  │                                                    ▼                 │
  │   Service "postgres" ─► StatefulSet "postgres" ─► pod Postgres 17   │
  │                                                    │                 │
  │                                              volumen 1Gi (datos)     │
  │   Secret "turnazo-secrets" (generado desde secrets.env)             │
  └─────────────────────────────────────────────────────────────────────┘
        ▲
        │ kubectl port-forward  →  http://localhost:3000
```

| Archivo | Qué define |
|---|---|
| `kustomization.yaml` | Junta todo, asigna el namespace y genera el Secret |
| `namespace.yaml` | Namespace `turnazo` |
| `postgres.yaml` | StatefulSet + volumen persistente + Service de PostgreSQL |
| `backend.yaml` | Deployment del backend con probes, límites de recursos y Service |
| `secrets.env.example` | Plantilla de secretos (la copia real `secrets.env` no se sube a git) |

## Requisitos

- [Rancher Desktop](https://rancherdesktop.io/) con **Kubernetes habilitado** y
  motor de contenedores **dockerd (moby)**: así la imagen que construís con `docker build`
  queda disponible directo para k3s, sin registry.

## Levantarlo

Desde la raíz del repo:

```bash
# 1. Construir la imagen del backend
docker build -t turnazo-backend:local backend

# 2. Crear el archivo de secretos y completarlo
cp k8s/secrets.env.example k8s/secrets.env

# 3. Aplicar todo
kubectl apply -k k8s/

# 4. Ver cómo arranca (Ctrl+C para salir)
kubectl get pods -n turnazo -w

# 5. Acceder a la API
kubectl port-forward -n turnazo svc/backend 3000:80
curl http://localhost:3000/health     # {"status":"ok"}
```

## Probar la auto-recuperación

```bash
# Matar el proceso de Node dentro del contenedor (simula un crash)
kubectl exec -n turnazo deploy/backend -- pkill -f "node dist/main"

# Kubernetes lo detecta y lo reinicia solo: la columna RESTARTS sube a 1
kubectl get pods -n turnazo -w

# Borrar el pod entero: el Deployment crea uno nuevo para mantener 1 réplica
kubectl delete pod -n turnazo -l app.kubernetes.io/name=backend

# Historial de eventos (reinicios, probes fallidas, etc.)
kubectl get events -n turnazo --sort-by=.lastTimestamp
```

## Actualizar después de un cambio de código

```bash
docker build -t turnazo-backend:local backend
kubectl rollout restart -n turnazo deploy/backend
```

## Monitoreo

Prometheus + Alertmanager + Grafana, con dashboard y alertas de caída por Telegram,
viven en [`monitoring/`](monitoring/README.md) y se despliegan aparte.

## Borrar todo

```bash
kubectl delete -k k8s/
```

El CI valida estos manifiestos contra el esquema de Kubernetes en cada push
(job "Validar manifiestos de Kubernetes" en `.github/workflows/ci.yml`).
