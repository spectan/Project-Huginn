import argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSessionExpiry, createSessionToken, hashSessionToken } from "./session";
import type { AuthServiceDependencies } from "./auth-service";
import { createFailureRateLimiter } from "./failure-rate-limiter";

// Serializes user creation so the case-insensitive username check and the
// watermark number allocation cannot race. Arbitrary fixed key.
const USER_CREATION_LOCK_KEY = 7_140_231;

// Shared across requests so attempts accumulate per process.
const failureRateLimiter = createFailureRateLimiter();
const registrationRateLimiter = createFailureRateLimiter({
  maxAttempts: 5,
  windowMs: 60 * 60 * 1000
});

export function createAuthDependencies(clientIp?: string): AuthServiceDependencies {
  return {
    createSession: async (userId) => {
      const token = createSessionToken();
      const expiresAt = getSessionExpiry();

      const session = await prisma.session.create({
        data: {
          expiresAt,
          tokenHash: hashSessionToken(token),
          userId
        }
      });

      return { expiresAt, id: session.id, token };
    },
    createUser: async ({ passwordHash, username }) => {
      try {
        return await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${USER_CREATION_LOCK_KEY})`;

          const existingUser = await tx.user.findFirst({
            select: { id: true },
            where: { username: { equals: username, mode: "insensitive" } }
          });

          if (existingUser !== null) {
            return null;
          }

          // _max ignores NULLs, unlike ordering by watermarkNumber desc.
          const { _max: max } = await tx.user.aggregate({ _max: { watermarkNumber: true } });

          return tx.user.create({
            data: {
              passwordHash,
              username,
              watermarkNumber: (max.watermarkNumber ?? 0) + 1
            }
          });
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return null;
        }

        throw error;
      }
    },
    failureRateLimiter,
    findUserById: async (userId) => {
      return prisma.user.findUnique({
        where: {
          id: userId
        }
      });
    },
    findUserByUsername: async (username) => {
      return prisma.user.findFirst({
        where: {
          username: {
            equals: username,
            mode: "insensitive"
          }
        }
      });
    },
    hashPassword: async (password) => argon2.hash(password),
    recordAudit: async (input) => {
      const metadata = clientIp !== undefined && clientIp.length > 0
        ? { ...input.metadata, clientIp }
        : input.metadata;
      await prisma.auditEvent.create({
        data: {
          action: input.action,
          actorUserId: input.actorUserId,
          metadata: metadata as Prisma.InputJsonValue,
          targetId: input.targetId,
          targetType: input.targetType
        }
      });
    },
    registrationRateLimiter,
    updateUserPassword: async ({ currentSessionTokenHash, passwordHash, userId }) => {
      return prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: {
            id: userId
          }
        });

        if (existingUser === null) {
          return null;
        }

        await tx.session.deleteMany({
          where: {
            ...(currentSessionTokenHash === null ? {} : { tokenHash: { not: currentSessionTokenHash } }),
            userId
          }
        });

        return tx.user.update({
          data: {
            passwordHash
          },
          where: {
            id: userId
          }
        });
      });
    },
    verifyPassword: async (hash, password) => argon2.verify(hash, password)
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002";
}
