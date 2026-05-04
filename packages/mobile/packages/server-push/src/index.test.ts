import { describe, it, expect } from 'vitest';
import {
  createPushService,
  PushError,
  createDeviceService,
  DeviceError,
  MockProvider,
} from './index';

describe('server-push', () => {
  describe('module exports', () => {
    it('exports createPushService as a function', () => {
      expect(typeof createPushService).toBe('function');
    });

    it('exports PushError as a class', () => {
      expect(typeof PushError).toBe('function');
      const err = new PushError(1001, 'test error');
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe(1001);
      expect(err.message).toBe('test error');
    });

    it('exports createDeviceService as a function', () => {
      expect(typeof createDeviceService).toBe('function');
    });

    it('exports DeviceError as a class', () => {
      expect(typeof DeviceError).toBe('function');
      const err = new DeviceError(1001, 'device error');
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe(1001);
    });

    it('exports MockProvider as a class', () => {
      expect(typeof MockProvider).toBe('function');
      const provider = new MockProvider();
      expect(provider.type).toBe('mock');
    });
  });
});
