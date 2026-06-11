# Trainer Arena — Guía de estilo UI

Sistema de diseño definido en `src/styles.css` (@layer components) + `tailwind.config.js`.
Referencias ya migradas: `app.html` (shell), `features/home/home.page.ts`,
`features/auth/login.page.ts`, `features/errors/not-found.page.ts`.

## Marca

- **Nombre**: Trainer Arena (dos palabras), wordmark en stone-900 `font-semibold tracking-tight`.
- **Logo**: dos cartas en abanico + chispa dorada (la "chispa del campeón"). Fuente de verdad: `public/favicon.svg`; en header/footer se reutiliza con `fill="currentColor"` y la chispa `#f59e0b`.
- **Acento de marca**: el ámbar queda reservado a la chispa del logo y a estados semánticos de aviso.

## Dirección: minimalismo utilitario premium

- Canvas cálido `#FAFAF9`; superficies blancas con **borde 1px stone-200**; sombras casi inexistentes (`var(--shadow-rest)`, opacidad ≤ 0.05).
- **El color es escaso**: primario de acción = **negro cálido** (stone-900); `indigo-600` es el ÚNICO acento y solo para lo interactivo (enlaces, foco, selección activa, burbujas de chat propias, badge-brand). Nada de índigo decorativo ni gradientes (excepción: radial sutilísimo del hero, opacidad 0.05).
- Tipografía system-native (SF Pro / Segoe UI Variable), titulares `font-semibold tracking-tight`, nunca negro puro sobre el canvas para cuerpo (stone-800).

## Tokens

- **Neutros**: familia stone (cálida). **Semánticos**: éxito green, aviso amber, peligro red — siempre en pastel pálido + texto oscuro; nunca comunicar solo con color.
- **Radios**: `rounded-md` en controles, `rounded-xl` (12px máx.) en superficies. Nada de `rounded-full` salvo badges.
- **Sombras**: las dan `.card`/`.table-wrap` vía variables; PROHIBIDO `shadow-md/lg/xl`.
- **Espaciado**: generoso; páginas `space-y-6+`, héroes `py-14+`; títulos con `page-title` + subtítulo `text-sm text-stone-500`.

## Clases de componente (úsalas SIEMPRE en lugar de repetir utilidades)

| Clase | Uso |
| --- | --- |
| `btn-primary` / `btn-secondary` / `btn-success` / `btn-warning` / `btn-danger` / `btn-danger-outline` / `btn-ghost` | Botones y enlaces-botón. Modificadores: `btn-sm`, `btn-lg`, `w-full`. |
| `label`, `input`, `hint`, `field-error` | Formularios. `hint` para ayuda bajo el campo; `field-error` para error de validación. |
| `card`, `card-hover` | Superficies. `card-hover` solo si toda la card es un enlace. |
| `alert-error` / `alert-success` / `alert-warning` / `alert-info` | Mensajes. Añadir `role="alert"` a errores y `role="status"` a confirmaciones. |
| `badge-neutral` / `badge-success` / `badge-warning` / `badge-danger` / `badge-brand` | Estados (inscrito, pendiente de pago, en curso…). |
| `table-wrap` + `table` | Tablas: `<div class="table-wrap"><table class="table">…`. El thead/td ya van estilados. |
| `page-title`, `section-title`, `link` | Tipografía. |
| `empty-state` | Estados vacíos: icono SVG zinc-300 + frase + sugerencia. |
| `skeleton` | Carga: bloques `<div class="skeleton h-4 w-1/2">` en lugar de "Cargando…" cuando sea fácil. |

## Accesibilidad (obligatorio)

1. Todo `<input>`/`<select>`/`<textarea>` con `<label for>` asociado (o `aria-label` si no hay label visible). Añadir `required` cuando el control sea obligatorio y `autocomplete` adecuado en formularios de identidad.
2. Botones de solo icono → `aria-label` descriptivo en español. SVGs decorativos → `aria-hidden="true"`.
3. Mensajes de error → `role="alert"`; confirmaciones/estados → `role="status"`.
4. Secciones con encabezado: `aria-labelledby` o encabezados jerárquicos correctos (un solo h1 por página).
5. No eliminar el foco: el ring de foco global ya existe; no añadir `focus:outline-none` sin sustituto.
6. Touch targets móviles ≥ 40px de alto en acciones principales (`py-2.5` o más).
7. Textos SIEMPRE en español; código/identificadores en inglés.

## Patrones

- **Cabecera de página**: `<div class="flex flex-wrap items-center justify-between gap-3"><h1 class="page-title">…</h1><acciones/></div>` y opcionalmente subtítulo.
- **Formularios**: dentro de `card`, `space-y-5`; botón de submit `btn-primary w-full` (en páginas de auth) o alineado a la derecha; deshabilitado mientras `loading()` con texto alternativo ("Guardando…").
- **Tablas → móvil**: mantener `table-wrap` (scroll horizontal); en celdas de acciones usar `btn-sm` con `btn-secondary`/variantes.
- **Timers/countdowns**: `font-mono font-bold`, rojo (`text-red-600`) bajo el umbral crítico, con etiqueta de texto debajo (`text-xs text-zinc-400`).
- **Chat**: burbujas propias `bg-indigo-600 text-white` a la derecha; ajenas `bg-white shadow-sm` a la izquierda; contenedor `rounded-xl border border-zinc-200 bg-zinc-50`.

## Motion (filosofía emil-design-eng)

- Transiciones SIEMPRE con propiedades explícitas (nunca `transition: all`); solo `transform`/`opacity`/colores.
- Curva fuerte por defecto: `var(--ease-out-strong)` (cubic-bezier(0.23, 1, 0.32, 1)); nunca `ease-in` en UI.
- Duraciones: pulsación 160ms, hover/color 150-200ms, paneles 180-250ms; nada > 300ms.
- Todo elemento pulsable da feedback: `.btn` ya incluye `active:scale-[0.97]`.
- Entradas de paneles condicionales: clase `.menu-enter` (@starting-style, fade + translateY(-6px); nunca desde scale(0)).
- `prefers-reduced-motion` ya se respeta globalmente.

## Reglas duras

- NO cambiar lógica TypeScript (signals, métodos, servicios), solo plantillas/clases y atributos aria. Excepción: añadir imports de pipes/utilidades de Angular si la plantilla los necesita.
- NO renombrar selectores, inputs ni rutas.
- NO introducir dependencias nuevas ni fuentes externas.
- Mantener todos los `@if`/`@for`/bindings existentes intactos salvo para envolverlos en la nueva estructura visual.
