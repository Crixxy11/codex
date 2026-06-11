import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
  kind?: 'info' | 'celebrate'
}

interface ToastState {
  toasts: Toast[]
  show: (text: string, kind?: Toast['kind']) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  show: (text, kind = 'info') => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      kind === 'celebrate' ? 5200 : 3200,
    )
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
