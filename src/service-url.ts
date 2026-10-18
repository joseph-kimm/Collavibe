export function serviceOrigin() {
  return (process.env.COLLAVIBE_PUBLIC_URL || (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://collavibe.vercel.app")).replace(/\/$/, "");
}
