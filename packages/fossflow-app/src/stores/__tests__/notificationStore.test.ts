import { useNotificationStore } from '../notificationStore'

// Helper to get a fresh store state for each test
function getStore() {
  return useNotificationStore.getState()
}

beforeEach(() => {
  // Reset store state between tests
  useNotificationStore.setState({ queue: [] })
})

describe('notificationStore', () => {
  test('push() adds notification with generated id', () => {
    getStore().push({ severity: 'info', message: 'Hello' })
    const { queue } = getStore()
    expect(queue).toHaveLength(1)
    expect(queue[0].id).toBeTruthy()
    expect(typeof queue[0].id).toBe('string')
    expect(queue[0].message).toBe('Hello')
  })

  test('success notification has autoDismiss = 3000', () => {
    getStore().push({ severity: 'success', message: 'Done' })
    const { queue } = getStore()
    expect(queue[0].autoDismiss).toBe(3000)
  })

  test('info notification has autoDismiss = 4000', () => {
    getStore().push({ severity: 'info', message: 'FYI' })
    const { queue } = getStore()
    expect(queue[0].autoDismiss).toBe(4000)
  })

  test('error notification has no autoDismiss (sticky)', () => {
    getStore().push({ severity: 'error', message: 'Boom' })
    const { queue } = getStore()
    expect(queue[0].autoDismiss).toBeUndefined()
  })

  test('warning notification has no autoDismiss (sticky)', () => {
    getStore().push({ severity: 'warning', message: 'Careful' })
    const { queue } = getStore()
    expect(queue[0].autoDismiss).toBeUndefined()
  })

  test('explicit autoDismiss overrides severity default', () => {
    getStore().push({ severity: 'error', message: 'Timed', autoDismiss: 5000 })
    const { queue } = getStore()
    expect(queue[0].autoDismiss).toBe(5000)
  })

  test('dismiss() removes by id', () => {
    getStore().push({ severity: 'info', message: 'A' })
    getStore().push({ severity: 'info', message: 'B' })
    const id = getStore().queue[0].id
    getStore().dismiss(id)
    const { queue } = getStore()
    expect(queue).toHaveLength(1)
    expect(queue[0].message).toBe('B')
  })

  test('dismissAll() clears queue', () => {
    getStore().push({ severity: 'info', message: 'A' })
    getStore().push({ severity: 'error', message: 'B' })
    getStore().dismissAll()
    expect(getStore().queue).toHaveLength(0)
  })

  test('max 3 visible: 4th notification is in queue, not visible', () => {
    getStore().push({ severity: 'info', message: '1' })
    getStore().push({ severity: 'info', message: '2' })
    getStore().push({ severity: 'info', message: '3' })
    getStore().push({ severity: 'info', message: '4' })
    const { queue } = getStore()
    expect(queue).toHaveLength(4)
    // Visible = queue.slice(0, 3); 4th item is at index 3 — not in visible slice
    const visible = queue.slice(0, 3)
    expect(visible.map((n) => n.message)).toEqual(['1', '2', '3'])
    expect(queue[3].message).toBe('4')
  })

  test('queue drains: after dismiss, next queued item becomes visible', () => {
    getStore().push({ severity: 'info', message: '1' })
    getStore().push({ severity: 'info', message: '2' })
    getStore().push({ severity: 'info', message: '3' })
    getStore().push({ severity: 'info', message: '4' })

    const firstId = getStore().queue[0].id
    getStore().dismiss(firstId)

    const { queue } = getStore()
    expect(queue).toHaveLength(3)
    // Now all 3 remaining are visible
    const visible = queue.slice(0, 3)
    expect(visible.map((n) => n.message)).toEqual(['2', '3', '4'])
  })
})
