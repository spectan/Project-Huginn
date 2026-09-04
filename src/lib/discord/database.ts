import { prisma } from "@/lib/db/prisma";
import type { DiscordServiceDependencies } from "./discord-service";

const SINGLETON_ID = "default";

export function createDiscordDependencies(): DiscordServiceDependencies {
  return {
    findConfig: async () => prisma.discordConfig.findFirst({
      where: {
        id: SINGLETON_ID
      }
    }),
    saveConfig: async (config) => prisma.discordConfig.upsert({
      create: {
        id: SINGLETON_ID,
        ...config
      },
      update: config,
      where: {
        id: SINGLETON_ID
      }
    })
  };
}
