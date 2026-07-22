import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 runs the query compiler in-process ("client" engine), which means the
// client can no longer open its own connection — it needs a driver adapter.
// Without this, every query throws at construction time:
//   "Using engine type "client" requires either "adapter" or "accelerateUrl"".
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export function isPrismaDatabaseUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === "P1001") return true;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return message.includes("Can't reach database server") || message.includes("DatabaseNotReachable");
}
