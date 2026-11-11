import argon2 from 'argon2';
import { z } from 'zod';
export const emailSchema = z.string().trim().toLowerCase().max(254).email();
export const newPasswordSchema = z.string().min(12).max(128);
export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
export const hashPassword = (password) =>
  argon2.hash(password, { type: argon2.argon2id });
export const verifyPassword = (hash, password) => argon2.verify(hash, password);
