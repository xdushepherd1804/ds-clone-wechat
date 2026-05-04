import type { PrismaClient } from '@prisma/client';
import type { DevicePlatform } from './providers/types';
import { ErrorCode } from '@wechat-clone/shared';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DeviceServiceDeps {
  prisma: PrismaClient;
}

export interface RegisteredDevice {
  id: string;
  userId: string;
  platform: DevicePlatform;
  deviceToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterDeviceInput {
  userId: string;
  platform: DevicePlatform;
  deviceToken: string;
}

export class DeviceError extends Error {
  override name = 'DeviceError';
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// ─── Service Factory ────────────────────────────────────────────────────────

export function createDeviceService(deps: DeviceServiceDeps) {
  const { prisma } = deps;

  async function registerDevice(input: RegisterDeviceInput): Promise<RegisteredDevice> {
    if (!input.userId || !input.deviceToken) {
      throw new DeviceError(ErrorCode.INVALID_PARAM, '用户ID和设备令牌不能为空');
    }
    if (!['ios', 'android', 'web'].includes(input.platform)) {
      throw new DeviceError(ErrorCode.INVALID_PARAM, '不支持的平台类型');
    }

    // Upsert to handle re-registration (update updatedAt, may change userId)
    const existing = await prisma.deviceToken.findUnique({
      where: { userId_deviceToken: { userId: input.userId, deviceToken: input.deviceToken } },
    });

    if (existing) {
      const updated = await prisma.deviceToken.update({
        where: { id: existing.id },
        data: { platform: input.platform, updatedAt: new Date() },
      });
      return toDevice(updated);
    }

    const created = await prisma.deviceToken.create({
      data: {
        userId: input.userId,
        platform: input.platform,
        deviceToken: input.deviceToken,
      },
    });

    return toDevice(created);
  }

  async function unregisterDevice(userId: string, deviceToken: string): Promise<void> {
    if (!userId || !deviceToken) {
      throw new DeviceError(ErrorCode.INVALID_PARAM, '用户ID和设备令牌不能为空');
    }

    try {
      await prisma.deviceToken.delete({
        where: { userId_deviceToken: { userId, deviceToken } },
      });
    } catch {
      throw new DeviceError(ErrorCode.NOT_FOUND, '设备未注册');
    }
  }

  async function getDevices(userId: string): Promise<RegisteredDevice[]> {
    const devices = await prisma.deviceToken.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return devices.map(toDevice);
  }

  async function getDevicesByPlatform(
    userId: string,
    platform: DevicePlatform,
  ): Promise<RegisteredDevice[]> {
    const devices = await prisma.deviceToken.findMany({
      where: { userId, platform },
      orderBy: { updatedAt: 'desc' },
    });
    return devices.map(toDevice);
  }

  return {
    registerDevice,
    unregisterDevice,
    getDevices,
    getDevicesByPlatform,
  };
}

function toDevice(row: {
  id: string;
  userId: string;
  platform: string;
  deviceToken: string;
  createdAt: Date;
  updatedAt: Date;
}): RegisteredDevice {
  return {
    id: row.id,
    userId: row.userId,
    platform: row.platform as DevicePlatform,
    deviceToken: row.deviceToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
