import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const ROLE_DEFAULTS: Record<string, string[]> = {
  Admin: ["*"],
  Manager: [
    "workspace:admin",
    "tasks:assign",
    "tasks:review",
    "reports:view",
    "clients:manage",
  ],
  Employee: [],
};

async function main() {
  console.log("Seeding Auxa (clean — no sample data)…");

  // Wipe everything so re-seeding gives a clean slate for manual testing.
  await db.$transaction([
    db.invoiceItem.deleteMany(),
    db.invoice.deleteMany(),
    db.expense.deleteMany(),
    db.service.deleteMany(),
    db.taskActivity.deleteMany(),
    db.taskComment.deleteMany(),
    db.timeEntry.deleteMany(),
    db.pointsLedger.deleteMany(),
    db.rewardRedemption.deleteMany(),
    db.notification.deleteMany(),
    db.documentShare.deleteMany(),
    db.document.deleteMany(),
    db.avatarState.deleteMany(),
    db.timetableLog.deleteMany(),
    db.timetableSlot.deleteMany(),
    db.shoot.deleteMany(),
    db.creativeItem.deleteMany(),
    db.creativeSpace.deleteMany(),
    db.leadOtp.deleteMany(),
    db.outreachTarget.deleteMany(),
    db.approvalRequest.deleteMany(),
    db.announcementAck.deleteMany(),
    db.announcement.deleteMany(),
    db.videoJob.deleteMany(),
    db.clientRequest.deleteMany(),
    db.taskCollaborator.deleteMany(),
    db.project.deleteMany(),
    db.dayReport.deleteMany(),
    db.shift.deleteMany(),
    db.outreachLog.deleteMany(),
    db.task.deleteMany(),
    db.client.deleteMany(),
    db.whatsAppMessage.deleteMany(),
    db.dailyJournal.deleteMany(),
    db.aiCheckin.deleteMany(),
    db.reward.deleteMany(),
    db.room.deleteMany(),
    db.setting.deleteMany(),
    db.user.deleteMany(),
    db.role.deleteMany(),
  ]);

  // Roles
  const roles: Record<string, string> = {};
  for (const [name, perms] of Object.entries(ROLE_DEFAULTS)) {
    const r = await db.role.create({
      data: {
        name,
        description:
          name === "Admin"
            ? "Owner — full access to everything."
            : name === "Manager"
              ? "Assigns work, reviews, sees reports & workload."
              : "Standard team member.",
        isSystem: true,
        permissions: JSON.stringify(perms),
      },
    });
    roles[name] = r.id;
  }

  // The campus. Positions are semantic (the layout binds zones by key); the
  // grid coordinates only matter for legacy fallback ordering.
  const roomDefs = [
    { key: "developer", name: "Developer City", department: "Engineering", posX: 0, posY: 0 },
    { key: "video-editing", name: "Video Editing Bay", department: "Media", posX: 1, posY: 0 },
    { key: "common-board", name: "Conference Hall", department: "All-hands", posX: 2, posY: 0 },
    { key: "creative", name: "Creative Studio", department: "Design & Marketing", posX: 0, posY: 1 },
    { key: "tasks", name: "Task Room", department: "Everyone", posX: 1, posY: 1 },
    { key: "managing-heads", name: "Managing Heads", department: "Leadership", posX: 2, posY: 1 },
    { key: "timetable", name: "Timetable Room", department: "Everyone", posX: 0, posY: 2 },
    { key: "outreach", name: "Outreach Room", department: "Client Success", posX: 1, posY: 2 },
    { key: "shoot", name: "Shoot Room", department: "Media", posX: 2, posY: 2 },
  ];
  const rooms: Record<string, string> = {};
  for (const r of roomDefs) {
    const created = await db.room.create({
      data: { ...r, kind: "department" },
    });
    rooms[r.key] = created.id;
  }

  // The internal-tools bungalow in the developer city.
  const tools = [
    { name: "Sync AI", toolDesc: "The agency's AI copilot — check-ins, planning, routing." },
    { name: "Prompt Library", toolDesc: "Battle-tested prompts for every craft, versioned." },
    { name: "Portfolio Website", toolDesc: "The public face — case studies and reels." },
    { name: "Niche Research Documents", toolDesc: "Sector playbooks and research packs." },
  ];
  for (const [i, tool] of tools.entries()) {
    await db.project.create({
      data: { name: tool.name, toolDesc: tool.toolDesc, buildingKey: "tools", floor: i + 1 },
    });
  }

  // A single owner account to log in with. Everything else is created in-app.
  const passwordHash = await bcrypt.hash("auxa1234", 10);
  await db.user.create({
    data: {
      email: "admin@auxa.app",
      name: "Admin",
      passwordHash,
      title: "Owner",
      department: "Leadership",
      roleId: roles.Admin,
      avatar: {
        create: { roomId: rooms["common-board"], x: 550, y: 400, status: "online" },
      },
    },
  });

  // Organisation / branding / bank / integrations config (used on invoices etc.)
  await db.setting.createMany({
    data: [
      {
        key: "org",
        value: JSON.stringify({
          name: "Auxa Technology",
          gstin: "06ABCDE1234F1Z5",
          phone: "9123456781",
          email: "accounts@auxa.com",
          address: "Plot 14, Cyber Hub, Gurugram, Haryana 122002",
        }),
      },
      {
        key: "branding",
        value: JSON.stringify({ logoUrl: "", primaryColor: "#6184d6" }),
      },
      {
        key: "bank",
        value: JSON.stringify({
          bankName: "HDFC Bank",
          accountHolder: "Auxa Technologies Pvt. Ltd.",
          accountNumber: "5010012345678912",
          ifsc: "HDFC0001234",
        }),
      },
      {
        key: "legal",
        value: JSON.stringify({
          entityName: "",
          pan: "",
          cin: "",
          registeredAddress: "",
          notes: "",
        }),
      },
      {
        key: "email",
        value: JSON.stringify({
          reportReminderTime: "17:55",
          timezone: "Asia/Kolkata",
          enabled: true,
        }),
      },
      {
        key: "whatsapp",
        value: JSON.stringify({ enabled: false, reviewRequired: true, ownerPhone: "" }),
      },
      { key: "ai", value: JSON.stringify({ enabled: false, persona: "senior-manager" }) },
    ],
  });

  console.log("Seed complete (clean).");
  console.log("Login: admin@auxa.app / auxa1234 (owner)");
  console.log("Create your team, clients, services and tasks from the app.");
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
