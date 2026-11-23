output "namespace" {
  description = "Namespace donde quedó desplegado Turnazo."
  value       = kubernetes_namespace_v1.turnazo.metadata[0].name
}

output "backend_service" {
  description = "Nombre del Service del backend (ClusterIP, puerto 80)."
  value       = kubernetes_service_v1.backend.metadata[0].name
}

output "port_forward_command" {
  description = "Comando para llegar a la API desde tu máquina."
  value       = "kubectl port-forward -n ${kubernetes_namespace_v1.turnazo.metadata[0].name} svc/${kubernetes_service_v1.backend.metadata[0].name} 3000:80"
}
