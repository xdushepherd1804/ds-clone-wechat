/**
 * FCM Provider — sends push notifications via Firebase Cloud Messaging (HTTP v1).
 *
 * Requires firebase-admin when actually used.
 * Falls back gracefully if the SDK is not installed (mock/dev mode).
 */
import type { PushProvider, PushPayload, DeviceInfo, PushProviderType } from './types';

export class FCMProvider implements PushProvider {
  readonly type: PushProviderType = 'fcm';
  private messaging: any = null;
  private ready = false;

  constructor(
    private config: { serviceAccountPath?: string; serviceAccountJson?: string },
  ) {}

  /** Initialise Firebase Admin SDK (lazy, idempotent) */
  private async init(): Promise<void> {
    if (this.ready) return;

    try {
      const admin = await import('firebase-admin');

      // Avoid re-initialising
      if (admin.apps.length === 0) {
        let credential: any;
        if (this.config.serviceAccountJson) {
          const sa = JSON.parse(this.config.serviceAccountJson);
          credential = admin.credential.cert(sa);
        } else if (this.config.serviceAccountPath) {
          // Dynamic require of JSON file
          const sa = require(this.config.serviceAccountPath);
          credential = admin.credential.cert(sa);
        } else {
          // Use application default credentials (e.g. GOOGLE_APPLICATION_CREDENTIALS env)
          credential = admin.credential.applicationDefault();
        }
        admin.initializeApp({ credential });
      }

      this.messaging = admin.messaging();
      this.ready = true;
    } catch {
      // firebase-admin not installed or misconfigured — no-op
    }
  }

  async send(device: DeviceInfo, payload: PushPayload): Promise<void> {
    await this.init();
    if (!this.messaging) return;

    const message: any = {
      token: device.deviceToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data ? this.encodeData(payload.data) : undefined,
      android: {
        priority: 'high',
        notification: {
          channelId: 'messages',
          sound: payload.sound || 'default',
        },
      },
      apns: payload.badge !== undefined
        ? { payload: { aps: { badge: payload.badge, sound: payload.sound || 'default' } } }
        : undefined,
      webpush: {
        notification: {
          icon: '/icon-192.png',
          badge: '/badge-72.png',
        },
        fcmOptions: {
          link: payload.data?.link as string | undefined,
        },
      },
    };

    try {
      await this.messaging.send(message);
    } catch {
      // Token may be invalid — caller handles
    }
  }

  async sendToMany(devices: DeviceInfo[], payload: PushPayload): Promise<void> {
    await this.init();
    if (!this.messaging || devices.length === 0) return;

    if (devices.length === 1) {
      await this.send(devices[0], payload);
      return;
    }

    const message: any = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data ? this.encodeData(payload.data) : undefined,
      android: {
        priority: 'high',
        notification: {
          channelId: 'messages',
          sound: payload.sound || 'default',
        },
      },
    };

    const tokens = devices.map((d) => d.deviceToken);

    try {
      const response = await this.messaging.sendEachForMulticast({
        ...message,
        tokens,
      });
      // Firebase returns per-token results; we silently ignore individual failures
      void response;
    } catch {
      // Batch send failed
    }
  }

  /** FCM data payload must be string→string */
  private encodeData(data: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return out;
  }
}
