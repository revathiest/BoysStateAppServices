import { createHmac } from 'crypto';

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function sign(payload: object, secret: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64');
  const sig = base64url(signature);
  return `${header}.${body}.${sig}`;
}

export function verify(token: string, secret: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [headerB64, payloadB64, sig] = parts;
  const expectedSig = base64url(
    createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64')
  );
  if (sig !== expectedSig) throw new Error('Invalid signature');
  const payloadJson = Buffer.from(
    payloadB64.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString('utf8');
  return JSON.parse(payloadJson);
}
