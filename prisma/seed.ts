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

  // Department rooms (the base office floor). Client areas are added by the admin.
  const roomDefs = [
    { key: "developer", name: "Developer Room", department: "Engineering" },
    { key: "creative", name: "Creative Room", department: "Design & Marketing" },
    { key: "video-editing", name: "Video Editing Room", department: "Media" },
    { key: "managing-heads", name: "Managing Heads Room", department: "Leadership" },
    { key: "common-board", name: "Common Board Room", department: "All-hands" },
    { key: "client", name: "Client Room", department: "Client Success" },
    { key: "creativity", name: "Creativity Room", department: "Ideation" },
  ];
  const rooms: Record<string, string> = {};
  for (const r of roomDefs) {
    const created = await db.room.create({
      data: { ...r, kind: "department" },
    });
    rooms[r.key] = created.id;
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
        create: { roomId: rooms["managing-heads"], x: 174, y: 372, status: "online" },
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
