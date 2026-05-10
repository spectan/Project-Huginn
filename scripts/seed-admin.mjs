import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
const password = process.env.INITIAL_ADMIN_PASSWORD;

if (password === undefined || password.length < 12) {
  console.error("INITIAL_ADMIN_PASSWORD must be set to at least 12 characters");
  process.exit(1);
}

const passwordHash = await argon2.hash(password);

await prisma.user.upsert({
  create: {
    accessLevel: "WRITE",
    approvalStatus: "APPROVED",
    approvedAt: new Date(),
    isAdmin: true,
    passwordHash,
    username
  },
  update: {
    accessLevel: "WRITE",
    approvalStatus: "APPROVED",
    approvedAt: new Date(),
    isAdmin: true,
    passwordHash
  },
  where: {
    username
  }
});

const existingMap = await prisma.map.findFirst({
  where: {
    name: "Wurm Online Map"
  }
});

const map = existingMap === null
  ? await prisma.map.create({
    data: {
      heightPx: 2048,
      imagePath: "/maps/wurm-map.png",
      isActive: true,
      name: "Wurm Online Map",
      widthPx: 2048
    }
  })
  : await prisma.map.update({
    data: {
      heightPx: 2048,
      imagePath: "/maps/wurm-map.png",
      isActive: true,
      widthPx: 2048
    },
    where: {
      id: existingMap.id
    }
  });

await prisma.noteCategory.upsert({
  create: {
    mapId: map.id,
    name: "General"
  },
  update: {},
  where: {
    mapId_name: {
      mapId: map.id,
      name: "General"
    }
  }
});

await prisma.$disconnect();
console.log(`Admin user ready: ${username}`);
console.log("Initial map ready: Wurm Online Map");
