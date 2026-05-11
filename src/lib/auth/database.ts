import argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSessionExpiry, createSessionToken, hashSessionToken } from "./session";
import type { AuthServiceDependencies } from "./auth-service";

export function createAuthDependencies(): AuthServiceDependencies {
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
      return prisma.user.create({
        data: {
          passwordHash,
          username
        }
      });
    },
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
      await prisma.auditEvent.create({
        data: {
          action: input.action,
          actorUserId: input.actorUserId,
          metadata: input.metadata as Prisma.InputJsonValue,
          targetId: input.targetId,
          targetType: input.targetType
        }
      });
    },
    updateUserApproval: async ({ accessLevel, approvedByUserId, userId }) => {
      const existingUser = await prisma.user.findUnique({
        where: {
          id: userId
        }
      });

      if (existingUser === null) {
        return null;
      }

      return prisma.user.update({
        data: {
          accessLevel,
          approvalStatus: "APPROVED",
          approvedAt: new Date(),
          approvedByUserId
        },
        where: {
          id: userId
        }
      });
    },
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
