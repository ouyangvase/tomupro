param(
  [string]$ProjectRef = "dtcchduronwsyunyakxj",
  [string]$KitaniApiSecret = $env:KITANI_API_SECRET
)

$ErrorActionPreference = "Stop"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  throw "SUPABASE_ACCESS_TOKEN is required. Create it in Supabase Account > Access Tokens, set it only in this terminal, then rerun this script."
}

if (-not $KitaniApiSecret) {
  throw "KITANI_API_SECRET is required. Set it to the same value as KITANI's TOMUPRO_API_SECRET, then rerun this script."
}

Write-Host "Setting TOMUPRO Supabase function secret..."
npx supabase secrets set `
  --project-ref $ProjectRef `
  "KITANI_API_SECRET=$KitaniApiSecret" | Out-Null

Write-Host "Applying only the KITANI points migration..."
npx supabase link --project-ref $ProjectRef | Out-Null
npx supabase db query --linked --file "supabase/migrations/20261017120000_kitani_point_events.sql"

Write-Host "Deploying TOMUPRO Supabase edge function..."
npx supabase functions deploy send-kitani-points --project-ref $ProjectRef

Write-Host "KITANI points deployment commands completed."
