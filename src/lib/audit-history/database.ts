import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuditHistoryDependencies } from "./audit-history";

export function createAuditHistoryDependencies(clientIp?: string): AuditHistoryDependencies {
  return {
    listEvents: async ({ before, limit }) => {
      return prisma.auditEvent.findMany({
        include: {
          actor: {
            select: {
              username: true
            }
          },
          map: {
            select: {
              name: true
            }
          }
        },
        orderBy: [
          {
            createdAt: "desc"
          },
          {
            id: "desc"
          }
        ],
        take: limit,
        where: before === null
          ? undefined
          : {
              OR: [
                {
                  createdAt: {
                    lt: before.createdAt
                  }
                },
                {
                  createdAt: before.createdAt,
                  id: {
                    lt: before.id
                  }
                }
              ]
            }
      });
    },
    recordAudit: async (input) => {
      const metadata = clientIp !== undefined && clientIp.length > 0
        ? { ...input.metadata, clientIp }
        : input.metadata;
      await prisma.auditEvent.create({
        data: {
          action: input.action,
          actorUserId: input.actorUserId,
          mapId: input.mapId,
          metadata: metadata as Prisma.InputJsonValue,
          targetId: input.targetId,
          targetType: input.targetType
        }
      });
    }
  };
}
