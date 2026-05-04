/**
 * Mock Provider — default for development, stores pushes in memory.
 */
import type { PushProvider, PushPayload, DeviceInfo, PushProviderType, DevicePlatform } from './types';

export interface MockPushRecord {
  device: DeviceInfo;
  payload: PushPayload;
  timestamp: number;
}

export class MockProvider implements PushProvider {
  readonly type: PushProviderType = 'mock';

  /** All pushes sent through this provider (cleared per test) */
  private _sent: MockPushRecord[] = [];

  /** Returns a frozen copy of sent pushes (for assertions) */
  get sent(): readonly MockPushRecord[] {
    return this._sent;
  }

  /** Clear sent records (for test setup) */
  reset(): void {
    this._sent = [];
  }

  async send(device: DeviceInfo, payload: PushPayload): Promise<void> {
    this._sent.push({ device, payload, timestamp: Date.now() });
  }

  async sendToMany(devices: DeviceInfo[], payload: PushPayload): Promise<void> {
    for (const device of devices) {
      await this.send(device, payload);
    }
  }
}
