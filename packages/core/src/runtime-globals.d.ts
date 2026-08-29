/** Minimal cross-runtime globals required by the core in modern browsers and Node. */
interface Crypto {
  randomUUID(): `${string}-${string}-${string}-${string}-${string}`
}

declare const crypto: Crypto

declare class TextEncoder {
  encode(input?: string): Uint8Array
}
