import { create } from 'zustand'

export type NotificationSeverity = 'success' | 'error' | 'warning' | 'info'

export interface NotificationAction {
  label: string
  onClick: () => void
}

export interface Notification {
  id: string
  severity: NotificationSeverity
  message: string
  action?: NotificationAction
  autoDismiss?: number
  persistent?: boolean
}

interface NotificationStore {
  queue: Notification[]
  push(n: Omit<Notification, 'id'>): void
  dismiss(id: string): void
  dismissAll(): void
}

const autoDismissDefaults: Record<NotificationSeverity, number | undefined> = {
  success: 3000,
  info: 4000,
  warning: undefined,
  error: undefined
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  queue: [],

  push(n) {
    const autoDismiss =
      n.autoDismiss !== undefined ? n.autoDismiss : autoDismissDefaults[n.severity]
    const notification: Notification = {
      ...n,
      id: crypto.randomUUID(),
      autoDismiss
    }
    set((state) => ({ queue: [...state.queue, notification] }))
  },

  dismiss(id) {
    set((state) => ({ queue: state.queue.filter((n) => n.id !== id) }))
  },

  dismissAll() {
    set({ queue: [] })
  }
}))

// Imperative accessor for use outside React components
export const notificationStore = {
  push: (n: Omit<Notification, 'id'>) => useNotificationStore.getState().push(n),
  dismiss: (id: string) => useNotificationStore.getState().dismiss(id),
  dismissAll: () => useNotificationStore.getState().dismissAll()
}
