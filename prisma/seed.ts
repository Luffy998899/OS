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

// IST "today" as YYYY-MM-DD
function istDate(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000);
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

async function main() {
  console.log("Seeding Auxa…");

  // Clean (order matters for FK constraints)
  await db.$transaction([
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
              ? "Assigns work, reviews AI drafts, sees reports & workload."
              : "Standard team member.",
        isSystem: true,
        permissions: JSON.stringify(perms),
      },
    });
    roles[name] = r.id;
  }

  const passwordHash = await bcrypt.hash("auxa1234", 10);

  // Rooms (the gamified office floor)
  const roomDefs = [
    { key: "developer", name: "Developer Room", department: "Engineering", description: "Website, web, app & software development.", posX: 0, posY: 0 },
    { key: "creative", name: "Creative Room", department: "Design & Marketing", description: "Digital marketing, content & deliverables.", posX: 1, posY: 0 },
    { key: "video-editing", name: "Video Editing Room", department: "Media", description: "Cutting, motion & post-production.", posX: 2, posY: 0 },
    { key: "managing-heads", name: "Managing Heads Room", department: "Leadership", description: "Company targets, roadmap & team management.", posX: 0, posY: 1 },
    { key: "common-board", name: "Common Board Room", department: "All-hands", description: "Cross-team standups & shared missions.", posX: 1, posY: 1 },
    { key: "client", name: "Client Room", department: "Client Success", description: "Outreach, follow-ups & hot/cold pipeline.", posX: 2, posY: 1 },
    { key: "creativity", name: "Creativity Room", department: "Ideation", description: "Brainstorming lounge open to every team.", posX: 1, posY: 2 },
  ];
  const rooms: Record<string, string> = {};
  for (const r of roomDefs) {
    const created = await db.room.create({ data: r });
    rooms[r.key] = created.id;
  }

  // Users
  const userDefs = [
    { email: "admin@auxa.app", name: "Aarav Mehta", role: "Admin", title: "Founder & CEO", department: "Leadership", roomKey: "managing-heads", points: 0, phone: "+919000000001" },
    { email: "manager@auxa.app", name: "Diya Kapoor", role: "Manager", title: "Delivery Lead", department: "Leadership", roomKey: "managing-heads", points: 640, phone: "+919000000002" },
    { email: "rohan@auxa.app", name: "Rohan Verma", role: "Employee", title: "Senior Full-stack Engineer", department: "Engineering", roomKey: "developer", points: 980, phone: "+919000000003" },
    { email: "sara@auxa.app", name: "Sara Ali", role: "Employee", title: "Frontend Engineer", department: "Engineering", roomKey: "developer", points: 720, phone: "+919000000004" },
    { email: "meera@auxa.app", name: "Meera Nair", role: "Employee", title: "Content & Marketing Lead", department: "Design & Marketing", roomKey: "creative", points: 815, phone: "+919000000005" },
    { email: "kabir@auxa.app", name: "Kabir Shah", role: "Employee", title: "Video Editor", department: "Media", roomKey: "video-editing", points: 430, phone: "+919000000006" },
    { email: "ananya@auxa.app", name: "Ananya Rao", role: "Employee", title: "Client Success Manager", department: "Client Success", roomKey: "client", points: 560, phone: "+919000000007" },
    { email: "vikram@auxa.app", name: "Vikram Singh", role: "Employee", title: "Billing & Accounts", department: "Operations", roomKey: "managing-heads", points: 300, phone: "+919000000008" },
  ];
  const users: Record<string, string> = {};
  for (const u of userDefs) {
    const created = await db.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash,
        title: u.title,
        department: u.department,
        phone: u.phone,
        points: u.points,
        roleId: roles[u.role],
        avatar: {
          create: {
            roomId: rooms[u.roomKey],
            x: 40 + Math.random() * 200,
            y: 40 + Math.random() * 140,
            status: "online",
          },
        },
      },
    });
    users[u.email] = created.id;
    if (u.points > 0) {
      await db.pointsLedger.create({
        data: { userId: created.id, delta: u.points, reason: "Seed — lifetime points" },
      });
    }
  }

  // Clients (mirrors the reference CRM list)
  const clientDefs = [
    { companyName: "Het Bedrijven Platform", ownerName: "Jeroen Bakker", category: "Enterprise", status: "active", temperature: "hot", manager: "ananya@auxa.app" },
    { companyName: "Ignify Careers", ownerName: "Priya Menon", category: "New Customer", status: "new", temperature: "warm", manager: "ananya@auxa.app" },
    { companyName: "Leon Cycle PTY Ltd.", ownerName: "Marcus Lee", category: "Active", status: "active", temperature: "warm", manager: "ananya@auxa.app" },
    { companyName: "Able Travels", ownerName: "Rita Fernandes", category: "New Customer", status: "new", temperature: "cold", manager: "ananya@auxa.app" },
    { companyName: "Simplify Global Ed.", ownerName: "Tom Harris", category: "Active", status: "active", temperature: "hot", manager: "manager@auxa.app" },
    { companyName: "Styluz Inc", ownerName: "Nadia Khan", category: "Suspended", status: "suspended", temperature: "cold", manager: "ananya@auxa.app" },
    { companyName: "Theevon", ownerName: "George Miller", category: "Enterprise", status: "active", temperature: "warm", manager: "manager@auxa.app" },
    { companyName: "Centroid Solutions", ownerName: "Leila Aziz", category: "Active", status: "active", temperature: "warm", manager: "ananya@auxa.app" },
    { companyName: "Empower Quest", ownerName: "David Cohen", category: "New Customer", status: "new", temperature: "hot", manager: "manager@auxa.app" },
    { companyName: "Prime Resolution", ownerName: "Sofia Rossi", category: "Active", status: "active", temperature: "cold", manager: "ananya@auxa.app" },
  ];
  const clients: Record<string, string> = {};
  for (const c of clientDefs) {
    const created = await db.client.create({
      data: {
        companyName: c.companyName,
        ownerName: c.ownerName,
        email: `${c.ownerName.split(" ")[0].toLowerCase()}@${c.companyName.split(" ")[0].toLowerCase()}.com`,
        phone: "+1 555 0" + Math.floor(100000 + Math.random() * 899999),
        category: c.category,
        status: c.status,
        temperature: c.temperature,
        managerId: users[c.manager],
        notes: "Imported during onboarding.",
      },
    });
    clients[c.companyName] = created.id;
    await db.outreachLog.create({
      data: {
        clientId: created.id,
        channel: "call",
        outcome: c.temperature === "hot" ? "interested" : "followup",
        note: "Initial discovery call completed.",
        nextFollowUpAt: new Date(Date.now() + 3 * 86400000),
      },
    });
  }

  // Tasks / Missions
  const taskDefs = [
    { title: "Ship Het Bedrijven marketing site v2", vertical: "website-dev", status: "in_progress", priority: "high", points: 40, assignee: "rohan@auxa.app", client: "Het Bedrijven Platform" },
    { title: "Build reusable pricing table component", vertical: "website-dev", status: "todo", priority: "medium", points: 20, assignee: "sara@auxa.app" },
    { title: "Q3 content calendar for Simplify Global", vertical: "digital-marketing", status: "in_progress", priority: "high", points: 30, assignee: "meera@auxa.app", client: "Simplify Global Ed." },
    { title: "Edit onboarding explainer video", vertical: "digital-marketing", status: "review", priority: "medium", points: 25, assignee: "kabir@auxa.app" },
    { title: "Competitor research: cycling e-commerce", vertical: "digital-marketing", status: "todo", priority: "low", points: 15, assignee: "meera@auxa.app", client: "Leon Cycle PTY Ltd." },
    { title: "Define company OKRs for next quarter", vertical: "roadmap", status: "in_progress", priority: "urgent", points: 50, assignee: "manager@auxa.app" },
    { title: "Follow up with Empower Quest (hot lead)", vertical: "client-outreach", status: "todo", priority: "high", points: 20, assignee: "ananya@auxa.app", client: "Empower Quest" },
    { title: "Re-engage Styluz Inc (suspended)", vertical: "client-outreach", status: "blocked", priority: "medium", points: 15, assignee: "ananya@auxa.app", client: "Styluz Inc" },
    { title: "Reconcile March invoices", vertical: "billing", status: "done", priority: "medium", points: 20, assignee: "vikram@auxa.app" },
    { title: "Set up automated payment reminders", vertical: "billing", status: "todo", priority: "low", points: 15, assignee: "vikram@auxa.app" },
    { title: "Accessibility audit of dashboard", vertical: "website-dev", status: "done", priority: "medium", points: 25, assignee: "sara@auxa.app" },
  ];
  const roomForVertical: Record<string, string> = {
    "website-dev": "developer",
    "digital-marketing": "creative",
    roadmap: "managing-heads",
    "client-outreach": "client",
    billing: "managing-heads",
  };
  for (const t of taskDefs) {
    await db.task.create({
      data: {
        title: t.title,
        description: "Auto-seeded mission. Break it down and log your progress.",
        vertical: t.vertical,
        status: t.status,
        priority: t.priority,
        points: t.points,
        assigneeId: users[t.assignee],
        createdById: users["admin@auxa.app"],
        clientId: t.client ? clients[t.client] : null,
        roomId: rooms[roomForVertical[t.vertical]],
        dueAt: new Date(Date.now() + (2 + Math.floor(Math.random() * 8)) * 86400000),
        startedAt: t.status !== "todo" ? new Date(Date.now() - 86400000) : null,
        completedAt: t.status === "done" ? new Date() : null,
        approvalStatus: "approved",
        activities: {
          create: { type: "created", actorId: users["admin@auxa.app"] },
        },
      },
    });
  }

  // Two AI-drafted tasks awaiting owner review (Assign & Plan / WhatsApp)
  await db.task.create({
    data: {
      title: "Draft landing page for new AI product",
      description: "Parsed from owner's WhatsApp: 'Get a landing page going for the AI launch, dev team.'",
      vertical: "website-dev",
      status: "todo",
      priority: "high",
      points: 35,
      source: "whatsapp",
      aiGenerated: true,
      approvalStatus: "pending_review",
      aiRationale: "Website work → routed to Engineering. Rohan has capacity and owns the marketing site.",
      assigneeId: users["rohan@auxa.app"],
      createdById: users["admin@auxa.app"],
      roomId: rooms["developer"],
    },
  });
  await db.task.create({
    data: {
      title: "Plan launch-week social campaign",
      description: "AI-suggested during Assign & Plan session.",
      vertical: "digital-marketing",
      status: "todo",
      priority: "medium",
      points: 25,
      source: "ai",
      aiGenerated: true,
      approvalStatus: "pending_review",
      aiRationale: "Marketing deliverable → Creative room. Meera leads content.",
      assigneeId: users["meera@auxa.app"],
      createdById: users["admin@auxa.app"],
      roomId: rooms["creative"],
    },
  });

  // Time entries (timesheet page)
  const teUsers = ["rohan@auxa.app", "sara@auxa.app", "meera@auxa.app", "kabir@auxa.app", "ananya@auxa.app"];
  for (const email of teUsers) {
    await db.timeEntry.create({
      data: {
        userId: users[email],
        clientId: clients["Het Bedrijven Platform"],
        description: "Focused work block",
        date: istDate(0),
        startTime: "10:30",
        durationSeconds: 3600 * (2 + Math.floor(Math.random() * 4)),
        invoiceStatus: Math.random() > 0.5 ? "invoiced" : "not_invoiced",
      },
    });
  }

  // An active shift for an employee (so check-out flow is testable)
  await db.shift.create({
    data: { userId: users["rohan@auxa.app"], status: "active", checkInNote: "Heads-down on the marketing site today." },
  });

  // Rewards
  await db.reward.createMany({
    data: [
      { name: "Half-day off", description: "Take a paid half-day whenever you like.", costPoints: 500 },
      { name: "Team lunch on the house", description: "Pick the spot — company covers it.", costPoints: 300 },
      { name: "₹1,000 Amazon voucher", description: "Treat yourself.", costPoints: 800 },
      { name: "Premium headphones", description: "Noise-cancelling, your pick.", costPoints: 1200 },
    ],
  });

  // AI hourly check-in journal (memory of the day)
  await db.aiCheckin.create({
    data: {
      summary: "Engineering focused on the Het Bedrijven site; Creative on Q3 content. One hot lead (Empower Quest) needs a same-day follow-up.",
      importantTasks: JSON.stringify(["Follow up with Empower Quest (hot lead)", "Define company OKRs for next quarter"]),
    },
  });

  // Default integration settings
  await db.setting.createMany({
    data: [
      { key: "whatsapp", value: JSON.stringify({ enabled: false, reviewRequired: true, ownerPhone: "" }) },
      { key: "email", value: JSON.stringify({ reportReminderTime: "17:55", timezone: "Asia/Kolkata", enabled: true }) },
      { key: "ai", value: JSON.stringify({ enabled: false, persona: "senior-manager" }) },
    ],
  });

  // A couple of documents (Miro-like whiteboards + a doc)
  await db.document.create({
    data: {
      title: "Q3 Roadmap Whiteboard",
      type: "whiteboard",
      ownerId: users["manager@auxa.app"],
      visibility: "team",
    },
  });
  await db.document.create({
    data: {
      title: "Onboarding Playbook",
      type: "doc",
      ownerId: users["admin@auxa.app"],
      visibility: "public",
    },
  });
  await db.document.create({
    data: {
      title: "My scratch board",
      type: "whiteboard",
      ownerId: users["rohan@auxa.app"],
      visibility: "private",
    },
  });

  // Notifications
  await db.notification.createMany({
    data: [
      { userId: users["rohan@auxa.app"], type: "task_assigned", title: "New mission assigned", body: "Ship Het Bedrijven marketing site v2" },
      { userId: users["admin@auxa.app"], type: "approval", title: "2 AI drafts need review", body: "Assign & Plan queued two tasks for your approval." },
    ],
  });

  console.log("Seed complete.");
  console.log("Login: admin@auxa.app / auxa1234 (owner)");
  console.log("       manager@auxa.app / auxa1234 (manager)");
  console.log("       rohan@auxa.app / auxa1234 (employee)");
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
