import { useEffect } from 'react'
import { Alert, Button, Snackbar } from '@mui/material'
import { useNotificationStore, Notification } from '../stores/notificationStore'

const SNACKBAR_SPACING = 60

interface NotificationItemProps {
  notification: Notification
  index: number
}

function NotificationItem({ notification, index }: NotificationItemProps) {
  const dismiss = useNotificationStore((s) => s.dismiss)

  useEffect(() => {
    if (!notification.autoDismiss) return
    const timer = setTimeout(() => dismiss(notification.id), notification.autoDismiss)
    return () => clearTimeout(timer)
  }, [notification.id, notification.autoDismiss, dismiss])

  return (
    <Snackbar
      open
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      sx={{ bottom: `${index * SNACKBAR_SPACING + 16}px !important` }}
    >
      <Alert
        severity={notification.severity}
        onClose={() => dismiss(notification.id)}
        sx={{ minWidth: 300 }}
        action={
          notification.action ? (
            <Button size="small" color="inherit" onClick={notification.action.onClick}>
              {notification.action.label}
            </Button>
          ) : undefined
        }
      >
        {notification.message}
      </Alert>
    </Snackbar>
  )
}

export function NotificationStack() {
  const queue = useNotificationStore((s) => s.queue)
  const visible = queue.slice(0, 3)

  return (
    <>
      {visible.map((n, i) => (
        <NotificationItem key={n.id} notification={n} index={i} />
      ))}
    </>
  )
}
