# Turnazo

**A barbershop booking PWA that I took from "it works on my machine" to a tested, containerised, monitored and security-scanned service running on Kubernetes.**

I'm Alan Grieve, a full-stack developer from Venado Tuerto, Argentina. Turnazo is my own product: barbers publish 30-minute slots, clients book them by paying a deposit through Mercado Pago, and both sides get reminders by Web Push and email.

After sending about 50 outreach messages to local barbers without a single taker, I paused the sales push and decided not to abandon the project. The code already had Docker, a real test suite and a security-hardening pass, so it was the right base for something I wanted to get good at: **DevOps**. This README is the story of that work, what I built, what broke along the way, and how to run all of it yourself.

---

## What I built on top of the app

| Stage | What it does | Where to look |
| :--- | :--- | :--- |
| **CI** with GitHub Actions | On every push: 140 unit tests, 50 end-to-end tests (against an in-memory PostgreSQL), a production build, validation of the Kubernetes manifests, and a Docker image build | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| **Kubernetes** (k3s) | Backend and PostgreSQL as manifests: health probes, resource limits, non-root containers, secrets generated from an untracked file, and automatic restart of a crashed container | [`k8s/`](k8s/README.md) |
| **Observability** | A `/metrics` endpoint in the API, Prometheus scraping it, a Grafana dashboard, and Alertmanager sending a Telegram message when the backend goes down | [`k8s/monitoring/`](k8s/monitoring/README.md) |
| **DevSecOps** | The CI scans the Docker image with Trivy and fails the build on any CRITICAL vulnerability that has a fix available | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

### How the pieces fit

```text
 git push ──► GitHub Actions ──► tests · manifest validation · Docker build · Trivy scan
                                                    │
                                              (merge to main)
                                                    ▼
   ┌───────────────── k3s cluster ─────────────────────────────────────────┐
   │  namespace turnazo                      namespace monitoring          │
   │  ┌─────────────┐   ┌───────────┐        ┌────────────┐  alert  ┌────┐ │
   │  │ NestJS API  │──►│ PostgreSQL│        │ Prometheus │────────►│Alert│─┼─► Telegram
   │  │ /health     │   └───────────┘        └─────┬──────┘         │mgr │ │
   │  │ /metrics ◄──┼── scrape every 15s ──────────┘                └────┘ │
   │  └─────────────┘                        ┌────────────┐                │
   │                                         │  Grafana   │ dashboard      │
   │                                         └────────────┘                │
   └───────────────────────────────────────────────────────────────────────┘
```

---

## Things that went wrong, and what I learned

Most of what I learned came from things that did not work the first time.

- **My PC could not run Rancher Desktop.** It needs a virtual machine and refused to start ("nested virtualization not enabled"). I installed k3s natively on Arch Linux instead. It is the same Kubernetes distribution without the VM, and it forced me to learn how images reach the cluster's own containerd (`docker save | k3s ctr images import`).
- **The first deploy crashed three times, and that was fine.** The API started before PostgreSQL was ready, `prisma migrate deploy` failed, and Kubernetes kept restarting the container until the database answered. It was an accidental but real demonstration of self-healing, and it showed me why probes and restart policies matter.
- **My first "backend down" alert would never have fired.** When a pod is deleted, its `up` metric does not turn into `0`, the series simply disappears. I rewrote the rule as `absent(up == 1)` and added a test with `promtool` that simulates exactly that case, so CI protects it.
- **Trivy itself was compromised.** While adding the scanner I found that in March 2026 attackers rewrote almost every version tag of Trivy's GitHub Action. I pinned the action to an exact commit and the Trivy binary to a known-safe version, because a commit cannot be rewritten and a tag can.
- **A critical vulnerability came from a package I never chose.** The `tar` library reached my image through `bcrypt`. Upgrading `bcrypt` to v6 removed it, with no change to my code. The 12 remaining high-severity findings need major upgrades of NestJS and Prisma, so I documented them instead of rushing a risky change.
- **A dashboard panel lied.** My "restarts" panel showed dates from 1969 because I used the wrong unit. I replaced it with a plain uptime figure.

## How I worked

I built this together with Claude, Anthropic's AI assistant, working as a pair-programming partner. It drafted manifests, pipeline steps and configuration; I decided what to build and in what order, ran every command on my own machine, read the logs when something failed, and kept changing the plan based on what actually happened. Every change went through a branch and a pull request, and the CI has to be green before I merge.

---

## About the application

| Feature | Notes |
| :--- | :--- |
| 30-minute slots with a **10-minute temporary lock** while a client pays | Lock token stored hashed; expired locks released by cron |
| **Mercado Pago** deposits | Webhook with HMAC signature validation and idempotency; approved payments that cannot be matched to a slot are kept as `OrphanPayment` for refund |
| **Reminders** 24 h and 2 h before the appointment | Web Push (VAPID) and email, plus `.ics` files and WhatsApp links |
| Three roles: `SUPERADMIN`, `BARBER`, `CLIENT` | JWT authentication with DNI + password |
| Security | Rate limiting, CSP / HSTS headers, 64 KB payload cap, strict CORS in production, scheduled purge of personal data |

**Stack:** NestJS 10, TypeScript, Prisma 6 and PostgreSQL on the backend; React 18, Vite and Tailwind CSS as an installable PWA on the frontend. Docker, GitHub Actions, k3s, Prometheus, Grafana, Alertmanager and Trivy for delivery and operations.

The complete technical reference (every endpoint, environment variable and test result) is in [`docs/README.es.md`](docs/README.es.md), written in Spanish.

---

## Run it yourself

You need Docker and a local Kubernetes cluster (I use k3s on Arch Linux; Rancher Desktop or any local cluster also works).

```bash
# 1. Build the image and load it into k3s
docker build -t turnazo-backend:local backend
docker save turnazo-backend:local | sudo k3s ctr images import -

# 2. Deploy the app (fill k8s/secrets.env first; the template explains how)
cp k8s/secrets.env.example k8s/secrets.env
kubectl apply -k k8s/
kubectl port-forward -n turnazo svc/backend 3000:80
curl localhost:3000/health            # {"status":"ok"}

# 3. Deploy monitoring
cp k8s/monitoring/secrets.env.example k8s/monitoring/secrets.env
kubectl apply -k k8s/monitoring/
kubectl port-forward -n monitoring svc/grafana 3001:3000    # http://localhost:3001
```

Then try breaking it on purpose: `kubectl scale -n turnazo deploy/backend --replicas=0` turns the dashboard red and, a minute later, sends the Telegram alert. The details, including how to create the Telegram bot, are in [`k8s/monitoring/README.md`](k8s/monitoring/README.md).

To run the tests: `cd backend && npm ci && npm test && npm run test:e2e`.

---

## What is next

- **Infrastructure as code:** provision the server and firewall with Terraform instead of clicking through a provider's console.
- **Deeper monitoring:** database and node metrics, and an alert on container restarts.
- **Dependency upgrades:** the remaining high-severity findings, through planned major upgrades of NestJS, Prisma and nodemailer.
