import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma singleton.
 *
 * Next.js dev mode hot-reloads modules on every edit. Without stashing the
 * client on globalThis each reload would open a brand new pool and leak
 * Postgres connections until the DB refuses new ones.
 */

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  /** The class the stashed client was built from. */
  prismaClass?: typeof PrismaClient;
};

// After `prisma generate` (a schema change) the client module reloads with a
// new class, but the stashed instance still knows only the OLD fields and
// fails with "Unknown field …". Only reuse it if it came from this class.
const stashed =
  globalForPrisma.prismaClass === PrismaClient ? globalForPrisma.prisma : undefined;
if (!stashed && globalForPrisma.prisma) {
  void globalForPrisma.prisma.$disconnect();
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

export const prisma: PrismaClient = stashed ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaClass = PrismaClient;
}

export default prisma;

// Re-exported so the rest of the app has a single import site for Prisma
// types and enums and never needs to reach into src/generated.
export * from "@/generated/prisma/enums";
export type {
  UserModel as User,
  WorkLogModel as WorkLog,
  MeetingModel as Meeting,
  TicketModel as Ticket,
  TicketWorkUpdateModel as TicketWorkUpdate,
  TicketHistoryEntryModel as TicketHistoryEntry,
  TaskModel as Task,
  NoteModel as Note,
  LinkModel as Link,
  ResourceModel as Resource,
} from "@/generated/prisma/models";
