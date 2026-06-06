const VAPID_PUBLIC_KEY = "BLne2K9Bbtft8pst66BwyfGilME7xh8BATwnlb8kqVLHkT11kPd6cEBQNJ5az3QAYkC1WEXYt87bRqQy8f8e6y8"

function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
}

export async function requestSGPush(sb, identifier) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    if (Notification.permission === 'denied') return false
    if (Notification.permission === 'default') {
      const res = await Notification.requestPermission()
      if (res !== 'granted') return false
    }
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }
    const json = sub.toJSON()
    await sb.from('sg_push_subscriptions').upsert(
      { identifier, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
      { onConflict: 'identifier,endpoint' }
    )
    return true
  } catch (e) {
    console.warn('[SGPush]', e.message)
    return false
  }
}

export function getSGPushStatus() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}
