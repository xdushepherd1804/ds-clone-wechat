/**
 * Push Provider abstraction layer — APNs / FCM / Mock
 */

export type PushProviderType = 'apns' | 'fcm' | 'mock';

/** Platform identifiers matching device registrations */
export type DevicePlatform = 'ios' | 'android' | 'web';

/** Push notification payload sent to external providers */
export interface PushPayload {
  /** Alert title shown in the notification banner */
  title: string;
  /** Alert body text */
  body: string;
  /** Deep-link or routing data for the app to handle on tap */
  data?: Record<string, unknown>;
  /** APNs badge count (iOS only) */
  badge?: number;
  /** APNs sound name or 'default' */
  sound?: string;
}

/** A registered device that can receive push notifications */
export interface DeviceInfo {
  userId: string;
  platform: DevicePlatform;
  deviceToken: string;
}

/**
 * Core push provider interface.
 * Each provider (APNs, FCM, Mock) implements this contract.
 */
export interface PushProvider {
  /** Provider identifier */
  readonly type: PushProviderType;

  /** Send a push notification to a single device token */
  send(device: DeviceInfo, payload: PushPayload): Promise<void>;

  /** Send push notifications to multiple devices (batch) */
  sendToMany(devices: DeviceInfo[], payload: PushPayload): Promise<void>;
}

/** Configuration needed to initialise a push provider */
export interface PushProviderConfig {
  /** APNs-specific settings */
  apns?: {
    /** APNs auth key (.p8) file path or raw key content */
    key: string;
    /** Apple Developer Team ID */
    teamId: string;
    /** APNs Key ID */
    keyId: string;
    /** App Bundle ID */
    bundleId: string;
    /** Use sandbox (development) or production endpoint */
    sandbox?: boolean;
  };
  /** FCM-specific settings */
  fcm?: {
    /** Path to Firebase service account JSON */
    serviceAccountPath?: string;
    /** Raw service account JSON string (alternative to file) */
    serviceAccountJson?: string;
  };
}
