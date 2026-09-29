import type { AuditAction, AuditTargetType, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type AuditRecordInput = {
  action: AuditAction;
  actorUserId: string | null;
  mapId?: string | null;
  metadata: Record<string, unknown>;
  targetId: string | null;
  targetType: AuditTargetType;
};

/** Builds a `recordAudit` dependency that writes an audit event, adding `clientIp` to the metadata when known. */
export function createAuditRecorder(clientIp?: string): (input: AuditRecordInput) => Promise<void> {
  return async (input) => {
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
  };
}
