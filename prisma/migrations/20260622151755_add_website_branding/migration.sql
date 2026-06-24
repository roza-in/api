-- AlterTable
ALTER TABLE "staff" ALTER COLUMN "roleId" SET DEFAULT '00000000-0000-0000-0000-000000000004';

-- AlterTable
ALTER TABLE "websites" ADD COLUMN     "faviconUrl" TEXT,
ADD COLUMN     "logoAltText" TEXT,
ADD COLUMN     "logoUrl" TEXT;
