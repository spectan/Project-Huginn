export type InitialAdminPasswordValidation =
  | {
      ok: true;
      value: string;
    }
  | {
      error: string;
      ok: false;
    };

export function validateInitialAdminPassword(password: unknown): InitialAdminPasswordValidation;

export const USER_CREATION_LOCK_KEY: number;

export type EnsureInitialAdminResult =
  | {
      ok: true;
      status: "created" | "existing";
      username: string;
    }
  | {
      error: string;
      ok: false;
    };

export function ensureInitialAdmin(
  // A PrismaClient (typed loosely so tests can pass an in-memory stand-in).
  prisma: unknown,
  input: {
    hashPassword: (password: string) => Promise<string>;
    password: unknown;
    username: string;
  }
): Promise<EnsureInitialAdminResult>;
