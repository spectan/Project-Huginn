import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { validateInitialAdminPassword } from "./seed-admin-config.mjs";

const prisma = new PrismaClient();

const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
const password = validateInitialAdminPassword(process.env.INITIAL_ADMIN_PASSWORD);

if (!password.ok) {
  console.error(password.error);
  process.exit(1);
}

const passwordHash = await argon2.hash(password.value);

const servers = [
  {
    heightPx: 2048,
    layers: [
      { imagePath: "/maps/celebration-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/celebration-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Celebration",
    widthPx: 2048
  },
  {
    heightPx: 4096,
    layers: [
      { imagePath: "/maps/chaos-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/chaos-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Chaos",
    widthPx: 4096
  },
  {
    heightPx: 2048,
    layers: [
      { imagePath: "/maps/deliverance-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/deliverance-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Deliverance",
    widthPx: 2048
  },
  {
    heightPx: 2048,
    layers: [
      { imagePath: "/maps/exodus-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/exodus-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Exodus",
    widthPx: 2048
  },
  {
    heightPx: 4096,
    layers: [
      { imagePath: "/maps/independence-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/independence-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Independence",
    widthPx: 4096
  },
  {
    heightPx: 2048,
    layers: [
      { imagePath: "/maps/pristine-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/pristine-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Pristine",
    widthPx: 2048
  },
  {
    heightPx: 2048,
    layers: [
      { imagePath: "/maps/release-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/release-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Release",
    widthPx: 2048
  },
  {
    heightPx: 8192,
    layers: [
      { imagePath: "/maps/xanadu-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/xanadu-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Xanadu",
    widthPx: 8192
  },
  {
    heightPx: 4096,
    layers: [
      { imagePath: "/maps/cadence-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/cadence-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Cadence",
    widthPx: 4096
  },
  {
    heightPx: 4096,
    layers: [
      { imagePath: "/maps/defiance-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/defiance-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Defiance",
    widthPx: 4096
  },
  {
    heightPx: 4096,
    layers: [
      { imagePath: "/maps/harmony-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/harmony-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Harmony",
    widthPx: 4096
  },
  {
    heightPx: 2048,
    layers: [
      { imagePath: "/maps/melody-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/melody-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Melody",
    widthPx: 2048
  },
  {
    heightPx: 2048,
    layers: [
      { imagePath: "/maps/affliction-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/affliction-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Affliction",
    widthPx: 2048
  },
  {
    heightPx: 2048,
    layers: [
      { imagePath: "/maps/desertion-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/desertion-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Desertion",
    widthPx: 2048
  },
  {
    heightPx: 2048,
    layers: [
      { imagePath: "/maps/elevation-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/elevation-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Elevation",
    widthPx: 2048
  },
  {
    heightPx: 2048,
    layers: [
      { imagePath: "/maps/serenity-terrain.png", isDefault: true, name: "Terrain", sortOrder: 0 },
      { imagePath: "/maps/serenity-topo.png", isDefault: false, name: "Topographical", sortOrder: 1 }
    ],
    name: "Serenity",
    widthPx: 2048
  }
];

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

for (const server of servers) {
  const existingMap = await prisma.map.findFirst({
    where: {
      OR: [
        { name: server.name },
        ...(server.name === "Celebration" ? [{ name: "Wurm Online Map" }] : [])
      ]
    }
  });

  const map = existingMap === null
    ? await prisma.map.create({
      data: {
        heightPx: server.heightPx,
        imagePath: server.layers[0].imagePath,
        isActive: true,
        name: server.name,
        widthPx: server.widthPx
      }
    })
    : await prisma.map.update({
      data: {
        heightPx: server.heightPx,
        imagePath: server.layers[0].imagePath,
        isActive: true,
        name: server.name,
        widthPx: server.widthPx
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

  for (const layer of server.layers) {
    await prisma.mapLayer.upsert({
      create: {
        heightPx: server.heightPx,
        imagePath: layer.imagePath,
        isDefault: layer.isDefault,
        mapId: map.id,
        name: layer.name,
        sortOrder: layer.sortOrder,
        widthPx: server.widthPx
      },
      update: {
        heightPx: server.heightPx,
        imagePath: layer.imagePath,
        isDefault: layer.isDefault,
        sortOrder: layer.sortOrder,
        widthPx: server.widthPx
      },
      where: {
        mapId_name: {
          mapId: map.id,
          name: layer.name
        }
      }
    });
  }
}

await prisma.$disconnect();
console.log(`Admin user ready: ${username}`);
console.log(`Server maps ready: ${servers.map((server) => server.name).join(", ")}`);
