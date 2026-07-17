param(
  [string]$ProjectRef = "dtcchduronwsyunyakxj",
  [string]$RailwayProjectId = "e4c3ed3e-938f-4178-a14b-3fcaa806b3ac",
  [string]$RailwayEnvironmentId = "37a21966-26fe-42d7-8637-a8f85843e55b",
  [string]$RailwayServiceId = "ad686652-345e-4bb7-8832-3e36c77bb6d4",
  [string]$KitaniApiBaseUrl = "https://api.kitani.my",
  [string]$KitaniCustomerUrl = "https://www.kitani.my",
  [string]$KitaniClientId = $env:KITANI_CLIENT_ID,
  [string]$KitaniApiSecret = $env:KITANI_API_SECRET,
  [string]$InvitationTemplate = $env:KITANI_INVITATION_TEMPLATE
)

$ErrorActionPreference = "Stop"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  throw "SUPABASE_ACCESS_TOKEN is required. Create it in Supabase Account > Access Tokens, set it only in this terminal, then rerun this script."
}

if (-not $KitaniClientId) {
  $KitaniClientId = "tomupro-" + ([Guid]::NewGuid().ToString("N"))
}

if (-not $KitaniApiSecret) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $KitaniApiSecret = [Convert]::ToBase64String($bytes)
}

if (-not $InvitationTemplate) {
  $InvitationTemplate = "Your order is ready for KITANI delivery. Get the free delivery, rewards & more!`n`nConfirm your location: {{confirmation_url}}"
}

function Set-RailwaySecret {
  param([string]$Name, [string]$Value)
  $Value | npx @railway/cli variable set $Name --stdin `
    --project $RailwayProjectId `
    --environment $RailwayEnvironmentId `
    --service $RailwayServiceId | Out-Null
}

Write-Host "Setting KITANI Railway integration variables..."
Set-RailwaySecret "TOMUPRO_CLIENT_ID" $KitaniClientId
Set-RailwaySecret "TOMUPRO_API_SECRET" $KitaniApiSecret
Set-RailwaySecret "KITANI_TO_TOMUPRO_EVENTS_URL" "https://$ProjectRef.supabase.co/functions/v1/kitani-events"
Set-RailwaySecret "KITANI_TO_TOMUPRO_CLIENT_ID" $KitaniClientId
Set-RailwaySecret "KITANI_TO_TOMUPRO_API_SECRET" $KitaniApiSecret

Write-Host "Setting TOMUPRO Supabase function secrets..."
npx supabase secrets set `
  --project-ref $ProjectRef `
  "KITANI_INTEGRATION_MODE=api" `
  "KITANI_API_BASE_URL=$KitaniApiBaseUrl" `
  "KITANI_CLIENT_ID=$KitaniClientId" `
  "KITANI_API_SECRET=$KitaniApiSecret" `
  "KITANI_INVITATION_TEMPLATE=$InvitationTemplate" `
  "KITANI_APP_URL=$KitaniCustomerUrl" `
  "TOMUPRO_TENANT_ID=tomupro" | Out-Null

Write-Host "Applying only the KITANI integration migration..."
npx supabase link --project-ref $ProjectRef | Out-Null
npx supabase db query --linked --file "supabase/migrations/20260718110000_kitani_order_links.sql"

Write-Host "Deploying TOMUPRO Supabase edge functions..."
npx supabase functions deploy create-kitani-invitation --project-ref $ProjectRef
npx supabase functions deploy kitani-events --project-ref $ProjectRef
npx supabase functions deploy send-kitani-delivered --project-ref $ProjectRef
npx supabase functions deploy process-delivery --project-ref $ProjectRef

Write-Host "Redeploying KITANI backend so new Railway variables are active..."
npx @railway/cli up -y --detach `
  --project $RailwayProjectId `
  --environment $RailwayEnvironmentId `
  --service $RailwayServiceId `
  --message "Activate TOMUPRO integration credentials"

Write-Host "KITANI to TOMUPRO integration deployment commands completed."
