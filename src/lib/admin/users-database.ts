import argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AdminUserDependencies } from "./users";

const USER_SELECT = {
  accessLevel: true,
  approvedBy: {
    select: {
      username: true
    }
  },
  approvalStatus: true,
  createdAt: true,
  id: true,
  isAdmin: true,
  mapPermissions: {
    select: {
      accessLevel: true,
      isOperator: true,
      mapId: true
    }
  },
  username: true
} satisfies Prisma.UserSelect;

export function createAdminUserDependencies(clientIp?: string): AdminUserDependencies {
  return {
    deleteShareLinksOutsideMaps: async ({ keepMapIds, userId }) => {
      await prisma.shareLink.deleteMany({
        where: {
          createdByUserId: userId,
          mapId: { notIn: Array.from(keepMapIds) }
        }
      });
    },
    findUser: async (userId) => prisma.user.findUnique({
      select: USER_SELECT,
      where: { id: userId }
    }),
    hashPassword: async (password) => argon2.hash(password),
    listMaps: async () => prisma.map.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true
      },
      where: { isActive: true }
    }),
    // Unbounded on purpose: the accounts page lists every account of a small
    // community, and a silent cap would hide accounts past the limit.
    listUsers: async () => prisma.user.findMany({
      orderBy: [
        { approvalStatus: "asc" },
        { username: "asc" }
      ],
      select: USER_SELECT
    }),
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
    removeUser: async ({ userId }) => nullIfRecordNotFound(async () => {
      const [, deletedUser] = await prisma.$transaction([
        prisma.session.deleteMany({
          where: { userId }
        }),
        prisma.user.delete({
          select: USER_SELECT,
          where: { id: userId }
        })
      ]);

      return deletedUser;
    }),
    updateUserPassword: async ({ passwordHash, userId }) => nullIfRecordNotFound(async () => {
      const [, updatedUser] = await prisma.$transaction([
        prisma.session.deleteMany({
          where: { userId }
        }),
        prisma.user.update({
          data: { passwordHash },
          select: USER_SELECT,
          where: { id: userId }
        })
      ]);

      return updatedUser;
    }),
    updateUserPrivileges: async ({ approvedByUserId, isAdmin, mapPermissions, userId }) => nullIfRecordNotFound(async () => (
      prisma.$transaction(async (transaction) => {
        // Update the user row first so a concurrently deleted user fails with
        // P2025 before any permission rows are touched.
        await transaction.user.update({
          data: {
            accessLevel: "NONE",
            isAdmin,
            ...(approvedByUserId === null
              ? {}
              : {
                  approvalStatus: "APPROVED" as const,
                  approvedAt: new Date(),
                  approvedByUserId
                })
          },
          select: { id: true },
          where: { id: userId }
        });

        await transaction.userMapPermission.deleteMany({
          where: {
            userId,
            mapId: {
              notIn: mapPermissions.map((permission) => permission.mapId)
            }
          }
        });

        for (const permission of mapPermissions) {
          await transaction.userMapPermission.upsert({
            create: {
              accessLevel: permission.accessLevel,
              isOperator: permission.isOperator,
              mapId: permission.mapId,
              userId
            },
            update: {
              accessLevel: permission.accessLevel,
              isOperator: permission.isOperator
            },
            where: {
              userId_mapId: {
                mapId: permission.mapId,
                userId
              }
            }
          });
        }

        return transaction.user.findUniqueOrThrow({
          select: USER_SELECT,
          where: { id: userId }
        });
      })
    ))
  };
}

async function nullIfRecordNotFound<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

function isRecordNotFoundError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2025";
}
