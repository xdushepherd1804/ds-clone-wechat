// @wechat-clone/server-push — push notification service
export { createPushService, PushError } from './push.service';
export type {
  PushService,
  PushServiceDeps,
  PushPriority,
  PushScenario,
  PushPayload as ServicePushPayload,
  PushTask,
} from './push.service';

// Device token management
export { createDeviceService, DeviceError } from './device.service';
export type {
  DeviceServiceDeps,
  RegisteredDevice,
  RegisterDeviceInput,
} from './device.service';

// Push providers
export {
  MockProvider,
  FCMProvider,
  APNsProvider,
} from './providers';
export type {
  PushProvider,
  PushPayload,
  DeviceInfo,
  DevicePlatform,
  PushProviderType,
  PushProviderConfig,
  MockPushRecord,
} from './providers';
