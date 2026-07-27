# Backup y restauración

## Backup

```powershell
.\infrastructure\scripts\backup.ps1 storage\backup.dump
```

Crea un dump PostgreSQL (`pg_dump -Fc`) del contenedor `postgres`. Evidencia smoke 2026-07-26: `storage/backup-smoke.dump` generado OK.

También respaldar el volumen de PDFs (`PDF_LOCAL_DIR` o volumen Docker `pdf_data` / bucket S3). La base sola no contiene los binarios históricos.

## Restauración

```powershell
.\infrastructure\scripts\restore.ps1 -Input storage\backup.dump
```

Ejecuta `pg_restore --clean --if-exists` contra `tgs_quotes`. Probar restauraciones periódicamente en un entorno no productivo.

