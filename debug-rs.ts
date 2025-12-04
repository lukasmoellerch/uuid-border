import { rsEncode, rsDecode } from './src/lib/reed-solomon';

const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const nsym = 4;

console.log('Original data:', Array.from(data));

const encoded = rsEncode(data, nsym);
console.log('Encoded:', Array.from(encoded));
console.log('Encoded length:', encoded.length);

// Test decode without errors
const decoded1 = rsDecode(new Uint8Array(encoded), nsym);
console.log('Decoded (no errors):', decoded1 ? Array.from(decoded1) : 'null');

// Corrupt one byte
const corrupted = new Uint8Array(encoded);
corrupted[3] = 255;
console.log('Corrupted:', Array.from(corrupted));

const decoded2 = rsDecode(corrupted, nsym);
console.log('Decoded (1 error):', decoded2 ? Array.from(decoded2) : 'null');
