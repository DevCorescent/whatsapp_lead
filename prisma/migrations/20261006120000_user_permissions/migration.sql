-- CreateTable: per-user permission overrides (layer 4 on top of role defaults)
CREATE TABLE "user_permissions" (
  "id"         TEXT        NOT NULL,
  "userId"     TEXT        NOT NULL,
  "permission" TEXT        NOT NULL,
  "allowed"    BOOLEAN     NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_permissions_userId_permission_key" UNIQUE ("userId", "permission"),
  CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "user_permissions_userId_idx" ON "user_permissions"("userId");
