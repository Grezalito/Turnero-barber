---
name: anti-generic-ui
description: Director de Arte y Especialista UI/UX Mobile-First (PWA + Tailwind). Usar SIEMPRE que se creen o modifiquen pantallas, componentes, botones, modales de login o estilos visuales.
---

# Reglas de Diseño Visual "Editorial Barber Craft"

## 1. Prohibiciones Estrictas (Anti-IA Genérica)
- PROHIBIDO usar gradientes violetas, índigo o azules (`from-indigo-500`, `via-purple-500`, `bg-blue-600`).
- PROHIBIDO usar la tipografía `Inter` o `Roboto` para títulos y horas.
- PROHIBIDO hacer tarjetas flotantes con sombras difusas genéricas (`rounded-2xl shadow-lg bg-white`).

## 2. Sistema de Diseño Obligatorio ("Obsidian & Raw Brass")
- Fondo principal: Carbón profundo (`#0A0A0B`).
- Superficies / Tarjetas: Grafito mate (`#121214`) con bordes rectos o micro-redondeados (`rounded-sm` o `rounded-md`) y borde fino de 1px (`border-[#242428]`).
- Color de Acento Primario: Bronce/Ámbar crudo (`#D49A2A`) o Cobre quemado (`#C85A32`).
- Texto Principal: Hueso cálido (`#F2EFE9`). Texto secundario: Gris acero (`#8A8A93`).
- Tipografía: Títulos en `Syne` o `Space Grotesk` (Uppercase, bold). Horarios (`10:00`, `10:30`), DNI y Precios (`$2.000`) en fuente monoespaciada `JetBrains Mono`.

## 3. Estructura Mobile-First (PWA)
- Header Fijo Superior: Nombre/Logo a la izquierda. A la derecha, botón de Login/Perfil con ícono de personita (mínimo 44x44px) que despliega un Bottom Sheet pidiendo DNI (`inputmode="numeric"`) y Contraseña.
- Grilla de Turnos: Bloques táctiles de 30 minutos en grilla de 3 o 4 columnas.
- Sticky Bottom Action Bar: Barra fija inferior con resumen del turno y botón "Señar turno · $2.000".
