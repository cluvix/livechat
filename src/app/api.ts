// HTTP client cho iframe app. Base = location.origin (widget.html serve TỪ domain backend → cùng origin
// với /api → same-origin, không CORS). Dùng JWT (Bearer) nhận từ loader. Endpoint story-17.
//
// Phát hiện JWT hết hạn: envelope luôn HTTP 200, code=401 khi VisitorAuth từ chối → trả {expired:true} để
// caller kích hoạt re-handshake (AC4).
import { state } from './store';
import type { ClientEnvelope, WidgetMessage } from '../shared/types';

const API = `${window.location.origin}/api/client/livechat`;

export interface ApiResult<T> {
  ok: boolean;
  expired: boolean; // JWT hết hạn/không hợp lệ (code 401)
  rateLimited: boolean; // 429
  data: T | null;
}

async function call<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API}${path}`, init);
    let env: ClientEnvelope<T> | null = null;
    try {
      env = (await res.json()) as ClientEnvelope<T>;
    } catch {
      env = null;
    }
    if (!env) return { ok: false, expired: false, rateLimited: false, data: null };
    return {
      ok: env.success === true,
      expired: env.code === 401,
      rateLimited: env.code === 429,
      data: env.success ? env.data : null,
    };
  } catch {
    return { ok: false, expired: false, rateLimited: false, data: null };
  }
}

function authHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${state.jwt}` };
}

export function fetchMessages(offset = 0, limit = 50): Promise<ApiResult<WidgetMessage[]>> {
  return call<WidgetMessage[]>(`/messages?offset=${offset}&limit=${limit}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${state.jwt}` },
  });
}

export function sendMessage(clientEchoId: string, text: string): Promise<ApiResult<WidgetMessage>> {
  return call<WidgetMessage>('/message', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ client_echo_id: clientEchoId, text }),
  });
}

export function sendTyping(): Promise<ApiResult<null>> {
  return call<null>('/typing', { method: 'POST', headers: authHeaders() });
}

/** story B-05 (AC4) — sau khi handshake (compact-preview click), tạo tin mở đầu campaign trong conversation
 * vừa handshake. Idempotent phía BE (conversation đã có message → no-op `triggered:false`) — gọi thất bại
 * không chặn luồng mở chat (best-effort, xem main.ts triggerCampaignThenContinue). */
export function triggerCampaign(campaignId: number): Promise<ApiResult<{ triggered: boolean }>> {
  return call<{ triggered: boolean }>(`/campaigns/${campaignId}/trigger`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function sseUrl(): string {
  return `${API}/sse?token=${encodeURIComponent(state.jwt)}`;
}
