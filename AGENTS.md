## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Blizzard API - Prioridades de consulta

El orden de prioridad para consultar datos a la API de Blizzard es el siguiente:

1. **The War Within: Forever** (namespace `dynamic-forever-${region}`) — implementar cuando el modo este disponible en la API.
2. **Retail** (namespace `dynamic-${region}`) — version activa actualmente.

No implementar soporte para Classic Era, Classic Anniversary ni ningun otro modo hasta nueva instruccion.

## General Rules

- Nunca usar emojis en las respuestas ni en el código.
- Mantén un tono estrictamente profesional, directo y conciso. Evita respuestas coloquiales, saludos informales ("jajaja", etc.) y justificaciones excesivas. Limítate a responder lo necesario y ejecutar las tareas.
- Toda tabla nueva o estructura de base de datos debe ser igual a la que provee la API de Blizzard para evitar tablas raras o personalizadas.
- Toda tabla en la interfaz de usuario debe tener siempre las opciones (botones/acciones) para "Ver", "Editar" y "Borrar" cada fila (registro).
- No hagas ninguna tarea hardcodeada.
