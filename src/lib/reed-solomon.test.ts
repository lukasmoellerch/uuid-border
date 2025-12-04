// Reed-Solomon Error Correction Tests
// Copyright Anysphere Inc.

import { describe, it, expect } from 'vitest';
import {
  rsEncode,
  rsDecode,
  rsEncodeUuid,
  rsDecodeUuid,
  uuidToBytes,
  bytesToUuid,
  calculateParityBytes,
  DEFAULT_RS_CONFIG,
} from './reed-solomon';

describe('Reed-Solomon encoding', () => {
  describe('basic encode/decode', () => {
    it('should encode and decode without errors', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const nsym = 4; // 4 parity bytes
      
      const encoded = rsEncode(data, nsym);
      expect(encoded.length).toBe(data.length + nsym);
      
      // First 8 bytes should be original data
      expect(Array.from(encoded.slice(0, 8))).toEqual(Array.from(data));
      
      const decoded = rsDecode(encoded, nsym);
      expect(decoded).not.toBeNull();
      expect(Array.from(decoded!)).toEqual(Array.from(data));
    });

    it('should correct single byte error', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const nsym = 4;
      
      const encoded = rsEncode(data, nsym);
      
      // Corrupt one byte
      encoded[3] = 255;
      
      const decoded = rsDecode(encoded, nsym);
      expect(decoded).not.toBeNull();
      expect(Array.from(decoded!)).toEqual(Array.from(data));
    });

    it('should correct two byte errors with nsym=4', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const nsym = 4; // Can correct up to 2 errors
      
      const encoded = rsEncode(data, nsym);
      
      // Corrupt two bytes
      encoded[2] = 100;
      encoded[7] = 200;
      
      const decoded = rsDecode(encoded, nsym);
      expect(decoded).not.toBeNull();
      expect(Array.from(decoded!)).toEqual(Array.from(data));
    });

    it('should fail with too many errors', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const nsym = 4; // Can correct up to 2 errors
      
      const encoded = rsEncode(data, nsym);
      
      // Corrupt three bytes (too many)
      encoded[0] = 100;
      encoded[2] = 200;
      encoded[5] = 50;
      
      const decoded = rsDecode(encoded, nsym);
      // Should either return null or return wrong data
      if (decoded !== null) {
        // If it doesn't return null, it should at least not match original
        expect(Array.from(decoded)).not.toEqual(Array.from(data));
      }
    });
  });

  describe('UUID encoding', () => {
    it('should convert UUID to bytes and back', () => {
      const uuid = '12345678-1234-4234-8234-123456789abc';
      const bytes = uuidToBytes(uuid);
      
      expect(bytes.length).toBe(16);
      expect(bytes[0]).toBe(0x12);
      expect(bytes[1]).toBe(0x34);
      
      const recovered = bytesToUuid(bytes);
      expect(recovered).toBe(uuid);
    });

    it('should encode UUID with default redundancy (2x)', () => {
      const uuid = '12345678-1234-4234-8234-123456789abc';
      const bytes = uuidToBytes(uuid);
      const encoded = rsEncodeUuid(bytes);
      
      // With 2x redundancy, we should have 32 bytes (16 data + 16 parity)
      expect(encoded.length).toBe(32);
      
      // First 16 bytes should be original
      expect(Array.from(encoded.slice(0, 16))).toEqual(Array.from(bytes));
    });

    it('should decode UUID without errors', () => {
      const uuid = '12345678-1234-4234-8234-123456789abc';
      const bytes = uuidToBytes(uuid);
      const encoded = rsEncodeUuid(bytes);
      
      const decoded = rsDecodeUuid(encoded);
      expect(decoded).not.toBeNull();
      expect(bytesToUuid(decoded!)).toBe(uuid);
    });

    it('should correct multiple byte errors in UUID', () => {
      const uuid = '12345678-1234-4234-8234-123456789abc';
      const bytes = uuidToBytes(uuid);
      const encoded = rsEncodeUuid(bytes);
      
      // With 16 parity bytes, we can correct up to 8 errors
      // Let's corrupt 5 bytes
      encoded[0] = 0xff;
      encoded[5] = 0xaa;
      encoded[10] = 0xbb;
      encoded[15] = 0xcc;
      encoded[20] = 0xdd; // Even in parity area
      
      const decoded = rsDecodeUuid(encoded);
      expect(decoded).not.toBeNull();
      expect(bytesToUuid(decoded!)).toBe(uuid);
    });

    it('should handle random UUIDs', () => {
      for (let i = 0; i < 10; i++) {
        // Generate random UUID
        const hex = Array.from({ length: 32 }, () => 
          Math.floor(Math.random() * 16).toString(16)
        ).join('');
        const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        
        const bytes = uuidToBytes(uuid);
        const encoded = rsEncodeUuid(bytes);
        const decoded = rsDecodeUuid(encoded);
        
        expect(decoded).not.toBeNull();
        expect(bytesToUuid(decoded!)).toBe(uuid);
      }
    });
  });

  describe('configurable redundancy', () => {
    it('should calculate correct parity bytes for different redundancy factors', () => {
      expect(calculateParityBytes(16, 2.0)).toBe(16); // 2x total = 16 parity
      expect(calculateParityBytes(16, 1.5)).toBe(8);  // 1.5x total = 8 parity
      expect(calculateParityBytes(16, 3.0)).toBe(32); // 3x total = 32 parity
      expect(calculateParityBytes(16, 1.25)).toBe(4); // 1.25x total = 4 parity
    });

    it('should work with different redundancy factors', () => {
      const uuid = '12345678-1234-4234-8234-123456789abc';
      const bytes = uuidToBytes(uuid);
      
      // Test with 1.5x redundancy (8 parity bytes, can correct 4 errors)
      const config = { redundancyFactor: 1.5 };
      const encoded = rsEncodeUuid(bytes, config);
      
      expect(encoded.length).toBe(24); // 16 + 8
      
      // Corrupt 2 bytes (within correction limit)
      encoded[0] = 0xff;
      encoded[10] = 0xaa;
      
      const decoded = rsDecodeUuid(encoded, config);
      expect(decoded).not.toBeNull();
      expect(bytesToUuid(decoded!)).toBe(uuid);
    });

    it('should work with 3x redundancy', () => {
      const uuid = '12345678-1234-4234-8234-123456789abc';
      const bytes = uuidToBytes(uuid);
      
      // Test with 3x redundancy (32 parity bytes, can correct 16 errors)
      const config = { redundancyFactor: 3.0 };
      const encoded = rsEncodeUuid(bytes, config);
      
      expect(encoded.length).toBe(48); // 16 + 32
      
      // Corrupt many bytes
      for (let i = 0; i < 10; i++) {
        encoded[i * 3] = (encoded[i * 3] + 1) % 256;
      }
      
      const decoded = rsDecodeUuid(encoded, config);
      expect(decoded).not.toBeNull();
      expect(bytesToUuid(decoded!)).toBe(uuid);
    });
  });

  describe('error simulation', () => {
    it('should handle errors distributed throughout the message', () => {
      const uuid = 'aaaaaaaa-bbbb-4bbb-8bbb-cccccccccccc';
      const bytes = uuidToBytes(uuid);
      const encoded = rsEncodeUuid(bytes);
      
      // Corrupt bytes at various positions
      encoded[0] ^= 0x01;   // First byte
      encoded[8] ^= 0x10;   // Middle of data
      encoded[15] ^= 0xff;  // End of data
      encoded[20] ^= 0x80;  // In parity section
      encoded[28] ^= 0x40;  // Near end of parity
      
      const decoded = rsDecodeUuid(encoded);
      expect(decoded).not.toBeNull();
      expect(bytesToUuid(decoded!)).toBe(uuid);
    });

    it('should handle small magnitude errors (like compression artifacts)', () => {
      const uuid = '12345678-abcd-4def-8123-456789abcdef';
      const bytes = uuidToBytes(uuid);
      const encoded = rsEncodeUuid(bytes);
      
      // Small magnitude errors (±1, ±2) like compression might cause
      encoded[0] = (encoded[0] + 1) % 256;
      encoded[5] = (encoded[5] + 2) % 256;
      encoded[10] = (encoded[10] - 1 + 256) % 256;
      encoded[15] = (encoded[15] - 2 + 256) % 256;
      
      const decoded = rsDecodeUuid(encoded);
      expect(decoded).not.toBeNull();
      expect(bytesToUuid(decoded!)).toBe(uuid);
    });
  });
});
