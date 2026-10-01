// Password hashing (scrypt), bearer-token sessions and login throttling.

import crypto from 'node:crypto';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const pwHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, pwHash };
}

export function verifyPassword(password, user) {
  if (!user?.salt || !user?.pwHash) return false;
  const a = crypto.scryptSync(password, user.salt, 64);
  const b = Buffer.from(user.pwHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export class SessionStore {
  constructor(hours = 12) {
    this.ttl = hours * 3600 * 1000;
    this.map = new Map();
  }
  create(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    this.map.set(token, { userId, expires: Date.now() + this.ttl });
    return token;
  }
  get(token) {
    const s = this.map.get(token);
    if (!s) return null;
    if (s.expires < Date.now()) {
      this.map.delete(token);
      return null;
    }
    s.expires = Date.now() + this.ttl; // sliding expiry
    return s.userId;
  }
  destroy(token) {
    this.map.delete(token);
  }
}

export class LoginLimiter {
  constructor(max = 10, windowMs = 10 * 60 * 1000) {
    this.max = max;
    this.windowMs = windowMs;
    this.map = new Map();
  }
  allow(key) {
    const e = this.map.get(key);
    if (!e) return true;
    if (Date.now() - e.first > this.windowMs) {
      this.map.delete(key);
      return true;
    }
    return e.count < this.max;
  }
  fail(key) {
    const e = this.map.get(key) || { count: 0, first: Date.now() };
    e.count++;
    this.map.set(key, e);
  }
  reset(key) {
    this.map.delete(key);
  }
}
