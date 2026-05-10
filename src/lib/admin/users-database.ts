import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AdminUserDependencies } from "./users";

const USER_SELECT = {
  accessLevel: true,
  approvalStatus: true,
  createdAt: true,
  id: true,
  isAdmin: true,
  username: true
} satisfies Prisma.UserSelect;

export function createAdminUserDependencies(): AdminUserDependencies {
  return {
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
          data: {
            accessLevel: "NONE",
            approvalStatus: "REJECTED",
            approvedAt: null,
            approvedByUserId: null,
            isAdmin: false
          },
          select: USER_SELECT,
          where: { id: userId }
        })
      ]);

      return updatedUser;
    },
    updateUserPrivileges: async ({ accessLevel, approvedByUserId, isAdmin, userId }) => {
      const existingUser = await prisma.user.findUnique({
        select: { id: true },
        where: { id: userId }
      });

      if (existingUser === null) {
        return null;
      }

      return prisma.user.update({
        data: {
          accessLevel,
          approvalStatus: "APPROVED",
          approvedAt: new Date(),
          approvedByUserId,
          isAdmin
        },
        select: USER_SELECT,
        where: { id: userId }
      });
    }
  };
}
