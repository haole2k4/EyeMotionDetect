export interface BufferJsonPayload {
  type: 'Buffer';
  data: number[];
}

export function encodeArrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function decodeBinaryPayloadToArrayBuffer(value: unknown): ArrayBuffer | null {
  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }

  if (ArrayBuffer.isView(value)) {
    const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    return copy.buffer;
  }

  if (typeof value === 'string') {
    return decodeBase64ToArrayBuffer(value);
  }

  if (isBufferJsonPayload(value)) {
    return Uint8Array.from(value.data).buffer;
  }

  if (Array.isArray(value) && value.every(isValidByte)) {
    return Uint8Array.from(value).buffer;
  }

  return null;
}

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer | null {
  try {
    const cleaned = base64.trim();
    if (!cleaned) {
      return null;
    }

    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
  } catch {
    return null;
  }
}

function isBufferJsonPayload(value: unknown): value is BufferJsonPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<BufferJsonPayload>;
  return payload.type === 'Buffer' && Array.isArray(payload.data) && payload.data.every(isValidByte);
}

function isValidByte(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;
}
