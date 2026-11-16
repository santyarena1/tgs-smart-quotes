-- El presupuesto web es un tipo de presupuesto más (como Detallado o Formal): se guarda y se identifica por el tipo de su PDF.
ALTER TYPE "PdfKind" ADD VALUE IF NOT EXISTS 'WEB';
