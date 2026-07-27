param([Parameter(Mandatory=$true)][string]$Input)
Get-Content -AsByteStream $Input | docker compose exec -T postgres pg_restore -U tgs -d tgs_quotes --clean --if-exists
