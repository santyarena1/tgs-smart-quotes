-- CreateTable
CREATE TABLE "AcustockProduct" (
    "mpn" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceCents" BIGINT NOT NULL,
    "salePriceCents" BIGINT,
    "stockQuantity" INTEGER NOT NULL,
    "availability" TEXT NOT NULL,
    "brand" TEXT,
    "productType" TEXT,
    "imageUrl" TEXT,
    "weightKg" DOUBLE PRECISION,
    "lengthCm" DOUBLE PRECISION,
    "widthCm" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "tags" TEXT[],
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcustockProduct_pkey" PRIMARY KEY ("mpn")
);

-- CreateIndex
CREATE INDEX "AcustockProduct_title_idx" ON "AcustockProduct"("title");

-- CreateIndex
CREATE INDEX "AcustockProduct_productType_idx" ON "AcustockProduct"("productType");

-- CreateIndex
CREATE INDEX "AcustockProduct_brand_idx" ON "AcustockProduct"("brand");

-- CreateIndex
CREATE INDEX "AcustockProduct_availability_idx" ON "AcustockProduct"("availability");

-- CreateIndex
CREATE INDEX "AcustockProduct_priceCents_idx" ON "AcustockProduct"("priceCents");
