// Đọc cấu hình nhúng từ thẻ <script> trên trang khách: data-site-key, data-host, data-user-* (identity).
// Thuần đọc DOM + validate — KHÔNG tạo state, KHÔNG gắn listener.

import type { WidgetIdentity } from '../shared/types';
import { LOG } from './constants';
import type { Bootstrap } from './types';

/**
 * story-08 AC1: chỉ chấp nhận ORIGIN THUẦN (scheme + host[:port], không path/query/hash/credentials).
 * https bất kỳ; http chỉ cho localhost/127.0.0.1 (mirror luật allowed_origins của BE).
 */
export function isAllowedHost(v: string): boolean {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  if (u.origin !== v) return false;
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}

/**
 * story-08 AC2/AC3: chuẩn hoá + validate identity. `identifier` 1..128 ký tự, `identifier_hash` đúng 64 hex.
 * KHÔNG hợp lệ → null (gọi bên ngoài tự log). KHÔNG đọc/chấp nhận bất kỳ "secret" nào từ DOM: hash phải do
 * SERVER của partner ký sẵn.
 */
export function normalizeIdentity(raw: unknown): WidgetIdentity | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const identifier = typeof o.identifier === 'string' ? o.identifier.trim() : '';
  const hash = typeof o.identifier_hash === 'string' ? o.identifier_hash.trim() : '';
  if (identifier.length < 1 || identifier.length > 128) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) return null;
  const out: WidgetIdentity = { identifier, identifier_hash: hash.toLowerCase() };
  for (const k of ['name', 'phone', 'email'] as const) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

function readIdentityAttrs(el: HTMLScriptElement): WidgetIdentity | null {
  const identifier = (el.getAttribute('data-user-id') || '').trim();
  const hash = (el.getAttribute('data-user-hash') || '').trim();
  if (!identifier && !hash) return null; // không khai báo identity → luồng ẩn danh như cũ
  const identity = normalizeIdentity({
    identifier,
    identifier_hash: hash,
    name: el.getAttribute('data-user-name') || undefined,
    phone: el.getAttribute('data-user-phone') || undefined,
    email: el.getAttribute('data-user-email') || undefined,
  });
  if (!identity) {
    console.error(
      `${LOG} invalid data-user-id/data-user-hash (identifier 1..128 chars, hash 64 hex) — identity ignored, falling back to an anonymous chat.`,
    );
  }
  return identity;
}

export function readBootstrap(): Bootstrap | null {
  // document.currentScript chỉ có trong lúc script chạy đồng bộ; script nhúng async vẫn trỏ đúng tag.
  const el =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>('script[data-site-key][src*="widget.js"]');
  if (!el) return null;
  const siteKey = (el.getAttribute('data-site-key') || '').trim();
  if (!siteKey) {
    console.error(`${LOG} missing data-site-key on the <script> tag — widget NOT loaded.`);
    return null;
  }
  // story-08 AC1: data-host tách origin backend khỏi origin phục vụ widget.js (CDN riêng, reverse proxy…).
  const rawHost = (el.getAttribute('data-host') || '').trim().replace(/\/+$/, '');
  let apiBase: string;
  if (rawHost) {
    if (!isAllowedHost(rawHost)) {
      console.error(
        `${LOG} invalid data-host: "${rawHost}" — expected a bare origin like https://host[:port] (http is only allowed for localhost/127.0.0.1). Widget NOT loaded.`,
      );
      return null;
    }
    apiBase = rawHost;
  } else {
    try {
      apiBase = new URL(el.src).origin; // hành vi cũ: cùng origin với widget.js
    } catch {
      apiBase = window.location.origin;
    }
  }
  return { siteKey, apiBase, identity: readIdentityAttrs(el) };
}
