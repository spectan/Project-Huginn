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

export function createAdminUserDependencies(): AdminUserDependencies {
  return {
    hashPassword: async (password) => argon2.hash(password),
    listMaps: async () => prisma.map.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true
      },
      where: { isActive: true }
    }),
    listUsers: async () => prisma.user.findMany({
      orderBy: [
        { approvalStatus: "asc" },
        { username: "asc" }
      ],
      select: USER_SELECT,
      take: 100
    }),
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
    removeUser: async ({ userId }) => {
      const existingUser = await prisma.user.findUnique({
        select: USER_SELECT,
        where: { id: userId }
      });

      if (existingUser === null) {
        return null;
      }

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
    },
    updateUserPassword: async ({ passwordHash, userId }) => {
      const existingUser = await prisma.user.findUnique({
        select: { id: true },
        where: { id: userId }
      });

      if (existingUser === null) {
        return null;
      }

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
    },
    updateUserPrivileges: async ({ approvedByUserId, isAdmin, mapPermissions, userId }) => {
      const existingUser = await prisma.user.findUnique({
        select: { id: true },
        where: { id: userId }
      });

      if (existingUser === null) {
        return null;
      }

      return prisma.$transaction(async (transaction) => {
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

        return transaction.user.update({
          data: {
            accessLevel: "NONE",
            approvalStatus: "APPROVED",
            approvedAt: new Date(),
            approvedByUserId,
            isAdmin
          },
          select: USER_SELECT,
          where: { id: userId }
        });
      });
    }
  };
}
