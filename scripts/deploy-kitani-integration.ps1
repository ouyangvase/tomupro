param(
  [string]$ProjectRef = "dtcchduronwsyunyakxj",
  [string]$RailwayProjectId = "e4c3ed3e-938f-4178-a14b-3fcaa806b3ac",
  [string]$RailwayEnvironmentId = "37a21966-26fe-42d7-8637-a8f85843e55b",
  [string]$RailwayServiceId = "ad686652-345e-4bb7-8832-3e36c77bb6d4",
  [string]$KitaniApiBaseUrl = "https://api.kitani.my",
  [string]$KitaniCustomerUrl = "https://www.kitani.my",
  [string]$KitaniClientId = $env:KITANI_CLIENT_ID,
  [string]$KitaniApiSecret = $env:KITANI_API_SECRET,
  [string]$InvitationTemplate = $env:KITANI_INVITATION_TEMPLATE,
  [string]$KitaniRepoPath = $env:KITANI_REPO_PATH
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
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
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

if ($KitaniRepoPath) {
  if (-not (Test-Path $KitaniRepoPath)) {
    throw "KITANI_REPO_PATH does not exist: $KitaniRepoPath"
  }

  Write-Host "Redeploying KITANI backend from KITANI_REPO_PATH so new Railway variables are active..."
  Push-Location $KitaniRepoPath
  try {
    npx @railway/cli link `
      --project $RailwayProjectId `
      --environment $RailwayEnvironmentId `
      --service $RailwayServiceId | Out-Null

    npx @railway/cli up -y --detach `
      --project $RailwayProjectId `
      --environment $RailwayEnvironmentId `
      --service $RailwayServiceId `
      --message "Activate TOMUPRO integration credentials"
  } finally {
    Pop-Location
  }
} else {
  Write-Host "Skipping KITANI backend redeploy. Set KITANI_REPO_PATH to the KITANI repository path and rerun, or redeploy the Railway kitani-backend service from the KITANI repository."
}

Write-Host "KITANI to TOMUPRO integration deployment commands completed."
