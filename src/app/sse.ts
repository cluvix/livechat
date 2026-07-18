// SSE manager (story-18 events). Reconnect backoff 2s→30s; khi downtime > 3s thì refetch history (bù tin
// lỡ trong lúc mất kết nối — AC4). JWT hết hạn không đọc được status qua EventSource → nếu lỗi LIÊN TIẾP
// trước khi kịp 'connected' → yêu cầu re-handshake (main xin loader cấp JWT mới; backoff sau đó tự dùng
// JWT mới vì sseUrl() đọc state.jwt tại thời điểm connect).
import { sseUrl } from './api';
import type { WidgetMessage } from '../shared/types';

const BACKOFF_MIN = 2000;
const BACKOFF_MAX = 30000;
const DOWNTIME_REFETCH_MS = 3000;
const FAILS_BEFORE_REHANDSHAKE = 2;

export interface SseHooks {
  onStaffMessage: (m: WidgetMessage) => void;
  onStaffTyping: () => void;
  onDowntimeRecovered: () => void; // downtime > 3s → refetch history
  onNeedRehandshake: () => void; // nghi JWT hết hạn → xin loader cấp lại
}

export class SseManager {
  private es: EventSource | null = null;
  private backoff = BACKOFF_MIN;
  private timer: number | null = null;
  private stopped = false;
  private connectedOnce = false; // đã 'connected' trên connection hiện tại?
  private failsBeforeConnect = 0;
  private lastDisconnectAt = 0;

  constructor(private hooks: SseHooks) {}

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.close();
  }

  /** Gọi khi vừa có JWT mới → reconnect ngay (không đợi hết backoff). */
  reconnectNow() {
    if (this.stopped) return;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.close();
    this.backoff = BACKOFF_MIN;
    this.connect();
  }

  private close() {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  private connect() {
    if (this.stopped) return;
    this.connectedOnce = false;
    const es = new EventSource(sseUrl());
    this.es = es;

    es.addEventListener('connected', () => {
      this.connectedOnce = true;
      this.failsBeforeConnect = 0;
      this.backoff = BACKOFF_MIN;
      if (this.lastDisconnectAt && Date.now() - this.lastDisconnectAt > DOWNTIME_REFETCH_MS) {
        this.hooks.onDowntimeRecovered();
      }
      this.lastDisconnectAt = 0;
    });

    es.addEventListener('new_message', (ev) => {
      const m = this.parseMessage((ev as MessageEvent).data);
      if (m) this.hooks.onStaffMessage(m);
    });

    es.addEventListener('staff_typing', () => this.hooks.onStaffTyping());

    es.onerror = () => {
      // EventSource tự retry nội bộ nhưng KHÔNG đổi được URL/JWT → tự quản lý: đóng + backoff thủ công.
      if (!this.connectedOnce) {
        this.failsBeforeConnect++;
        if (this.failsBeforeConnect >= FAILS_BEFORE_REHANDSHAKE) {
          this.failsBeforeConnect = 0;
          this.hooks.onNeedRehandshake(); // nghi JWT hỏng → xin cấp lại; backoff tiếp theo dùng JWT mới
        }
      } else if (this.lastDisconnectAt === 0) {
        this.lastDisconnectAt = Date.now();
      }
      this.close();
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.stopped || this.timer !== null) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }

  private parseMessage(raw: string): WidgetMessage | null {
    try {
      const data = JSON.parse(raw) as { message?: WidgetMessage };
      return data.message ?? null;
    } catch {
      return null;
    }
  }
}
