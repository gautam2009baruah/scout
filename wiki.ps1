# Confluence API Helper Script
# Purpose: Fetch and update Confluence wiki pages using Personal Access Token

param(
    [Parameter(Mandatory=$true)]
    [string]$PageId,
    
    [Parameter(Mandatory=$false)]
    [string]$Action = "Get", # Get, Update, GetContent
    
    [Parameter(Mandatory=$false)]
    [string]$Content,
    
    [Parameter(Mandatory=$false)]
    [string]$Token,
    
    [Parameter(Mandatory=$false)]
    [string]$BaseUrl = "https://wiki.sabre.com"
)

# Load token from environment variable or integration-account.json
$configPath = Join-Path $PSScriptRoot "integration-account.json"

if ([string]::IsNullOrEmpty($Token)) {
    $Token = $env:WikiToken
    
    if ([string]::IsNullOrEmpty($Token)) {
        # Try to load from integration-account.json
        if (Test-Path $configPath) {
            try {
                $config = Get-Content $configPath -Raw | ConvertFrom-Json
                $Token = $config.wiki.token
                if (-not [string]::IsNullOrEmpty($config.wiki.baseUrl)) {
                    $BaseUrl = $config.wiki.baseUrl
                }
                
                # Check if token is placeholder text or empty
                if ([string]::IsNullOrEmpty($Token) -or $Token -like "enter your*") {
                    $Token = $null
                }
            }
            catch {
                Write-Warning "Failed to read integration-account.json: $_"
            }
        }
    }
}

# If still no token, prompt user and save to config
if ([string]::IsNullOrEmpty($Token)) {
    Write-Host "`nConfluence Personal Access Token is required." -ForegroundColor Yellow
    Write-Host "Get your token from: https://wiki.sabre.com/plugins/personalaccesstokens/usertokens.action" -ForegroundColor Cyan
    Write-Host ""
    
    $Token = Read-Host "Enter your Confluence Personal Access Token"
    
    if ([string]::IsNullOrEmpty($Token)) {
        Write-Error "Token cannot be empty. Operation cancelled."
        exit 1
    }
    
    # Save token to integration-account.json
    try {
        if (Test-Path $configPath) {
            $config = Get-Content $configPath -Raw | ConvertFrom-Json
        } else {
            $config = @{
                version = "1.0"
                rally = @{}
                wiki = @{}
            }
        }
        
        if (-not $config.wiki) {
            $config | Add-Member -NotePropertyName "wiki" -NotePropertyValue @{} -Force
        }
        
        $config.wiki.token = $Token
        if ([string]::IsNullOrEmpty($config.wiki.baseUrl)) {
            $config.wiki.baseUrl = $BaseUrl
        }
        
        $config | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8
        Write-Host "`nToken saved to integration-account.json" -ForegroundColor Green
    }
    catch {
        Write-Warning "Failed to save token to integration-account.json: $_"
        Write-Host "Token will be used for this session only." -ForegroundColor Yellow
    }
}

# Set up headers for API authentication
$headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type" = "application/json"
}

function Get-ConfluencePage {
    param([string]$PageId)
    
    try {
        $apiUrl = "$BaseUrl/rest/api/content/$PageId`?expand=body.storage,version"
        Write-Host "Fetching page: $apiUrl" -ForegroundColor Cyan
        
        $response = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $headers
        return $response
    }
    catch {
        Write-Error "Failed to fetch page: $_"
        Write-Error "Status Code: $($_.Exception.Response.StatusCode.Value__)"
        exit 1
    }
}

function Get-ConfluencePageContent {
    param([string]$PageId)
    
    $page = Get-ConfluencePage -PageId $PageId
    
    # Return structured info
    return @{
        Title = $page.title
        Content = $page.body.storage.value
        Version = $page.version.number
        SpaceKey = $page.space.key
        Id = $page.id
    }
}

function Update-ConfluencePage {
    param(
        [string]$PageId,
        [string]$NewContent,
        [string]$Title,
        [int]$Version
    )
    
    try {
        $apiUrl = "$BaseUrl/rest/api/content/$PageId"
        
        $body = @{
            version = @{
                number = $Version + 1
            }
            title = $Title
            type = "page"
            body = @{
                storage = @{
                    value = $NewContent
                    representation = "storage"
                }
            }
        } | ConvertTo-Json -Depth 10
        
        Write-Host "Updating page..." -ForegroundColor Cyan
        $response = Invoke-RestMethod -Uri $apiUrl -Method Put -Headers $headers -Body $body
        Write-Host "Page updated successfully! New version: $($response.version.number)" -ForegroundColor Green
        return $response
    }
    catch {
        Write-Error "Failed to update page: $_"
        exit 1
    }
}

# Main execution
switch ($Action) {
    "Get" {
        $page = Get-ConfluencePage -PageId $PageId
        return $page
    }
    "GetContent" {
        $pageInfo = Get-ConfluencePageContent -PageId $PageId
        Write-Host "`n=== Page: $($pageInfo.Title) ===" -ForegroundColor Green
        Write-Host "Space: $($pageInfo.SpaceKey)" -ForegroundColor Yellow
        Write-Host "Version: $($pageInfo.Version)" -ForegroundColor Yellow
        Write-Host "ID: $($pageInfo.Id)" -ForegroundColor Yellow
        Write-Host "`n=== Content ===" -ForegroundColor Green
        Write-Host $pageInfo.Content
        return $pageInfo
    }
    "Update" {
        if ([string]::IsNullOrEmpty($Content)) {
            Write-Error "Content parameter is required for Update action"
            exit 1
        }
        
        # Get current page to get version and title
        $currentPage = Get-ConfluencePageContent -PageId $PageId
        
        # Update the page
        Update-ConfluencePage -PageId $PageId -NewContent $Content -Title $currentPage.Title -Version $currentPage.Version
    }
}
