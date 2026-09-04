// Truy cập localStorage/sessionStorage an toàn: private mode / storage bị chặn thì widget vẫn chạy được
// phiên hiện tại thay vì ném lỗi ra trang khách.

export const lsGet = (k: string): string | null => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};

export const lsSet = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* private mode: bỏ qua, widget vẫn chạy phiên hiện tại */
  }
};

export const lsRemove = (k: string) => {
  try {
    window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
};

export const ssGet = (k: string): string | null => {
  try {
    return window.sessionStorage.getItem(k);
  } catch {
    return null;
  }
};

export const ssSet = (k: string, v: string) => {
  try {
    window.sessionStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

export const ssRemove = (k: string) => {
  try {
    window.sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
};
