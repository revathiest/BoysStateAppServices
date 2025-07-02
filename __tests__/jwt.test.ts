import { sign, verify } from '../src/jwt';

describe('jwt verify', () => {
  it('throws for invalid token structure', () => {
    expect(() => verify('nope', 'secret')).toThrow('Invalid token');
  });

  it('throws for invalid signature', () => {
    const token = sign({ userId: 1 }, 'secret');
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.badsig`;
    expect(() => verify(tampered, 'secret')).toThrow('Invalid signature');
  });
});
