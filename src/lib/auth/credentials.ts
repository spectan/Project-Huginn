import { err, ok, type Result } from "@/lib/domain/result";

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

export type AuthCredentials = {
  password: string;
  username: string;
};

export function parseAuthCredentials(input: unknown): Result<AuthCredentials> {
  if (!isObject(input)) {
    return err("Credentials are required");
  }

  const username = typeof input.username === "string" ? input.username.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!USERNAME_PATTERN.test(username)) {
    return err(
      "Username must be 3-32 characters and contain only letters, numbers, underscores, or hyphens"
    );
  }

  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return err("Password must be 12-128 characters");
  }

  return ok({ password, username });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
