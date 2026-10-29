import { createAuthClient } from "better-auth/react";

/** The browser side of the login: `signIn.email`, `signUp.email`, `signOut`. Same origin, so no base URL. */
export const authClient = createAuthClient();
