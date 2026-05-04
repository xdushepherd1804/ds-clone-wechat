import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock setup ─────────────────────────────────────────────────────────────

const mockPrismaDeviceToken = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const mockPrisma = {
  deviceToken: mockPrismaDeviceToken,
  $disconnect: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@wechat-clone/shared', () => ({
  ErrorCode: {
    SUCCESS: 0,
    INVALID_PARAM: 1001,
    NOT_FOUND: 1004,
    FORBIDDEN: 1005,
    UNAUTHORIZED: 2000,
    INTERNAL_ERROR: 1003,
  },
}));

import { createDeviceService, DeviceError } from './device.service';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DeviceService', () => {
  const service = createDeviceService({ prisma: mockPrisma as any });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── registerDevice ──────────────────────────────────────────────────────

  describe('registerDevice', () => {
    it('registers a new iOS device', async () => {
      mockPrismaDeviceToken.findUnique.mockResolvedValue(null);
      mockPrismaDeviceToken.create.mockResolvedValue({
        id: 'dev1',
        userId: 'user1',
        platform: 'ios',
        deviceToken: 'ios-token-abc',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const device = await service.registerDevice({
        userId: 'user1',
        platform: 'ios',
        deviceToken: 'ios-token-abc',
      });

      expect(device.platform).toBe('ios');
      expect(device.deviceToken).toBe('ios-token-abc');
      expect(device.userId).toBe('user1');
      expect(mockPrismaDeviceToken.create).toHaveBeenCalled();
    });

    it('registers an Android device', async () => {
      mockPrismaDeviceToken.findUnique.mockResolvedValue(null);
      mockPrismaDeviceToken.create.mockResolvedValue({
        id: 'dev2',
        userId: 'user1',
        platform: 'android',
        deviceToken: 'fcm-token-xyz',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const device = await service.registerDevice({
        userId: 'user1',
        platform: 'android',
        deviceToken: 'fcm-token-xyz',
      });

      expect(device.platform).toBe('android');
    });

    it('registers a web device', async () => {
      mockPrismaDeviceToken.findUnique.mockResolvedValue(null);
      mockPrismaDeviceToken.create.mockResolvedValue({
        id: 'dev3',
        userId: 'user2',
        platform: 'web',
        deviceToken: 'web-token-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const device = await service.registerDevice({
        userId: 'user2',
        platform: 'web',
        deviceToken: 'web-token-123',
      });

      expect(device.platform).toBe('web');
    });

    it('updates existing device on re-registration', async () => {
      mockPrismaDeviceToken.findUnique.mockResolvedValue({
        id: 'dev1',
        userId: 'user1',
        platform: 'ios',
        deviceToken: 'ios-token-abc',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrismaDeviceToken.update.mockResolvedValue({
        id: 'dev1',
        userId: 'user1',
        platform: 'ios',
        deviceToken: 'ios-token-abc',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const device = await service.registerDevice({
        userId: 'user1',
        platform: 'ios',
        deviceToken: 'ios-token-abc',
      });

      expect(mockPrismaDeviceToken.update).toHaveBeenCalled();
      expect(device.id).toBe('dev1');
    });

    it('throws for empty userId', async () => {
      await expect(
        service.registerDevice({ userId: '', platform: 'ios', deviceToken: 'token' }),
      ).rejects.toThrow(DeviceError);
    });

    it('throws for empty deviceToken', async () => {
      await expect(
        service.registerDevice({ userId: 'user1', platform: 'ios', deviceToken: '' }),
      ).rejects.toThrow(DeviceError);
    });

    it('throws for invalid platform', async () => {
      await expect(
        service.registerDevice({ userId: 'user1', platform: 'windows' as any, deviceToken: 'token' }),
      ).rejects.toThrow(DeviceError);
    });
  });

  // ─── unregisterDevice ────────────────────────────────────────────────────

  describe('unregisterDevice', () => {
    it('unregisters a device', async () => {
      mockPrismaDeviceToken.delete.mockResolvedValue({});

      await service.unregisterDevice('user1', 'ios-token-abc');
      expect(mockPrismaDeviceToken.delete).toHaveBeenCalledWith({
        where: { userId_deviceToken: { userId: 'user1', deviceToken: 'ios-token-abc' } },
      });
    });

    it('throws DeviceError when device not found', async () => {
      mockPrismaDeviceToken.delete.mockRejectedValue(new Error('Record not found'));

      await expect(
        service.unregisterDevice('user1', 'nonexistent'),
      ).rejects.toThrow(DeviceError);
    });

    it('throws for empty userId', async () => {
      await expect(
        service.unregisterDevice('', 'token'),
      ).rejects.toThrow(DeviceError);
    });
  });

  // ─── getDevices ──────────────────────────────────────────────────────────

  describe('getDevices', () => {
    it('returns all devices for a user', async () => {
      mockPrismaDeviceToken.findMany.mockResolvedValue([
        {
          id: 'dev1', userId: 'user1', platform: 'ios',
          deviceToken: 'ios-token', createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: 'dev2', userId: 'user1', platform: 'android',
          deviceToken: 'fcm-token', createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      const devices = await service.getDevices('user1');
      expect(devices).toHaveLength(2);
      expect(devices[0].platform).toBe('ios');
      expect(devices[1].platform).toBe('android');
    });

    it('returns empty array for user with no devices', async () => {
      mockPrismaDeviceToken.findMany.mockResolvedValue([]);

      const devices = await service.getDevices('user1');
      expect(devices).toEqual([]);
    });
  });

  // ─── getDevicesByPlatform ────────────────────────────────────────────────

  describe('getDevicesByPlatform', () => {
    it('filters devices by platform', async () => {
      mockPrismaDeviceToken.findMany.mockResolvedValue([
        {
          id: 'dev1', userId: 'user1', platform: 'ios',
          deviceToken: 'ios-token', createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      const devices = await service.getDevicesByPlatform('user1', 'ios');
      expect(devices).toHaveLength(1);
      expect(mockPrismaDeviceToken.findMany).toHaveBeenCalledWith({
        where: { userId: 'user1', platform: 'ios' },
        orderBy: { updatedAt: 'desc' },
      });
    });
  });
});
