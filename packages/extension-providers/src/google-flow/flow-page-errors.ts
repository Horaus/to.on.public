/** Pure classification of provider-page failures; DOM orchestration remains in content.ts. */
export function flowCrashMessage(value: string): string | null {
  return /Application error:\s*a client-side exception has occurred/i.test(value)
    ? "Google Flow crashed with a client-side exception. Reload the Flow project tab, then retry the job."
    : null;
}

export function flowChromeErrorMessage(value: string): string | null {
  return /Aw,\s*Snap|This page isn'?t working|chrome-error:\/\/|ERR_[A-Z_]+/i.test(value)
    ? "Google Flow browser tab is in a Chrome error state. Reload the Flow project tab, then retry the job."
    : null;
}

export function flowAuthMessage(value: string, href: string): string | null {
  return /accounts\.google\.com|ServiceLogin|Đăng nhập|Sign in/i.test(value) && !/labs\.google\/fx\/vi\/tools\/flow\/project/i.test(href)
    ? "Google Flow needs sign-in before automation can continue."
    : null;
}

export function flowSubmitRejectionMessage(value: string): string | null {
  return /bạn phải cung cấp câu lệnh|you must provide (?:a )?prompt|prompt (?:is )?required|enter a prompt|nhập câu lệnh/i.test(value)
    ? "Google Flow rejected the submit because the prompt/source was not present after the click. Retry after clearing the composer; the app will not count this as a completed video."
    : null;
}
