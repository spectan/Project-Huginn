import argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import { createAuditRecorder } from "@/lib/db/audit-recorder";
import { prisma } from "@/lib/db/prisma";
import { hasPrismaErrorCode } from "@/lib/db/prisma-errors";
import { ok } from "@/lib/domain/result";
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
    recordAudit: createAuditRecorder(clientIp),
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
    updateUserPrivileges: async ({ approvedByUserId, plan, userId }) => nullIfRecordNotFound(async () => (
      prisma.$transaction(async (transaction) => {
        // Row lock: concurrent privilege edits of the same user serialize here,
        // so each one merges onto the permissions the previous one wrote.
        const locked = await transaction.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE
        `;

        if (locked.length === 0) {
          return null;
        }

        const existingUser = await transaction.user.findUniqueOrThrow({
          select: USER_SELECT,
          where: { id: userId }
        });
        const change = plan(existingUser);

        if (!change.ok) {
          return change;
        }

        const { count: approvedCount } = await transaction.user.updateMany({
          data: {
            approvalStatus: "APPROVED",
            approvedAt: new Date(),
            approvedByUserId
          },
          where: {
            approvalStatus: { not: "APPROVED" },
            id: userId
          }
        });

        await transaction.user.update({
          data: {
            accessLevel: "NONE",
            isAdmin: change.value.isAdmin
          },
          select: { id: true },
          where: { id: userId }
        });

        await transaction.userMapPermission.deleteMany({
          where: {
            userId,
            mapId: {
              notIn: change.value.mapPermissions.map((permission) => permission.mapId)
            }
          }
        });

        for (const permission of change.value.mapPermissions) {
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

        const user = await transaction.user.findUniqueOrThrow({
          select: USER_SELECT,
          where: { id: userId }
        });

        return ok({ approved: approvedCount > 0, user });
      })
    ))
  };
}

async function nullIfRecordNotFound<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2025")) {
      return null;
    }

    throw error;
  }
}
