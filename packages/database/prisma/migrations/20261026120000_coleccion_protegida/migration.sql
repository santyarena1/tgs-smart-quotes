-- Las colecciones nacen protegidas: editar un presupuesto de una colección crea otro en vez de modificarlo.
ALTER TABLE "Collection" ADD COLUMN "isProtected" BOOLEAN NOT NULL DEFAULT true;
