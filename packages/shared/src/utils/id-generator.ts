let uuidCounter = 0n;
let lastTimestamp = 0n;

const EPOCH = 1700000000000n; // 2023-11-14T22:13:20.000Z — custom epoch
const NODE_ID = BigInt(process.env.NODE_ID ? parseInt(process.env.NODE_ID, 10) % 1024 : 1);
const COUNTER_BITS = 12n;
const COUNTER_MASK = (1n << COUNTER_BITS) - 1n;

/** Snowflake-style 分布式 ID 生成器 */
export function generateId(): string {
  const now = BigInt(Date.now()) - EPOCH;
  if (now < lastTimestamp) {
    // clock drift — bump to last known timestamp
    uuidCounter = (uuidCounter + 1n) & COUNTER_MASK;
    if (uuidCounter === 0n) {
      throw new Error('Snowflake ID counter overflow in the same millisecond');
    }
  } else if (now === lastTimestamp) {
    uuidCounter = (uuidCounter + 1n) & COUNTER_MASK;
    if (uuidCounter === 0n) {
      // sequence exhausted this millisecond, spin
      while (BigInt(Date.now()) - EPOCH <= lastTimestamp) {
        /* busy-wait */
      }
      return generateId();
    }
  } else {
    uuidCounter = 0n;
    lastTimestamp = now;
  }

  const id = (now << 22n) | (NODE_ID << 12n) | uuidCounter;
  return id.toString();
}

/** 生成 16 字符 nano ID */
export function generateShortId(): string {
  const chars = '0123456789abcdefghijklmnopqrstuv';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/** 从 Snowflake ID 提取时间戳 (毫秒) */
export function extractTimestamp(id: string): number {
  const bigId = BigInt(id);
  const ts = (bigId >> 22n) + EPOCH;
  return Number(ts);
}
