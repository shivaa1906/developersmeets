import dotenv from 'dotenv';
dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/developer_platform',
  JWT_SECRET: process.env.JWT_SECRET || 'nexus_super_secret_jwt_key_replace_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  CREDIT_PRICE_INR: parseInt(process.env.CREDIT_PRICE_INR || '50', 10),
  CLAIM_COST_CREDITS: parseInt(process.env.CLAIM_COST_CREDITS || '1', 10),
  DEFAULT_REFUND_PERCENTAGE: parseInt(process.env.DEFAULT_REFUND_PERCENTAGE || '100', 10),
};
