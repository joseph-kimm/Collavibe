export function safeReturnTo(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "";
  try {
    const url = new URL(value, "https://collavibe.invalid");
    if (url.origin !== "https://collavibe.invalid") return "";
    if (/^\/p\/portfolio_[0-9a-f-]{36}$/.test(url.pathname)) return url.pathname;
    if (url.pathname === "/course" || url.pathname === "/course/") return "/course";
  } catch { /* Ignore invalid or external destinations. */ }
  return "";
}
