# Codex

Biblioteca personal de lectura. EPUB · PDF · texto pegado, con TTS
neuronal offline, subrayados, estadísticas y sincronización por archivo.
PWA instalable en iPhone y Mac.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # produce dist/
```

## Deploy a GitHub Pages

1. Crea un repo en GitHub (p. ej. `codex`) y haz push de este proyecto.
2. En el repo: **Settings → Pages → Source: GitHub Actions**.
3. El workflow `.github/workflows/deploy.yml` ya está listo: cada push a
   `main` construye con `VITE_BASE=/<repo>/` y publica.
4. Abre `https://<usuario>.github.io/codex/` en Safari (iPhone y Mac) →
   Compartir → **Añadir a pantalla de inicio**. Eso instala la PWA;
   desde ahí todo funciona offline.

> El workflow usa el nombre del repo automáticamente como base path.

## Sincronizar iPhone ⇄ Mac

Ajustes → **Exportar biblioteca** genera un archivo `.codex` (libros,
posiciones, subrayados, estadísticas). Guárdalo en iCloud Drive y en el
otro dispositivo usa **Importar biblioteca**: hace merge sin perder datos.

## Voces

- **Sistema**: las instaladas en tu dispositivo (incluidas las premium de
  iOS/macOS). Se pausan al bloquear la pantalla del iPhone.
- **Neuronales (Piper)**: se descargan una vez desde Ajustes → Voces y
  funcionan offline, incluso con la pantalla bloqueada y con controles en
  el lock screen.

## Documentación

- [DECISIONS.md](DECISIONS.md) — decisiones de arquitectura y trade-offs.
- [POSTMORTEM.md](POSTMORTEM.md) — limitaciones honestas, ideas y
  sugerencias (incluida la hoja de ruta del mapa intelectual).
