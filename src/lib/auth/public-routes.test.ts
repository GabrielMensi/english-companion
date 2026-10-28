import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-routes";

describe("isPublicPath", () => {
  it("is open for the login pages, the auth API, the health check and static files", () => {
    for (const path of [
      "/login",
      "/signup",
      "/api/auth/sign-in/email",
      "/api/auth/get-session",
      "/api/health",
      "/_next/static/chunks/a.js",
      "/_next/webpack-hmr",
      "/_next/image",
      "/favicon.ico",
      "/next.svg",
    ]) {
      expect(isPublicPath(path), path).toBe(true);
    }
  });

  it("protects everything else, including lookalikes", () => {
    for (const path of [
      "/",
      "/dashboard",
      "/chat/abc",
      "/api/sessions",
      "/api/settings/keys",
      "/api/authx",
      "/api/auth",
      "/api/healthz",
      "/login/extra",
      "/api/tts/runtime/ort.wasm",
      "/data/companion.db",
      "/sub/logo.svg",
    ]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });
});
