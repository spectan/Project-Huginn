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

// Advisory lock key that serializes user creation (username uniqueness and
// watermark number allocation). Keep in sync with USER_CREATION_LOCK_KEY in
// src/lib/auth/database.ts.
export const USER_CREATION_LOCK_KEY = 7_140_231;

/**
 * Ensure the initial admin account exists, under the same lock registration
 * uses. The username is matched case-insensitively (as login does).
 *
 * - Existing approved admin: left unchanged (only a missing watermark number
 *   is backfilled); no password is needed.
 * - Existing account that is not an approved admin: error; the seed never
 *   promotes or resets an account it did not create.
 * - Otherwise the admin is created with the validated password.
 */
export async function ensureInitialAdmin(prisma, { hashPassword, password, username }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${USER_CREATION_LOCK_KEY})`;

    const existing = await tx.user.findFirst({
      select: { approvalStatus: true, id: true, isAdmin: true, username: true, watermarkNumber: true },
      where: { username: { equals: username, mode: "insensitive" } }
    });

    if (existing !== null) {
      if (!existing.isAdmin || existing.approvalStatus !== "APPROVED") {
        return {
          error: `User "${existing.username}" already exists but is not an approved admin. ` +
            "The seed will not promote it; choose a different INITIAL_ADMIN_USERNAME or fix the account.",
          ok: false
        };
      }

      if (existing.watermarkNumber === null) {
        await tx.user.update({
          data: { watermarkNumber: await nextWatermarkNumber(tx) },
          where: { id: existing.id }
        });
      }

      return { ok: true, status: "existing", username: existing.username };
    }

    const validated = validateInitialAdminPassword(password);

    if (!validated.ok) {
      return validated;
    }

    await tx.user.create({
      data: {
        accessLevel: "WRITE",
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        isAdmin: true,
        passwordHash: await hashPassword(validated.value),
        username,
        watermarkNumber: await nextWatermarkNumber(tx)
      }
    });

    return { ok: true, status: "created", username };
  }, { timeout: 30_000 });
}

async function nextWatermarkNumber(tx) {
  // _max ignores NULLs, unlike ordering by watermarkNumber desc.
  const { _max: max } = await tx.user.aggregate({ _max: { watermarkNumber: true } });
  return (max.watermarkNumber ?? 0) + 1;
}
