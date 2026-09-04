// Kiểu dùng chung giữa facade `WidgetUI` và các view con (prechat/chat-list/composer/preview).
// UiCallbacks/CampaignPreviewCallbacks là HỢP ĐỒNG với main.ts — re-export nguyên vẹn từ `../ui`.

export interface UiCallbacks {
  onSend: (text: string) => void;
  onTyping: () => void;
  onClose: () => void;
  onSubmitPreChat: (name: string, phone: string, message: string) => void;
  onRetry: (echoId: string, text: string) => void;
}

export interface CampaignPreviewCallbacks {
  onClick: () => void;
  onDismiss: () => void;
}

export interface RenderMsg {
  id?: number;
  echoId?: string;
  src: number;
  content: string;
  sentAt: number;
  status: 'sent' | 'sending' | 'failed';
}
