param([string]$Output='backup.dump')
docker compose exec -T postgres pg_dump -U tgs -Fc tgs_quotes > $Output
