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
    const launcher = widgetHost.locator('.lc-launcher');
    // v1.3.1 mục 3 — pill launcher cao 56px (trước là 52px).
    expect(await launcher.evaluate((el) => getComputedStyle(el).height)).toBe('56px');
    await launcher.click();

    const frame = page.frameLocator('iframe.lc-frame');
    await expect(frame.locator('.lc-header-text h1')).toHaveText('Test Clinic');
    // v1.3.1 mục 2 — brand truncate vẫn đọc được đầy đủ qua title (tooltip).
    await expect(frame.locator('.lc-header-text h1')).toHaveAttribute('title', 'Test Clinic');

    await frame.locator('#lc-name').fill('Nguyễn Văn A');
    await frame.locator('#lc-phone').fill('0912345678');
    await frame.locator('#lc-message').fill('Tôi cần hỗ trợ đặt lịch khám.');
    const submitBtn = frame.locator('.lc-primary-btn');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Tin nhắn mở đầu (ô "Tin nhắn" của pre-chat) được gửi tự động khi vào chat. "Đã gửi" nằm ở dòng giờ
    // cuối nhóm (.lc-group-time) — .lc-status giờ CHỈ là nút thử lại khi gửi lỗi (v1.2.0).
    await expect(frame.locator('.lc-group-time', { hasText: 'Đã gửi' }).first()).toBeVisible();

    // Tin staff đến qua SSE mock — có avatar (nhóm tin không phải của visitor luôn kèm avatar).
    await expect(frame.locator('.lc-bubble', { hasText: 'Xin chào, tôi có thể giúp gì cho bạn?' })).toBeVisible();
    await expect(frame.locator('.lc-group-avatar').first()).toBeVisible();

    // Footer bắt buộc (story-07 AC6).
    const footerLink = frame.locator('.lc-footer a');
    await expect(footerLink).toHaveText('CluvixHealth');
    await expect(footerLink).toHaveAttribute('href', 'https://cluvixhealth.vn');
    await expect(footerLink).toHaveAttribute('rel', 'noopener noreferrer');
    // Khoảng trắng giữa "Cung cấp bởi" và link phải còn (footer KHÔNG dùng flex — v1.2.0 mục 1).
    await expect(frame.locator('.lc-footer')).toContainText('Cung cấp bởi CluvixHealth');
  });
});

// v1.2.0 mục 7: locale suy diễn theme.locale → <html lang> trang khách → navigator → 'vi'.
test.describe('i18n — <html lang="en"> trên trang khách (không có theme.locale)', () => {
  test('nhãn launcher + footer sang tiếng Anh', async ({ page }) => {
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
          // THEME cố ý KHÔNG có `locale` — locale phải suy ra từ <html lang="en"> của trang khách.
          config: { widget_theme: THEME, pre_chat_form: { ...PRE_CHAT_FORM, enabled: false } },
        },
      }),
    );
    await page.route(`${API}/messages*`, (route) =>
      json(route, { success: true, code: 200, message: '', data: [], timestamp: '' }),
    );
    await page.route(`${API}/sse*`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {}\n\n' }),
    );

    await page.goto(hostUrl({ siteKey: 'test-site', host: WIDGET_ORIGIN, lang: 'en' }));

    const widgetHost = page.locator('[data-cluvix-livechat]');
    const launcher = widgetHost.locator('.lc-launcher');
    await expect(launcher.locator('.lc-launcher-label')).toHaveText('Chat with us');
    await expect(launcher).toHaveAttribute('aria-label', 'Open chat: Chat with us');
    await expect(launcher).toHaveAttribute('aria-expanded', 'false');

    await launcher.click();
    await expect(launcher).toHaveAttribute('aria-expanded', 'true');

    const frame = page.frameLocator('iframe.lc-frame');
    await expect(frame.locator('.lc-footer')).toContainText('Powered by CluvixHealth');
  });
});

// v1.2.0 mục 7: pre_chat_form.phone_region='INTL' → chỉ nhận E.164 (số quốc tế phải hợp lệ).
test.describe('pre-chat — phone_region INTL', () => {
  test('số E.164 hợp lệ → nút gửi bật', async ({ page }) => {
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
          config: {
            widget_theme: THEME,
            pre_chat_form: { ...PRE_CHAT_FORM, require_name: false, require_message: false, phone_region: 'INTL' },
          },
        },
      }),
    );

    await page.goto(hostUrl({ siteKey: 'test-site', host: WIDGET_ORIGIN }));
    await page.locator('[data-cluvix-livechat] .lc-launcher').click();

    const frame = page.frameLocator('iframe.lc-frame');
    const submitBtn = frame.locator('.lc-primary-btn');
    await expect(submitBtn).toBeDisabled();
    // Số VN cũng là E.164 khi ở dạng +84… nhưng dạng nội địa "0912345678" KHÔNG hợp lệ ở INTL.
    await frame.locator('#lc-phone').fill('0912345678');
    await expect(submitBtn).toBeDisabled();
    await frame.locator('#lc-phone').fill('+14155552671');
    await expect(submitBtn).toBeEnabled();
  });
});

// v1.3.0 mục 1: widget_theme.color_scheme='dark' → app ép chế độ tối (không phụ thuộc OS của máy chạy test).
test.describe('theme — color_scheme dark', () => {
  test('data-lc-scheme="dark" trên <html> iframe + nền app KHÔNG phải trắng', async ({ page }) => {
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
          config: {
            widget_theme: { ...THEME, color_scheme: 'dark' },
            pre_chat_form: { ...PRE_CHAT_FORM, enabled: false },
          },
        },
      }),
    );
    await page.route(`${API}/messages*`, (route) =>
      json(route, { success: true, code: 200, message: '', data: [], timestamp: '' }),
    );
    await page.route(`${API}/sse*`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {}\n\n' }),
    );

    await page.goto(hostUrl({ siteKey: 'test-site', host: WIDGET_ORIGIN }));
    await page.locator('[data-cluvix-livechat] .lc-launcher').click();

    const frame = page.frameLocator('iframe.lc-frame');
    await expect(frame.locator('.lc-body')).toBeVisible(); // đã vào khung chat (theme đã áp)
    await expect(frame.locator('html')).toHaveAttribute('data-lc-scheme', 'dark');

    const bg = await frame.locator('.lc-app').evaluate((el) => getComputedStyle(el.ownerDocument.body).backgroundColor);
    expect(bg).not.toBe('rgb(255, 255, 255)');
    const bodyBg = await frame.locator('.lc-body').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bodyBg).toBe('rgb(13, 17, 23)'); // --lc-surface tối
  });
});

// v1.3.0 mục 2: lỗi pre-chat giữ chỗ sẵn (visibility) + a11y aria-invalid.
test.describe('pre-chat — thiếu tên khi submit', () => {
  test('.lc-err hiện (không đẩy layout) + input aria-invalid="true"', async ({ page }) => {
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

    await page.goto(hostUrl({ siteKey: 'test-site', host: WIDGET_ORIGIN }));
    await page.locator('[data-cluvix-livechat] .lc-launcher').click();

    const frame = page.frameLocator('iframe.lc-frame');
    const nameInput = frame.locator('#lc-name');
    const nameErr = frame.locator('#lc-name-err');
    await expect(nameInput).toBeVisible();
    // Trước khi lỗi: dòng lỗi ĐÃ chiếm chỗ (không display:none) nhưng chưa nhìn thấy → không gây CLS.
    await expect(nameErr).toBeHidden();
    expect(await nameErr.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(0);
    await expect(nameInput).toHaveAttribute('aria-invalid', 'false');
    await expect(nameInput).toHaveAttribute('aria-describedby', 'lc-name-err');

    // Đường 1 — blur: rời ô tên khi còn rỗng.
    await nameInput.click();
    await frame.locator('#lc-phone').click();

    await expect(nameErr).toBeVisible();
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    await expect(nameErr).toHaveAttribute('role', 'alert');

    // Đường 2 — SUBMIT thật: nút bị disabled khi thiếu tên, nhưng Enter ở ô tin nhắn vẫn chạy trySubmit()
    // (xem ui.ts) ⇒ phải đánh dấu lỗi đúng ô còn thiếu và KHÔNG submit.
    await frame.locator('#lc-phone').fill('0912345678');
    await frame.locator('#lc-message').fill('Tôi cần hỗ trợ.');
    await expect(frame.locator('#lc-phone')).toHaveAttribute('aria-invalid', 'false');
    await frame.locator('#lc-message').press('Enter');

    await expect(nameErr).toBeVisible();
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    // Vẫn ở màn pre-chat (không vào khung chat) vì submit bị chặn.
    await expect(frame.locator('.lc-prechat')).toBeVisible();
  });
});

// v1.3.0 mục 7: launcher_offset_x/y đổi vị trí nút mở chat (px, clamp 0..200).
test.describe('theme — launcher_offset_x/y', () => {
  test('right=40px, bottom=60px theo cấu hình', async ({ page }) => {
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
          config: {
            widget_theme: { ...THEME, launcher_offset_x: 40, launcher_offset_y: 60 },
            pre_chat_form: { ...PRE_CHAT_FORM, enabled: false },
          },
        },
      }),
    );
    await page.route(`${API}/messages*`, (route) =>
      json(route, { success: true, code: 200, message: '', data: [], timestamp: '' }),
    );
    await page.route(`${API}/sse*`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: connected\ndata: {}\n\n' }),
    );

    await page.goto(hostUrl({ siteKey: 'test-site', host: WIDGET_ORIGIN }));
    const launcher = page.locator('[data-cluvix-livechat] .lc-launcher');
    // Offset chỉ áp sau khi handshake trả theme (trước đó là default 20px) → mở chat rồi đóng lại.
    await launcher.click();
    await page.frameLocator('iframe.lc-frame').locator('.lc-body').waitFor();
    await page.frameLocator('iframe.lc-frame').locator('.lc-x').click();
    await expect(launcher).toBeVisible();

    await expect
      .poll(async () => launcher.evaluate((el) => getComputedStyle(el).right))
      .toBe('40px');
    expect(await launcher.evaluate((el) => getComputedStyle(el).bottom)).toBe('60px');
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

// M5(a)/(c) — site có pre-chat bật: visitor_token phải nằm ở sessionStorage (trang khách, nơi loader.ts
// chạy), KHÔNG rơi vào localStorage (máy dùng chung không đọc lại hội thoại y tế của người trước).
test.describe('M5 — visitor_token storage theo pre-chat', () => {
  test('pre-chat bật → token vào sessionStorage của trang khách, không vào localStorage', async ({ page }) => {
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
          config: { widget_theme: THEME, pre_chat_form: PRE_CHAT_FORM }, // enabled: true
        },
      }),
    );

    await page.goto(hostUrl({ siteKey: 'test-site', host: WIDGET_ORIGIN }));
    // open() gọi ensureSession() ngay — không cần submit form pre-chat để có visitor_token.
    await page.locator('[data-cluvix-livechat] .lc-launcher').click();

    await expect
      .poll(() => page.evaluate(() => window.sessionStorage.getItem('cluvix_lc_token_test-site')))
      .toBe('test-visitor-token');
    expect(await page.evaluate(() => window.localStorage.getItem('cluvix_lc_token_test-site'))).toBeNull();
  });
});

// story-18/M3 mục 3 — BE gửi event `expired` qua SSE trước khi tự đóng kết nối lúc JWT hết hạn: sse.ts
// phải xin re-handshake NGAY (không đợi 2 lỗi liên tiếp của onerror).
test.describe('SSE — event expired kích re-handshake ngay', () => {
  test('nhận `expired` qua SSE → có request /session thứ 2 (re-handshake)', async ({ page }) => {
    await mockCampaignsEmpty(page);
    let sessionCalls = 0;
    await page.route(`${API}/session`, (route) => {
      sessionCalls++;
      return json(route, {
        success: true,
        code: 200,
        message: '',
        timestamp: '',
        data: {
          visitor_jwt: `test-jwt-${sessionCalls}`,
          visitor_token: 'test-visitor-token',
          conversation_id: 1,
          config: { widget_theme: THEME, pre_chat_form: { ...PRE_CHAT_FORM, enabled: false } },
        },
      });
    });
    await page.route(`${API}/messages*`, (route) =>
      json(route, { success: true, code: 200, message: '', data: [], timestamp: '' }),
    );
    await page.route(`${API}/sse*`, (route) =>
      // 'connected' rồi 'expired' ngay trong cùng response (giả lập BE đóng kết nối ngay sau khi báo hết hạn).
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'event: connected\ndata: {}\n\nevent: expired\ndata: {}\n\n',
      }),
    );

    await page.goto(hostUrl({ siteKey: 'test-site', host: WIDGET_ORIGIN }));
    await page.locator('[data-cluvix-livechat] .lc-launcher').click();

    await expect.poll(() => sessionCalls).toBe(1);
    // SSE mock trả 'expired' ngay khi kết nối → sse.ts gọi onNeedRehandshake() → main.ts post('handshake')
    // → loader xoá session cũ, handshake lại → request /session thứ 2.
    await expect.poll(() => sessionCalls, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  });
});
