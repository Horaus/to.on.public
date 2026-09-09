export function formatLabel(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
export function statusLabel(status: string) {
  if (status === "waiting_manual_action") return "ACTION NEEDED";
  if (status === "waiting_login") return "SIGN IN NEEDED";
  return status.replaceAll("_", " ").toUpperCase();
}
