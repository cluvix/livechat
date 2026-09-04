// story-10: smoke test headless — build thật (dist/) + API/SSE mock qua page.route(). 2 origin riêng biệt
// (xem tests/server.ts) để đúng kiến trúc loader.ts (Origin trang khách ≠ Origin backend Cluvix).
//
// AC2: mount → click bubble → pre-chat 3 ô → gửi → "Đã gửi" → nhận tin staff (SSE) có avatar → footer link.
// AC3: data-host không hợp lệ → không mount ([data-cluvix-livechat] không tồn tại) + console.error chứa
//      "data-host".
// AC4: setUser (identity) → request /session mang đúng `identity`; mock trả 403 → offline, KHÔNG có
//      request /messages (enterChat() chỉ chạy sau session thành công — xem main.ts onSessionReady()).
import { test, expect, type Page, type Route } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { startStaticServer, stopServer } from './server';

const here = dirname(fileURLToPath(import.meta.url));
const DIST_PORT = 5600; // "backend Cluvix" giả lập — widget.js/widget.html + API mock
const HOST_PORT = 5601; // "trang khách" giả lập — fixtures/host.html
const API = `http://localhost:${DIST_PORT}/api/client/livechat`;
const HOST_ORIGIN = `http://127.0.0.1:${HOST_PORT}`;
const WIDGET_ORIGIN = `http://localhost:${DIST_PORT}`;

let distServer: Server;
let hostServer: Server;

test.beforeAll(async () => {
  distServer = await startStaticServer(resolve(here, '../dist'), DIST_PORT, 'localhost');
  hostServer = await startStaticServer(resolve(here, 'fixtures'), HOST_PORT, '127.0.0.1');
});

test.afterAll(async () => {
  await Promise.all([stopServer(distServer), stopServer(hostServer)]);
});

function hostUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams({ loader: `${WIDGET_ORIGIN}/widget.js`, ...params });
  return `${HOST_ORIGIN}/host.html?${qs.toString()}`;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const THEME = {
  primary_color: '#1677ff',
  position: 'right' as const,
  greeting_text: 'Xin chào! Chúng tôi có thể giúp gì cho bạn?',
  offline_text: 'Hiện không có nhân viên trực tuyến, để lại tin nhắn nhé!',
  brand_name: 'Test Clinic',
};
const PRE_CHAT_FORM = { enabled: true, require_name: true, require_phone: true, require_message: true };

async function mockCampaignsEmpty(page: Page) {
  await page.route(`${API}/campaigns*`, (route) =>
    json(route, { success: true, code: 200, message: '', data: { campaigns: [] }, timestamp: '' }),
  );
}

test.describe('smoke — mở/đóng, pre-chat, gửi/nhận tin, footer (AC2)', () => {
  test('mount, pre-chat 3 field, gửi tin, nhận tin staff qua SSE, footer link', async ({ page }) => {
    await mockCampaignsEmpty(page);
    await page.route(`${API}/session`, (route) =>
      json(route, {
        success: true,
        code: 200,
        message: '',
        timestamp: '',
        data: {
          visitor_jwt: 'test-jwt',
          visitor_token: 'test-visitor-token',
          conversation_id: 1,
          config: { widget_theme: THEME, pre_chat_form: PRE_CHAT_FORM },
        },
      }),
    );
    await page.route(`${API}/messages*`, (route) =>
      json(route, { success: true, code: 200, message: '', data: [], timestamp: '' }),
    );
    await page.route(`${API}/message`, (route) => {
      const body = route.request().postDataJSON() as { client_echo_id: string; text: string };
      return json(route, {
        success: true,
        code: 200,
        message: '',
        timestamp: '',
        data: {
          id: 101,
          conversation_id: 1,
          client_echo_id: body.client_echo_id,
          src: 0,
          msg_type: 'text',
          content: body.text,
          sent_at: Date.now(),
        },
      });
    });
    await page.route(`${API}/sse*`, async (route) => {
      // AC2: 1 event new_message src=1 sau ~500ms (mô phỏng staff trả lời sau khi conversation mở).
      await new Promise((r) => setTimeout(r, 500));
      const payload = JSON.stringify({
        message: {
          id: 202,
          conversation_id: 1,
          src: 1,
          msg_type: 'text',
          content: 'Xin chào, tôi có thể giúp gì cho bạn?',
          sent_at: Date.now(),
        },
      });
      const body = `event: connected\ndata: {}\n\nevent: new_message\ndata: ${payload}\n\n`;
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
    });

    await page.goto(hostUrl({ siteKey: 'test-site', host: WIDGET_ORIGIN }));

    const widgetHost = page.locator('[data-cluvix-livechat]');
    await expect(widgetHost).toHaveCount(1);
    await widgetHost.locator('.lc-launcher').click();

    const frame = page.frameLocator('iframe.lc-frame');
    await expect(frame.locator('.lc-header-text h1')).toHaveText('Test Clinic');

    await frame.locator('#lc-name').fill('Nguyễn Văn A');
    await frame.locator('#lc-phone').fill('0912345678');
    await frame.locator('#lc-message').fill('Tôi cần hỗ trợ đặt lịch khám.');
    const submitBtn = frame.locator('.lc-primary-btn');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Tin nhắn mở đầu (ô "Tin nhắn" của pre-chat) được gửi tự động khi vào chat — status "Đã gửi".
    await expect(frame.locator('.lc-status', { hasText: 'Đã gửi' }).first()).toBeVisible();

    // Tin staff đến qua SSE mock — có avatar (nhóm tin không phải của visitor luôn kèm avatar).
    await expect(frame.locator('.lc-bubble', { hasText: 'Xin chào, tôi có thể giúp gì cho bạn?' })).toBeVisible();
    await expect(frame.locator('.lc-group-avatar').first()).toBeVisible();

    // Footer bắt buộc (story-07 AC6).
    const footerLink = frame.locator('.lc-footer a');
    await expect(footerLink).toHaveAttribute('href', 'https://cluvixhealth.vn');
    await expect(footerLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

test.describe('smoke — data-host không hợp lệ (AC3)', () => {
  test('không mount widget + console.error nhắc data-host', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(hostUrl({ siteKey: 'test-site', host: 'ftp://not-an-allowed-origin.example' }));

    await expect(page.locator('[data-cluvix-livechat]')).toHaveCount(0);
    await expect.poll(() => consoleErrors.some((e) => e.includes('data-host'))).toBe(true);
  });
});

test.describe('smoke — setUser identity + 403 offline (AC4)', () => {
  test('request /session mang identity; 403 → offline, không gọi /messages', async ({ page }) => {
    await mockCampaignsEmpty(page);
    let sessionBody: Record<string, unknown> | null = null;
    let messagesCalled = false;

    await page.route(`${API}/session`, (route) => {
      sessionBody = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, { success: false, code: 403, message: 'site disabled', data: null, timestamp: '' }, 403);
    });
    await page.route(`${API}/messages*`, (route) => {
      messagesCalled = true;
      return json(route, { success: true, code: 200, message: '', data: [], timestamp: '' });
    });

    const identifierHash = 'a'.repeat(64); // format-valid (64 hex) — nội dung không cần khớp chữ ký thật, BE bị mock
    await page.goto(hostUrl({ siteKey: 'test-site', host: WIDGET_ORIGIN }));

    const widgetHost = page.locator('[data-cluvix-livechat]');
    await expect(widgetHost).toHaveCount(1);

    await page.evaluate(
      ({ identifier, identifier_hash }) => {
        (window as unknown as { cluvixChat: { setUser: (u: unknown) => void } }).cluvixChat.setUser({
          identifier,
          identifier_hash,
        });
      },
      { identifier: 'partner-user-1', identifier_hash: identifierHash },
    );

    // setUser() một mình không handshake ngay (chỉ khi đã có session/lastError/đang mở) — mở bubble để kích
    // handshake thật (xem loader.ts open() → ensureSession()), giờ phải mang identity vừa set.
    await widgetHost.locator('.lc-launcher').click();

    await expect.poll(() => sessionBody).not.toBeNull();
    const identity = (sessionBody as unknown as { identity?: { identifier: string; identifier_hash: string } })
      ?.identity;
    expect(identity?.identifier).toBe('partner-user-1');
    expect(identity?.identifier_hash).toBe(identifierHash);

    const frame = page.frameLocator('iframe.lc-frame');
    // Text mặc định (session chưa từng thành công → theme vẫn DEFAULT_THEME.offline_text).
    await expect(frame.locator('.lc-off-text')).toHaveText('Hiện không có nhân viên trực tuyến, để lại tin nhắn nhé!');

    expect(messagesCalled).toBe(false);
  });
});
