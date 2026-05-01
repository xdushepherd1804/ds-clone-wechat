/**
 * APNs Provider — sends push notifications via Apple Push Notification service (HTTP/2).
 *
 * Uses node:crypto for JWT signing (ES256) and node:http2 for the transport.
 * No additional dependencies required.
 */
import { connect, type ClientHttp2Session, type ClientHttp2Stream } from 'node:http2';
import { createSign } from 'node:crypto';
import type { PushProvider, PushPayload, DeviceInfo, PushProviderType } from './types';

const APNS_DEVELOPMENT = 'https://api.sandbox.push.apple.com';
const APNS_PRODUCTION = 'https://api.push.apple.com';

interface ApnsConfig {
  key: string;        // .p8 private key content
  teamId: string;     // Apple Developer Team ID
  keyId: string;      // APNs Key ID
  bundleId: string;   // App Bundle ID
  sandbox?: boolean;
}

export class APNsProvider implements PushProvider {
  readonly type: PushProviderType = 'apns';
  private session: ClientHttp2Session | null = null;
  private jwt: string | null = null;
  private jwtExpiry = 0;
  private endpoint: string;

  constructor(private config: ApnsConfig) {
    this.endpoint = config.sandbox ? APNS_DEVELOPMENT : APNS_PRODUCTION;
  }

  /** Get or refresh the APNs JWT (valid for 50 minutes, refresh at 45) */
  private async getJwt(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.jwt && now < this.jwtExpiry) return this.jwt;

    const header = Buffer.from(
      JSON.stringify({ alg: 'ES256', kid: this.config.keyId }),
    ).toString('base64url');

    const claims = Buffer.from(
      JSON.stringify({ iss: this.config.teamId, iat: now }),
    ).toString('base64url');

    const signInput = `${header}.${claims}`;
    const signer = createSign('SHA256');
    signer.update(signInput);
    signer.end();
    const signature = signer.sign(this.config.key, 'base64url');

    this.jwt = `${signInput}.${signature}`;
    this.jwtExpiry = now + 2700; // 45 minutes
    return this.jwt;
  }

  private getSession(): Promise<ClientHttp2Session> {
    return new Promise((resolve, reject) => {
      if (this.session && !this.session.destroyed) {
        resolve(this.session);
        return;
      }
      const url = new URL(this.endpoint);
      const session = connect(this.endpoint);
      session.on('connect', () => {
        this.session = session;
        resolve(session);
      });
      session.on('error', (err) => {
        this.session = null;
        reject(err);
      });
    });
  }

  async send(device: DeviceInfo, payload: PushPayload): Promise<void> {
    const jwt = await this.getJwt();
    const session = await this.getSession();

    const path = `/3/device/${device.deviceToken}`;

    const aps: Record<string, unknown> = {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      sound: payload.sound || 'default',
    };
    if (payload.badge !== undefined) {
      aps.badge = payload.badge;
    }

    const body: Record<string, unknown> = { aps };
    if (payload.data) {
      Object.assign(body, payload.data);
    }

    const bodyBuf = Buffer.from(JSON.stringify(body));

    return new Promise((resolve, reject) => {
      const req = session.request({
        ':method': 'POST',
        ':path': path,
        'authorization': `bearer ${jwt}`,
        'apns-topic': this.config.bundleId,
        'apns-push-type': 'alert',
        'apns-expiration': '0',
        'content-type': 'application/json',
        'content-length': String(bodyBuf.length),
      });

      req.on('response', (headers) => {
        const status = headers[':status'];
        if (status === 200) {
          resolve();
        } else {
          reject(new Error(`APNs returned status ${status}`));
        }
        req.close();
      });

      req.on('error', (err) => {
        this.session = null;
        reject(err);
      });

      req.end(bodyBuf);
    });
  }

  async sendToMany(devices: DeviceInfo[], payload: PushPayload): Promise<void> {
    const results = await Promise.allSettled(
      devices.map((d) => this.send(d, payload)),
    );
    // Silently ignore individual failures — caller may check logs
    void results;
  }

  /** Close the HTTP/2 session cleanly */
  close(): void {
    if (this.session && !this.session.destroyed) {
      this.session.close();
      this.session = null;
    }
  }
}
