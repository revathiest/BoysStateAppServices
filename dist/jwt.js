"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sign = sign;
exports.verify = verify;
const crypto_1 = require("crypto");
function base64url(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
function sign(payload, secret) {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify(payload));
    const signature = (0, crypto_1.createHmac)('sha256', secret)
        .update(`${header}.${body}`)
        .digest('base64');
    const sig = base64url(signature);
    return `${header}.${body}.${sig}`;
}
function verify(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3)
        throw new Error('Invalid token');
    const [headerB64, payloadB64, sig] = parts;
    const expectedSig = base64url((0, crypto_1.createHmac)('sha256', secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64'));
    if (sig !== expectedSig)
        throw new Error('Invalid signature');
    const payloadJson = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(payloadJson);
}
