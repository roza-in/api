-- DropIndex
DROP INDEX "business_members_userId_businessId_key";

-- CreateIndex
CREATE UNIQUE INDEX "business_members_userId_key" ON "business_members"("userId");
