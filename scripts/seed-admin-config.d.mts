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
