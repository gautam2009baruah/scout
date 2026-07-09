# Rally Defect Analyzer Script
# Description: Connects to Rally API, fetches defect details, performs RCA and provides implementation plan

param(
    [Parameter(Mandatory=$false)]
    [string]$DefectId = "DE296377",
    
    [Parameter(Mandatory=$false)]
    [string]$ConfigPath = "$PSScriptRoot\..\\.codenova-config.json"
)

# Read configuration if exists
$apiKey = $null
$apiUrl = "https://rally1.rallydev.com"
$proxyAddress = "www-ad-proxy.sabre.com:80"

if (Test-Path $ConfigPath) {
    $config = Get-Content $ConfigPath | ConvertFrom-Json
    $apiKey = $config.rally.apiKey
    $apiUrl = $config.rally.apiUrl
    if ($config.rally.proxyAddress) {
        $proxyAddress = $config.rally.proxyAddress
    }
}

# Fallback: check integration-account.json if key still missing
$IntegrationAccountPath = "$PSScriptRoot\..\integration-account.json"
if (-not $apiKey) {
    if (Test-Path $IntegrationAccountPath) {
        try {
            $account = Get-Content $IntegrationAccountPath -Raw | ConvertFrom-Json
            $apiKey = $account.rally.apiKey
        } catch {
            Write-Host "⚠️  Could not parse integration-account.json: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

# Last resort: prompt the user and persist the key
if (-not $apiKey) {
    Write-Host "⚠️  Rally API key not found in config or integration-account.json." -ForegroundColor Yellow
    $apiKey = Read-Host "🔑 Enter your Rally API key"
    if (-not $apiKey) {
        Write-Host "❌ No API key provided. Exiting." -ForegroundColor Red
        exit 1
    }

    # Persist the key in integration-account.json
    try {
        if (Test-Path $IntegrationAccountPath) {
            $account = Get-Content $IntegrationAccountPath -Raw | ConvertFrom-Json
        } else {
            $account = [PSCustomObject]@{
                version = "1.0"
                rally   = [PSCustomObject]@{
                    apiUrl = $apiUrl
                    apiKey = ""
                }
            }
        }
        $account.rally.apiKey = $apiKey
        $account | ConvertTo-Json -Depth 10 | Set-Content $IntegrationAccountPath -Encoding UTF8
        Write-Host "✅ API key saved to integration-account.json" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Could not persist API key: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🔍 Rally Defect Analyzer - $DefectId" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Function to make Rally API call using REST
function Get-RallyDefect {
    param(
        [string]$FormattedId,
        [string]$ApiKey,
        [string]$RallyBaseUrl,
        [string]$ProxyAddr
    )
    
    try {
        Write-Host "🔌 Connecting to Rally API..." -ForegroundColor Yellow
        
        # Set up headers
        $headers = @{
            "Content-Type" = "application/json"
            "zsessionid" = $ApiKey
        }
        
        # Build query
        $query = "(FormattedID = `"$FormattedId`")"
        
        Write-Host "📡 Fetching defect: $FormattedId" -ForegroundColor Yellow
        
        # Make the API call
        $uri = "$RallyBaseUrl/slm/webservice/v2.0/defect"
        $bodyParams = @{
            query = $query
            fetch = "FormattedID,Name,State,Priority,Severity,Owner,Description,CreationDate,LastUpdateDate,c_HSPDCommitBranch,Notes,Resolution,Environment,FoundInBuild,Project,Release,Iteration"
            pagesize = 1
        }
        
        $response = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers -Body $bodyParams
        
        if ($response.QueryResult.TotalResultCount -eq 0) {
            Write-Host "❌ Defect $FormattedId not found in Rally" -ForegroundColor Red
            return $null
        }
        
        Write-Host "✅ Successfully retrieved defect from Rally" -ForegroundColor Green
        Write-Host ""
        
        return $response.QueryResult.Results[0]
    }
    catch {
        Write-Host "❌ Error connecting to Rally: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.InnerException.Message) {
            Write-Host "   Details: $($_.Exception.InnerException.Message)" -ForegroundColor DarkRed
        }
        return $null
    }
}

# Function to display defect details
function Show-DefectDetails {
    param($Defect)
    
    if ($null -eq $Defect) {
        return
    }
    
    Write-Host "📋 DEFECT DETAILS" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "ID:              " -NoNewline -ForegroundColor White
    Write-Host "$($Defect.FormattedID)" -ForegroundColor Yellow
    Write-Host "Name:            " -NoNewline -ForegroundColor White
    Write-Host "$($Defect.Name)" -ForegroundColor White
    Write-Host "State:           " -NoNewline -ForegroundColor White
    Write-Host "$($Defect.State)" -ForegroundColor $(if ($Defect.State -eq "Fixed") { "Green" } elseif ($Defect.State -eq "Closed") { "DarkGreen" } else { "Yellow" })
    Write-Host "Priority:        " -NoNewline -ForegroundColor White
    Write-Host "$($Defect.Priority)" -ForegroundColor $(if ($Defect.Priority -match "P1|Critical") { "Red" } elseif ($Defect.Priority -match "P2|High") { "Yellow" } else { "White" })
    Write-Host "Severity:        " -NoNewline -ForegroundColor White
    Write-Host "$($Defect.Severity)" -ForegroundColor White
    Write-Host "Created Date:    " -NoNewline -ForegroundColor White
    Write-Host "$($Defect.CreationDate)" -ForegroundColor White
    
    if ($Defect.Owner) {
        Write-Host "Owner:           " -NoNewline -ForegroundColor White
        Write-Host "$($Defect.Owner._refObjectName)" -ForegroundColor White
    }
    
    if ($Defect.Project) {
        Write-Host "Project:         " -NoNewline -ForegroundColor White
        Write-Host "$($Defect.Project._refObjectName)" -ForegroundColor White
    }
    
    if ($Defect.Release) {
        Write-Host "Release:         " -NoNewline -ForegroundColor White
        Write-Host "$($Defect.Release._refObjectName)" -ForegroundColor White
    }
    
    if ($Defect.Iteration) {
        Write-Host "Iteration:       " -NoNewline -ForegroundColor White
        Write-Host "$($Defect.Iteration._refObjectName)" -ForegroundColor White
    }
    
    if ($Defect.c_HSPDCommitBranch) {
        Write-Host "Commit Branch:   " -NoNewline -ForegroundColor White
        Write-Host "$($Defect.c_HSPDCommitBranch)" -ForegroundColor Magenta
    }
    
    Write-Host ""
    Write-Host "Description:" -ForegroundColor White
    Write-Host "─────────────────────────────────────────────────────" -ForegroundColor DarkGray
    if ($Defect.Description) {
        Write-Host "$($Defect.Description)" -ForegroundColor Gray
    } else {
        Write-Host "(No description provided)" -ForegroundColor DarkGray
    }
    Write-Host ""
    
    if ($Defect.Notes) {
        Write-Host "Notes:" -ForegroundColor White
        Write-Host "─────────────────────────────────────────────────────" -ForegroundColor DarkGray
        Write-Host "$($Defect.Notes)" -ForegroundColor Gray
        Write-Host ""
    }
    
    if ($Defect.Resolution) {
        Write-Host "Resolution:" -ForegroundColor White
        Write-Host "─────────────────────────────────────────────────────" -ForegroundColor DarkGray
        Write-Host "$($Defect.Resolution)" -ForegroundColor Gray
        Write-Host ""
    }
}

# Function to perform Root Cause Analysis
function Get-RootCauseAnalysis {
    param($Defect)
    
    Write-Host ""
    Write-Host "🔬 ROOT CAUSE ANALYSIS (RCA)" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    
    # Analyze based on defect details
    Write-Host "1. SYMPTOM IDENTIFICATION" -ForegroundColor Yellow
    Write-Host "   • Defect ID: $($Defect.FormattedID)" -ForegroundColor White
    Write-Host "   • Severity/Priority: $($Defect.Severity) / $($Defect.Priority)" -ForegroundColor White
    if ($Defect.Environment) {
        Write-Host "   • Environment: $($Defect.Environment)" -ForegroundColor White
    }
    if ($Defect.FoundInBuild) {
        Write-Host "   • Found in Build: $($Defect.FoundInBuild)" -ForegroundColor White
    }
    Write-Host ""
    
    Write-Host "2. IMPACT ASSESSMENT" -ForegroundColor Yellow
    Write-Host "   • Severity: $($Defect.Severity)" -ForegroundColor White
    Write-Host "   • Priority: $($Defect.Priority)" -ForegroundColor White
    Write-Host "   • Current State: $($Defect.State)" -ForegroundColor White
    Write-Host ""
    
    Write-Host "3. ROOT CAUSE HYPOTHESIS" -ForegroundColor Yellow
    Write-Host "   Based on defect description, potential root causes:" -ForegroundColor White
    
    # Pattern matching for common issues
    $description = "$($Defect.Description) $($Defect.Name)".ToLower()
    
    $foundIssues = $false
    
    if ($description -match "null|nullreferenceexception|null pointer") {
        Write-Host "   ⚠️  NULL REFERENCE: Code not handling null values properly" -ForegroundColor Red
        $foundIssues = $true
    }
    if ($description -match "timeout|performance|slow") {
        Write-Host "   ⚠️  PERFORMANCE: Query/operation timeout or performance degradation" -ForegroundColor Red
        $foundIssues = $true
    }
    if ($description -match "validation|invalid|error") {
        Write-Host "   ⚠️  VALIDATION: Input validation or business rule violation" -ForegroundColor Red
        $foundIssues = $true
    }
    if ($description -match "configuration|config|setting") {
        Write-Host "   ⚠️  CONFIGURATION: Incorrect configuration or environment setup" -ForegroundColor Red
        $foundIssues = $true
    }
    if ($description -match "concurrency|deadlock|lock") {
        Write-Host "   ⚠️  CONCURRENCY: Thread safety or locking issue" -ForegroundColor Red
        $foundIssues = $true
    }
    if ($description -match "data|database|sql") {
        Write-Host "   ⚠️  DATA INTEGRITY: Database schema or data consistency issue" -ForegroundColor Red
        $foundIssues = $true
    }
    if ($description -match "exception|error|crash|fail") {
        Write-Host "   ⚠️  RUNTIME ERROR: Unhandled exception or error condition" -ForegroundColor Red
        $foundIssues = $true
    }
    
    if (-not $foundIssues) {
        Write-Host "   ℹ️  Manual analysis required - no automatic pattern detected" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "4. VERIFICATION STEPS" -ForegroundColor Yellow
    Write-Host "   □ Review code changes in the affected release" -ForegroundColor White
    Write-Host "   □ Check version control history for related files" -ForegroundColor White
    Write-Host "   □ Analyze logs and error messages" -ForegroundColor White
    Write-Host "   □ Reproduce in test environment" -ForegroundColor White
    Write-Host "   □ Review unit tests coverage for affected area" -ForegroundColor White
    Write-Host ""
}

# Function to provide implementation plan
function Get-ImplementationPlan {
    param($Defect)
    
    Write-Host ""
    Write-Host "📝 IMPLEMENTATION PLAN" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "PHASE 1: INVESTIGATION `& ANALYSIS (Est: 2-4 hours)" -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "  1.1 Code Analysis" -ForegroundColor White
    Write-Host "      □ Identify affected code modules" -ForegroundColor Gray
    Write-Host "      □ Review recent changes (git blame/history)" -ForegroundColor Gray
    Write-Host "      □ Analyze call stack and dependencies" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  1.2 Environment Setup" -ForegroundColor White
    Write-Host "      □ Set up local debugging environment" -ForegroundColor Gray
    Write-Host "      □ Reproduce the defect locally" -ForegroundColor Gray
    Write-Host "      □ Gather test data" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "PHASE 2: FIX DEVELOPMENT (Est: 4-8 hours)" -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "  2.1 Code Changes" -ForegroundColor White
    Write-Host "      □ Implement fix based on RCA findings" -ForegroundColor Gray
    Write-Host "      □ Add defensive coding (null checks, validation)" -ForegroundColor Gray
    Write-Host "      □ Update error handling and logging" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2.2 Unit Testing" -ForegroundColor White
    Write-Host "      □ Create/update unit tests for the fix" -ForegroundColor Gray
    Write-Host "      □ Add regression tests" -ForegroundColor Gray
    Write-Host "      □ Ensure code coverage > 80%" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "PHASE 3: TESTING `& VALIDATION (Est: 4-6 hours)" -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "  3.1 Local Testing" -ForegroundColor White
    Write-Host "      □ Test happy path scenarios" -ForegroundColor Gray
    Write-Host "      □ Test edge cases and error scenarios" -ForegroundColor Gray
    Write-Host "      □ Verify no regressions in related functionality" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  3.2 Integration Testing" -ForegroundColor White
    Write-Host "      □ Deploy to DEV/QA environment" -ForegroundColor Gray
    Write-Host "      □ Run automated test suite" -ForegroundColor Gray
    Write-Host "      □ Perform manual testing of affected workflows" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "PHASE 4: CODE REVIEW `& DEPLOYMENT (Est: 2-4 hours)" -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "  4.1 Code Review" -ForegroundColor White
    Write-Host "      □ Create pull request with detailed description" -ForegroundColor Gray
    Write-Host "      □ Address review comments" -ForegroundColor Gray
    Write-Host "      □ Get approval from tech lead" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  4.2 Deployment" -ForegroundColor White
    Write-Host "      □ Merge to main branch" -ForegroundColor Gray
    if ($Defect.c_HSPDCommitBranch) {
        Write-Host "      □ Merge fix into: $($Defect.c_HSPDCommitBranch)" -ForegroundColor Magenta
    }
    Write-Host "      □ Deploy to staging environment" -ForegroundColor Gray
    Write-Host "      □ Final smoke testing" -ForegroundColor Gray
    Write-Host "      □ Deploy to production (with rollback plan)" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "PHASE 5: POST-DEPLOYMENT (Est: 1-2 hours)" -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "  5.1 Monitoring" -ForegroundColor White
    Write-Host "      □ Monitor application logs for errors" -ForegroundColor Gray
    Write-Host "      □ Verify metrics and performance" -ForegroundColor Gray
    Write-Host "      □ Check for any user-reported issues" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  5.2 Documentation" -ForegroundColor White
    Write-Host "      □ Update Rally defect $($Defect.FormattedID) with resolution notes" -ForegroundColor Gray
    Write-Host "      □ Update technical documentation if needed" -ForegroundColor Gray
    Write-Host "      □ Share lessons learned with team" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "📊 ESTIMATED TOTAL TIME: 13-24 hours (2-3 days)" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "🔧 RECOMMENDED NEXT STEPS:" -ForegroundColor Cyan
    Write-Host "  1. Create feature branch: git checkout -b fix/$($Defect.FormattedID)" -ForegroundColor White
    Write-Host "  2. Search codebase for relevant files using the defect description" -ForegroundColor White
    Write-Host "  3. Set up debugging session with reproduction steps" -ForegroundColor White
    Write-Host "  4. Review related test cases in QA folders" -ForegroundColor White
    Write-Host ""
}

# Main execution
Add-Type -AssemblyName System.Web -ErrorAction SilentlyContinue

# Fetch the defect from Rally
$defect = Get-RallyDefect -FormattedId $DefectId -ApiKey $apiKey -RallyBaseUrl $apiUrl -ProxyAddr $proxyAddress

if ($defect) {
    # Display defect details
    Show-DefectDetails -Defect $defect
    
    # Perform RCA
    Get-RootCauseAnalysis -Defect $defect
    
    # Provide implementation plan
    Get-ImplementationPlan -Defect $defect
    
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "✅ Analysis Complete!" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "💡 TIP: Use semantic search to find relevant code based on defect keywords" -ForegroundColor Magenta
    Write-Host ""
}
else {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
    Write-Host "❌ Failed to retrieve defect information from Rally" -ForegroundColor Red
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible issues:" -ForegroundColor Yellow
    Write-Host "  • API key may be invalid or expired" -ForegroundColor White
    Write-Host "  • Defect ID may not exist" -ForegroundColor White
    Write-Host "  • Network/proxy connection issues" -ForegroundColor White
    Write-Host "  • Rally service may be unavailable" -ForegroundColor White
    Write-Host ""
}
