// Iconos de línea, estilo redondeado y minimalista.
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const base = (props: P) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: 22,
  height: 22,
  ...props,
})

export const IconBack = (p: P) => (
  <svg {...base(p)}><path d="M15 18l-6-6 6-6" /></svg>
)
export const IconChevronRight = (p: P) => (
  <svg {...base(p)}><path d="M9 18l6-6-6-6" /></svg>
)
export const IconAa = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 17.5L8 6.5l4.5 11M5 14h6" />
    <path d="M14.5 17.5c0-3 6-1.6 6-4.5 0-1.4-1.2-2.2-2.7-2.2-1.4 0-2.5.7-2.9 1.7M20.5 13v4.5" />
  </svg>
)
export const IconHighlighter = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 15l-4.5 4.5M4 13l7 7M4.5 12.5L15 3.5a2 2 0 012.8.2l2.5 2.5a2 2 0 01.2 2.8L11.5 19.5z" />
  </svg>
)
export const IconNote = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 20h7M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
  </svg>
)
export const IconSpeak = (p: P) => (
  <svg {...base(p)}>
    <path d="M11 5L6.5 8.5H3v7h3.5L11 19zM15.5 8.5a5 5 0 010 7M18.5 6a9 9 0 010 12" />
  </svg>
)
export const IconPlay = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M8 5.5v13l11-6.5z" /></svg>
)
export const IconPause = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="6.5" y="5" width="3.6" height="14" rx="1.4" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1.4" />
  </svg>
)
export const IconStop = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>
)
export const IconSkipFwd = (p: P) => (
  <svg {...base(p)}><path d="M5 5.5l7 6.5-7 6.5zM15 5.5v13" /></svg>
)
export const IconSkipBack = (p: P) => (
  <svg {...base(p)}><path d="M19 5.5L12 12l7 6.5zM9 5.5v13" /></svg>
)
export const IconTrash = (p: P) => (
  <svg {...base(p)}><path d="M4 7h16M9 7V5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 5v2M6.5 7l.8 12a2 2 0 002 1.8h5.4a2 2 0 002-1.8l.8-12M10 11v6M14 11v6" /></svg>
)
export const IconHeart = (p: P & { filled?: boolean }) => {
  const { filled, ...rest } = p
  return (
    <svg {...base(rest)} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20s-7.5-4.6-9.3-9.3C1.4 7.2 3.7 4 6.9 4 9 4 10.7 5.2 12 7c1.3-1.8 3-3 5.1-3 3.2 0 5.5 3.2 4.2 6.7C19.5 15.4 12 20 12 20z" />
    </svg>
  )
}
export const IconLibrary = (p: P) => (
  <svg {...base(p)}><path d="M4 19.5V5a1.5 1.5 0 011.5-1.5H9V21H5.5A1.5 1.5 0 014 19.5zM9 3.5h4.5V21H9z M16.2 4.2l3.6 1 -4.3 15.6-3.6-1z" /></svg>
)
export const IconQuote = (p: P) => (
  <svg {...base(p)}>
    <path d="M9.5 7.5c-2.5.8-4 2.8-4 5.5v3.5H10v-5H7.6c.2-1.6 1-2.6 2.4-3.2zM19 7.5c-2.5.8-4 2.8-4 5.5v3.5h4.5v-5h-2.4c.2-1.6 1-2.6 2.4-3.2z" />
  </svg>
)
export const IconChart = (p: P) => (
  <svg {...base(p)}><path d="M4 20V10M10 20V4M16 20v-8M21 20H3" /></svg>
)
export const IconGear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.5-2.3 1a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.3-1-2 3.5 2 1.5a7 7 0 000 2.4l-2 1.5 2 3.5 2.3-1a7 7 0 002 1.2l.4 2.6h4l.4-2.6a7 7 0 002-1.2l2.3 1 2-3.5-2-1.5c.06-.4.1-.8.1-1.2z" />
  </svg>
)
export const IconPlus = (p: P) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconDots = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
  </svg>
)
export const IconCheck = (p: P) => (
  <svg {...base(p)}><path d="M4.5 12.5l5 5 10-11" /></svg>
)
export const IconDownload = (p: P) => (
  <svg {...base(p)}><path d="M12 3.5V15m0 0l-4.5-4.5M12 15l4.5-4.5M4.5 19.5h15" /></svg>
)
export const IconUpload = (p: P) => (
  <svg {...base(p)}><path d="M12 15V3.5m0 0L7.5 8M12 3.5L16.5 8M4.5 19.5h15" /></svg>
)
export const IconSearch = (p: P) => (
  <svg {...base(p)}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5l5 5" /></svg>
)
export const IconPages = (p: P) => (
  <svg {...base(p)}><path d="M12 4.5c-2-1.3-4.6-1.5-7.5-1V19c2.9-.5 5.5-.3 7.5 1 2-1.3 4.6-1.5 7.5-1V3.5c-2.9-.5-5.5-.3-7.5 1zM12 4.5V20" /></svg>
)
export const IconScroll = (p: P) => (
  <svg {...base(p)}><path d="M7 4.5h10M5 9h14M5 13.5h14M7 18h10M12 1.5v2M12 20.5v2" /></svg>
)
export const IconImage = (p: P) => (
  <svg {...base(p)}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M4.5 17.5l4.5-4 3.5 3 3-2.5 4 3.5" /></svg>
)
export const IconBook = (p: P) => (
  <svg {...base(p)}><path d="M5 4.5A2 2 0 017 2.5h12v17H7a2 2 0 00-2 2zM5 19.5V4.5M19 15.5H7a2 2 0 00-2 2" /></svg>
)
export const IconStar = (p: P & { filled?: boolean }) => {
  const { filled, ...rest } = p
  return (
    <svg {...base(rest)} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 3.5l2.7 5.4 6 .9-4.3 4.2 1 5.9-5.4-2.8-5.4 2.8 1-5.9L3.3 9.8l6-.9z" />
    </svg>
  )
}
export const IconClose = (p: P) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>
)
export const IconText = (p: P) => (
  <svg {...base(p)}><path d="M4 6.5V4.5h16v2M12 4.5V19.5M9 19.5h6" /></svg>
)
