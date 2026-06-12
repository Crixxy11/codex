import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

// Auto-actualización: al detectar una versión nueva, recargar de inmediato
// para que los deploys lleguen a la PWA instalada sin pasos manuales.
registerSW({ immediate: true })

// Tipografías (autoalojadas, funcionan offline)
import '@fontsource-variable/literata'
import '@fontsource-variable/literata/wght-italic.css'
import '@fontsource-variable/fraunces'
import '@fontsource/eb-garamond/400.css'
import '@fontsource/eb-garamond/400-italic.css'
import '@fontsource/eb-garamond/600.css'
import '@fontsource/vollkorn/400.css'
import '@fontsource/vollkorn/400-italic.css'
import '@fontsource/vollkorn/600.css'
import '@fontsource/crimson-pro/400.css'
import '@fontsource/crimson-pro/400-italic.css'
import '@fontsource/crimson-pro/600.css'
import '@fontsource/lora/400.css'
import '@fontsource/lora/400-italic.css'
import '@fontsource/lora/600.css'
import '@fontsource/spectral/400.css'
import '@fontsource/spectral/400-italic.css'
import '@fontsource/spectral/600.css'
import '@fontsource/libre-baskerville/400.css'
import '@fontsource/libre-baskerville/400-italic.css'
import '@fontsource/libre-baskerville/700.css'
import '@fontsource-variable/source-serif-4'
import '@fontsource-variable/source-serif-4/opsz-italic.css'
import '@fontsource-variable/newsreader'
import '@fontsource-variable/newsreader/opsz-italic.css'

import './styles/tokens.css'
import './styles/base.css'
import './styles/library.css'
import './styles/reader.css'
import './styles/notes.css'
import './styles/stats.css'
import './styles/settings.css'

import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
