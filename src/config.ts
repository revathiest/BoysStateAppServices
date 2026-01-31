const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  if (isProduction) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  if (!isDevelopment) {
    console.warn('WARNING: JWT_SECRET not set. Using insecure default. Set NODE_ENV=development to suppress.');
  }
}

if (isProduction && jwtSecret && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

export const config = {
  jwtSecret: jwtSecret || 'development-secret',
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
};
