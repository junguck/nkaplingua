<#
.SYNOPSIS
  Connecte NkapLingua à la sandbox SAFINUM (équivalent PowerShell de connect-sandbox.sh).
.DESCRIPTION
  1. vérifie la clé d'équipe et affiche le PASS du simulateur
  2. démarre la pile Docker (sauf -NoDocker : gateway déjà lancé sur le port 8080)
  3. ouvre un tunnel public cloudflared vers le gateway
  4. vérifie que le tunnel atteint bien le gateway
  5. déclare https://<tunnel>/hook/<HOOK_SECRET> pour les six canaux
  6. relit la configuration enregistrée par la sandbox
  Prérequis : infra\.env rempli, cloudflared et docker dans le PATH. Laisser la fenêtre ouverte.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File infra\connect-sandbox.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File infra\connect-sandbox.ps1 -NoDocker
#>
param(
  [switch]$NoDocker,
  [string]$Api = 'https://safinum.cm/api/v1',
  [int]$Port = 8080
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path (Join-Path $Root 'infra') '.env'
$Compose = Join-Path (Join-Path $Root 'infra') 'docker-compose.yml'
$Channels = 'ussd', 'sms', 'ivr', 'mobile', 'web', 'atm'

function Fail([string]$Message) { Write-Host "ERREUR : $Message" -ForegroundColor Red; exit 1 }
function Step([string]$Message) { Write-Host ''; Write-Host "==> $Message" -ForegroundColor Cyan }

# Masque toute valeur dont le nom évoque une clé, un secret ou un jeton.
function Hide-Secrets($Value) {
  if ($Value -is [System.Management.Automation.PSCustomObject]) {
    $out = [ordered]@{}
    foreach ($p in $Value.PSObject.Properties) {
      $out[$p.Name] = if ($p.Name -match 'key|secret|token') { '<masqué>' } else { Hide-Secrets $p.Value }
    }
    return [pscustomobject]$out
  }
  if ($Value -is [System.Array]) { return @($Value | ForEach-Object { Hide-Secrets $_ }) }
  return $Value
}
function Show-Json([string]$Text) {
  try { (Hide-Secrets ($Text | ConvertFrom-Json)) | ConvertTo-Json -Depth 10 | Write-Host }
  catch { Write-Host $Text }
}

# Appel HTTP qui ne lève jamais : renvoie le code et le corps (Windows PowerShell 5.1 et PowerShell 7).
function Invoke-Sandbox([string]$Method, [string]$Url, [string]$Body = $null) {
  $headers = @{ 'X-Team-Key' = $env:SAFINUM_TEAM_KEY; 'Accept' = 'application/json' }
  $params = @{ Method = $Method; Uri = $Url; Headers = $headers; UseBasicParsing = $true; TimeoutSec = 20 }
  if ($Body) { $params.Body = [System.Text.Encoding]::UTF8.GetBytes($Body); $params.ContentType = 'application/json' }
  try {
    $r = Invoke-WebRequest @params
    return @{ Code = [int]$r.StatusCode; Body = [string]$r.Content }
  } catch {
    $resp = $_.Exception.Response
    if ($null -eq $resp) { return @{ Code = 0; Body = $_.Exception.Message } }
    $text = $_.ErrorDetails.Message
    if (-not $text) {
      try { $text = (New-Object System.IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } catch { $text = '' }
    }
    return @{ Code = [int]$resp.StatusCode; Body = $text }
  }
}

function Test-Health([string]$Url) {
  try { (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { $false }
}

# Prérequis
$tools = @('cloudflared'); if (-not $NoDocker) { $tools += 'docker' }
foreach ($t in $tools) { if (-not (Get-Command $t -ErrorAction SilentlyContinue)) { Fail "$t est introuvable. Installez-le puis relancez." } }
if (-not (Test-Path $EnvFile)) { Fail "$EnvFile manquant : copiez infra\.env.example en infra\.env puis remplissez-le." }

# Lecture de infra\.env (lignes CLE=valeur, commentaires ignorés)
foreach ($line in Get-Content -Path $EnvFile -Encoding UTF8) {
  if ($line -match '^\s*#' -or $line -notmatch '^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$') { continue }
  $value = $Matches[2] -replace '^([''"])(.*)\1$', '$2'
  Set-Item -Path "Env:$($Matches[1])" -Value $value
}
if (-not $env:SAFINUM_TEAM_KEY) { Fail 'SAFINUM_TEAM_KEY est vide dans infra\.env.' }
if (-not $env:HOOK_SECRET -or $env:HOOK_SECRET.Length -lt 24) { Fail 'HOOK_SECRET doit faire au moins 24 caractères.' }
if ($env:SAFINUM_BANK_URL -and $env:SAFINUM_BANK_URL -notlike 'https://safinum.cm/*') {
  Fail "SAFINUM_BANK_URL pointe vers $($env:SAFINUM_BANK_URL) : pour la vraie sandbox, laissez-la vide ou mettez https://safinum.cm/api/v1."
}

Step '1. Vérification de la clé d''équipe'
$r = Invoke-Sandbox 'GET' "$Api/sandbox/endpoint"
if ($r.Code -ne 200) { Write-Host $r.Body; Fail "clé refusée (HTTP $($r.Code)). Demandez une clé valide au jury." }
Write-Host 'Clé acceptée. Configuration actuelle (le PASS du simulateur y figure) :'
Show-Json $r.Body

if ($NoDocker) {
  Step '2. Pile Docker ignorée (-NoDocker)'
} else {
  Step '2. Démarrage de la pile Docker'
  docker compose -f $Compose --env-file $EnvFile up -d --build
  if ($LASTEXITCODE -ne 0) { Fail 'docker compose a échoué.' }
}
Write-Host "Attente du gateway sur le port $Port..."
$ok = $false
for ($i = 0; $i -lt 60 -and -not $ok; $i++) { $ok = Test-Health "http://127.0.0.1:$Port/health"; if (-not $ok) { Start-Sleep -Seconds 2 } }
if (-not $ok) { Fail "le gateway ne répond pas sur http://127.0.0.1:$Port/health" }
Write-Host 'Gateway prêt.'

Step '3. Ouverture du tunnel public'
$outLog = [System.IO.Path]::GetTempFileName()
$errLog = [System.IO.Path]::GetTempFileName()
$tunnelProc = Start-Process -FilePath 'cloudflared' -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$Port") `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -NoNewWindow
try {
  $tunnel = $null
  for ($i = 0; $i -lt 45 -and -not $tunnel; $i++) {
    $text = (Get-Content $outLog, $errLog -Raw -ErrorAction SilentlyContinue) -join "`n"
    $m = [regex]::Match($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($m.Success) { $tunnel = $m.Value } else { Start-Sleep -Seconds 1 }
  }
  if (-not $tunnel) { Get-Content $errLog -Tail 20; Fail 'cloudflared n''a pas fourni d''URL.' }
  Write-Host "Tunnel : $tunnel"

  Step '4. Vérification du tunnel'
  $ok = $false
  for ($i = 0; $i -lt 30 -and -not $ok; $i++) { $ok = Test-Health "$tunnel/health"; if (-not $ok) { Start-Sleep -Seconds 2 } }
  if (-not $ok) { Fail "le tunnel n'atteint pas le gateway ($tunnel/health)." }
  Write-Host 'Le tunnel atteint le gateway.'

  $hookUrl = "$tunnel/hook/$($env:HOOK_SECRET)"
  Step '5. Déclaration de l''URL secrète sur les six canaux'
  foreach ($ch in $Channels) {
    $body = @{ channel = $ch; url = $hookUrl } | ConvertTo-Json -Compress
    $d = Invoke-Sandbox 'POST' "$Api/sandbox/endpoint" $body
    if ($d.Code -eq 200 -or $d.Code -eq 201) { Write-Host "  $ch : déclaré" -ForegroundColor Green }
    else { Write-Host "  $ch : ÉCHEC (HTTP $($d.Code)) $($d.Body)" -ForegroundColor Red }
  }

  Step '6. Configuration enregistrée par la sandbox'
  Show-Json (Invoke-Sandbox 'GET' "$Api/sandbox/endpoint").Body

  Write-Host @"

Prêt. Testez dans les simulateurs (équipe « shun and Co », PASS ci-dessus, un compte de test) :
  USSD   https://safinum.cm/sandbox/ussd
  Mobile https://safinum.cm/sandbox/channel/mobile
  Web    https://safinum.cm/sandbox/channel/web
  SMS    https://safinum.cm/sandbox/sms
  GAB    https://safinum.cm/sandbox/atm
  Vocal  https://safinum.cm/sandbox/ivr

Journal en direct du gateway : docker compose -f infra\docker-compose.yml logs -f gateway
Laissez cette fenêtre ouverte ; Ctrl+C ferme le tunnel (il faudra alors relancer ce script).
"@
  Wait-Process -Id $tunnelProc.Id
} finally {
  if ($tunnelProc -and -not $tunnelProc.HasExited) { Stop-Process -Id $tunnelProc.Id -Force; Write-Host 'Tunnel fermé.' }
  Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue
}
