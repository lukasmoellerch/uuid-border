import { rsEncode, rsDecode } from './src/lib/reed-solomon';

const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const nsym = 4; // Can correct up to 2 errors

console.log('Original data:', Array.from(data));

const encoded = rsEncode(data, nsym);
console.log('Encoded:', Array.from(encoded));

// Corrupt two bytes
const corrupted = new Uint8Array(encoded);
corrupted[2] = 100;
corrupted[7] = 200;
console.log('Corrupted:', Array.from(corrupted));
console.log('Errors at positions 2 and 7');

const decoded = rsDecode(corrupted, nsym);
console.log('Decoded:', decoded ? Array.from(decoded) : 'null');
