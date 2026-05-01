/**
 * WebSocket frame encoding/decoding per RFC 6455.
 *
 * Client→Server frames MUST be masked. Server→Client frames MUST NOT be masked.
 */
import type { Socket } from 'node:net';

// ─── Frame constants ─────────────────────────────────────────────────────────

const OP_TEXT = 0x1;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

export const Opcode = { TEXT: OP_TEXT, CLOSE: OP_CLOSE, PING: OP_PING, PONG: OP_PONG } as const;

// ─── Decoded frame ───────────────────────────────────────────────────────────

export interface WsFrame {
  opcode: number;
  payload: Buffer;
}

// ─── Encode (Server → Client, no mask) ───────────────────────────────────────

export function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  let header: Buffer;

  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

export function encodeTextFrame(text: string): Buffer {
  return encodeFrame(OP_TEXT, Buffer.from(text, 'utf-8'));
}

export function encodeCloseFrame(code = 1000, reason = ''): Buffer {
  const body = Buffer.allocUnsafe(2 + Buffer.byteLength(reason));
  body.writeUInt16BE(code, 0);
  if (reason) body.write(reason, 2);
  return encodeFrame(OP_CLOSE, body);
}

export function encodePingFrame(): Buffer {
  return encodeFrame(OP_PING, Buffer.alloc(0));
}

export function encodePongFrame(data?: Buffer): Buffer {
  return encodeFrame(OP_PONG, data ?? Buffer.alloc(0));
}

// ─── Decode (Client → Server, masked) ────────────────────────────────────────

/**
 * Attempt to parse a complete WebSocket frame from a buffer.
 * Returns the frame and the number of bytes consumed, or null if incomplete.
 */
export function decodeFrame(buf: Buffer): { frame: WsFrame; consumed: number } | null {
  if (buf.length < 2) return null;

  const byte0 = buf[0];
  const byte1 = buf[1];
  const opcode = byte0 & 0x0f;
  const masked = (byte1 & 0x80) !== 0;
  let payloadLen = byte1 & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  const maskOffset = offset;
  const maskLen = masked ? 4 : 0;
  const totalLen = offset + maskLen + payloadLen;

  if (buf.length < totalLen) return null;

  const maskKey = masked ? buf.subarray(maskOffset, maskOffset + 4) : null;
  const payloadStart = maskOffset + maskLen;
  let payload = buf.subarray(payloadStart, payloadStart + payloadLen);

  if (maskKey) {
    // Unmask: payload[i] ^= maskKey[i % 4]
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskKey[i % 4];
    }
  }

  return { frame: { opcode, payload }, consumed: totalLen };
}

// ─── Frame writer (safe send, handles backpressure) ──────────────────────────

export function sendFrame(socket: Socket, frame: Buffer): void {
  if (socket.destroyed || !socket.writable) return;
  try {
    socket.write(frame);
  } catch {
    // socket closed between check and write
  }
}
