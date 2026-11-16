import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudUpdateProfile, cloudUserForSession } from "../src/supabase.js";

const { updateUserById, getUser } = vi.hoisted(() => ({ updateUserById: vi.fn(), getUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { admin: { updateUserById }, getUser } }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function configure() {
  vi.stubEnv("SUPABASE_URL", "https://supabase.example");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service");
}
describe("cloud profile changes", () => {
  it("changes only name metadata on the authenticated ID and reads the new name with the existing session", async () => {
    configure();
    const user = { id: "authenticated-user", email: "same@example.com", created_at: "2026-11-16", user_metadata: { name: "Shani", preserved: true } };
    updateUserById.mockResolvedValue({ data: { user }, error: null });
    getUser.mockResolvedValue({ data: { user }, error: null });
    expect(await cloudUpdateProfile(user.id, { name: " Shani " })).toEqual({ id: user.id, email: user.email, createdAt: user.created_at, name: "Shani" });
    expect(updateUserById).toHaveBeenCalledExactlyOnceWith(user.id, { user_metadata: { name: "Shani" } });
    const session = { accessToken: "existing-access", refreshToken: "existing-refresh" };
    expect((await cloudUserForSession(session))?.user.name).toBe("Shani");
    expect(getUser).toHaveBeenCalledWith(session.accessToken);
  });
  it("rejects invalid input before calling Supabase and reports failed writes", async () => {
    configure();
    await expect(cloudUpdateProfile("authenticated-user", { name: " " })).rejects.toThrow();
    expect(updateUserById).not.toHaveBeenCalled();
    updateUserById.mockResolvedValue({ data: { user: null }, error: { message: "Profile write failed" } });
    await expect(cloudUpdateProfile("authenticated-user", { name: "Shani" })).rejects.toThrow("Profile write failed");
  });
});
