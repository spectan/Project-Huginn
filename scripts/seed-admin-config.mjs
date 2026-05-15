const PLACEHOLDER_ADMIN_PASSWORDS = new Set([
  "<admin-password>",
  "replace-before-use",
  "replace-with-a-secure-password"
]);

export function validateInitialAdminPassword(password) {
  if (typeof password !== "string" || password.length < 12) {
    return {
      error: "INITIAL_ADMIN_PASSWORD must be set to at least 12 characters",
      ok: false
    };
  }

  if (PLACEHOLDER_ADMIN_PASSWORDS.has(password.trim().toLowerCase())) {
    return {
      error: "INITIAL_ADMIN_PASSWORD must be changed from the example placeholder",
      ok: false
    };
  }

  return {
    ok: true,
    value: password
  };
}
