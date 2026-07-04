---
name: Tax Calculation Shopping Availability
description: Comprehensive guide to tax calculation during hotel availability/shopping in SynXis
commands: [domain, kb, workflow]
tools: []
tags: [tax, shopping, availability, hospitality, synxis, intent:GetDomainHelp, intent:Workflow]
category: domain-skill
priority: 5
---
# Tax Calculation During Shopping/Availability - SynXis System

## Document Purpose

This document provides a comprehensive guide to understanding how taxes are calculated during hotel availability and shopping requests in the SynXis Hotel Management System. It covers the complete flow from user search to tax-inclusive pricing results.

---

## Table of Contents

1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Component Details](#component-details)
4. [Tax Calculation Flow](#tax-calculation-flow)
5. [Data Structures](#data-structures)
6. [Tax Loading Process](#tax-loading-process)
7. [Daily Tax Calculation](#daily-tax-calculation)
8. [Stay Tax Calculation](#stay-tax-calculation)
9. [Tax Aggregation](#tax-aggregation)
10. [Response Formatting](#response-formatting)
11. [Advanced Scenarios](#advanced-scenarios)
12. [Performance Considerations](#performance-considerations)
13. [Troubleshooting Guide](#troubleshooting-guide)
14. [Code Examples](#code-examples)

---

## Overview

### What Happens During Shopping?

When a user searches for hotel availability, the system:

1. **Receives search criteria** (dates, guest counts, hotel)
2. **Loads applicable products** (rate/room combinations)
3. **Calculates base prices** for each night
4. **Loads all applicable taxes** for the date range
5. **Calculates taxes per night** (daily taxes)
6. **Calculates taxes per stay** (one-time charges)
7. **Aggregates totals** (room + taxes + fees)
8. **Returns results** with complete pricing breakdown

### Tax Calculation Objectives

- **Accuracy**: Taxes must be calculated correctly per jurisdiction requirements
- **Performance**: Sub-second response times for typical searches
- **Flexibility**: Support multiple tax types, levels, and configurations
- **Transparency**: Provide detailed breakdown of all charges
- **Compliance**: Meet regional tax reporting requirements

### Key Principles

1. **Hierarchical Application**: Hotel ? Room ? Rate ? Package taxes
2. **Date-Based Calculation**: Taxes can vary by date (seasons)
3. **Guest-Based Calculation**: Taxes can vary by guest count/age
4. **Inclusive vs Exclusive**: Taxes can be embedded or added to price
5. **Cascading Support**: Tax-on-tax scenarios supported

---

## High-Level Architecture

### System Components

```
---------------------------------------
?                         User Request Layer                          ?
?  (Shopping API, OTA Channels, Direct Booking, GDS Interfaces)       ?
---------------------------------------
                             ?
                             ?
---------------------------------------
?                     Shopping Engine Service                         ?
?         (SHS.Services.ShoppingEngine.ShoppingEngineService)         ?
---------------------------------------
                             ?
                             ?
---------------------------------------
?                      Availability Checker                           ?
?    (Synxis.Enterprise.Business.AvailabilityChecking)                ?
?                                                                     ?
?  ---------------------------------------  ---------------------------------------  ---------------------------------------               ?
?  ?  Data Loader ?  ?   Products   ?  ?   Result     ?               ?
?  ?              -> ?   Checker    -> ?   Preparer   ?               ?
?  ---------------------------------------  ---------------------------------------  ---------------------------------------               ?
---------------------------------------
                             ?
                             ?
---------------------------------------
?                        Tax Subsystem                                ?
?                                                                     ?
?  ---------------------------------------  ---------------------------------------  ---------------------------------------    ?
?  ?   Tax Data       ?  ?  Tax Evaluator   ?  ?  Tax Evaluator  ?    ?
?  ?   Loader         -> ?  Helper          -> ?  (Engine)       ?    ?
?  ---------------------------------------  ---------------------------------------  ---------------------------------------    ?
---------------------------------------
                             ?
                             ?
---------------------------------------
?                        Database Layer                               ?
?  (Tax Configuration, Seasons, Assignments, Exemptions)              ?
---------------------------------------
```

### Data Flow

```
User Search ? Shopping Engine ? Availability Checker ? Tax Calculator ? Results
     ?              ?                    ?                    ?            ?
 Criteria    Build Criteria      Load Products      Calculate Taxes   Format
   Input      & Validate         & Tax Data         Per Product       Response
```

---

## Component Details

### 1. ShoppingEngine Service

**Location**: `Services\Engines\SHS.Services.ShoppingEngine\ShoppingEngineService.cs`

**Responsibilities**:
- Receives shopping requests from various channels
- Validates search criteria
- Calls availability checker
- Transforms results to appropriate format
- Returns response with pricing

**Key Method**:
```csharp
public class ShoppingEngineService
{
    public AvailabilityResultDto CheckAvailability(SearchCriteriaDto criteria)
    {
        // 1. Validate and normalize criteria
        ValidateCriteria(criteria);
        
        // 2. Build internal availability criteria
        AvailabilityCriteria availCriteria = BuildCriteria(criteria);
        
        // 3. Execute availability check (includes tax calculation)
        IAvailabilityResult result = 
            AvailabilityChecker.Instance.Check(availCriteria, CheckType.Standard);
        
        // 4. Transform to response DTO
        AvailabilityResultDto response = MapToDto(result);
        
        return response;
    }
}
```

### 2. AvailabilityChecker

**Location**: `Synxis.Enterprise.Business.AvailabilityChecking.AvailabilityChecker`

**Responsibilities**:
- Orchestrates availability checking workflow
- Coordinates data loading
- Manages product checking process
- Prepares final results

**Key Method**:
```csharp
internal IAvailabilityResult Check(
    AvailabilityCriteria criteria, 
    CheckType type)
{
    var result = new AvailabilityResult();
    
    // 1. Validate basic criteria (dates, hotel, etc.)
    if (!ValidateBasics(criteria, result))
        return result;
    
    // 2. Load products (rate/room combinations)
    ProductList products = LoadProducts(criteria, result, type);
    
    if (!ValidateProductResult(products, result))
        return result;
    
    // 3. Check products (includes tax calculation)
    CheckProducts(products, criteria, result, type);
    
    // 4. Prepare and sort results
    PrepareResults(products, criteria, result, type);
    
    return result;
}
```

### 3. DataLoader

**Location**: `Synxis.Enterprise.Business.AvailabilityChecking.DataLoader`

**Responsibilities**:
- Loads tax data from database
- Caches tax information
- Filters taxes by date, channel, assignments
- Provides tax data to evaluators

**Key Methods**:
```csharp
internal static void LoadAvailabilityTaxesData(
    AvailabilityCriteria criteria, 
    AvailabilityData data, 
    CheckType type)
{
    // Load all applicable taxes for the search
    using (IDataReader dr = GetTaxesDataReader(criteria, type))
    {
        while (dr.Read())
        {
            TaxAvailabilityData taxData = TaxAvailabilityData.From(dr);
            
            // Categorize by tax level
            switch (taxData.Level)
            {
                case TaxLevel.Hotel:
                    data.HotelTaxes.Add(taxData);
                    break;
                case TaxLevel.Room:
                    data.RoomTaxes[taxData.RoomUniqueID].Add(taxData);
                    break;
                case TaxLevel.Rate:
                    data.RateTaxes[taxData.RateUniqueID].Add(taxData);
                    break;
                case TaxLevel.Package:
                    data.PackageTaxes[taxData.PackageUniqueId].Add(taxData);
                    break;
            }
        }
    }
}
```

### 4. ProductsChecker

**Location**: `Synxis.Enterprise.Business.AvailabilityChecking.Workers.ProductsChecker`

**Responsibilities**:
- Coordinates all product checking workflows
- Executes product-specific checkers
- Manages checker execution order
- Tracks performance metrics

**Key Method**:
```csharp
internal void Check(
    ProductList products, 
    AvailabilityCriteria criteria, 
    AvailabilityResult result, 
    CheckType type)
{
    // 1. Load availability data including taxes
    AvailabilityData data = GetAvailabilityData(criteria, products, result, type);
    DataLoader.LoadAvailabilityTaxesData(criteria, data, type);
    
    // 2. Run pre-list checkers
    IList checkers = checkerFactory.GetPreListCheckers(criteria);
    LoopProductListCheckersList(products, criteria, data, checkers, result);
    
    // 3. Run product checkers (includes RateProductChecker with tax calculation)
    checkers = checkerFactory.GetCheckers(criteria);
    LoopProductCheckersList(products, criteria, data, checkers, result);
    
    // 4. Run post-list checkers
    checkers = checkerFactory.GetListCheckers(criteria);
    LoopProductListCheckersList(products, criteria, data, checkers, result);
}
```

### 5. TaxEvaluatorHelper

**Location**: `Synxis.Enterprise.Business.AvailabilityChecking.Workers.TaxEvaluatorHelper`

**Responsibilities**:
- Primary tax calculation orchestrator
- Calls core tax evaluator
- Handles daily and stay taxes
- Manages tax recalculation scenarios

**Key Methods**:
```csharp
// Daily tax evaluation
internal static decimal EvaluateDailyTaxes(
    AvailabilityCriteria criteria, 
    AvailabilityData data, 
    DailyProduct dailyProduct, 
    CalendarDate date, 
    TaxDailyResult dr, 
    ref bool checkStayTaxes,
    int adultOccupancy,
    int lengthOfStay,
    ChildAgeRangeBreakdown childBreakdown,
    int failureDateID,
    bool evaluateForArrivalDate,
    TaxDailyResult dailyResultLoyaltyPoints = null)
{
    // Calculate taxes for a specific night
    TaxEvaluatedDetail taxDetail = TaxEvaluator.Instance.EvaluateDailyTaxes(
        context,
        criteria,
        data,
        date,
        price,
        externalRatePrice,
        dailyProduct.RateUniqueID,
        dailyProduct.RoomUniqueID,
        notifyOfTax,
        adultOccupancy,
        lengthOfStay,
        childBreakdown,
        primaryChannelID,
        notifyOfDailyTax,
        dayItemEvents
    );
    
    // Store results and return price with taxes
    return taxDetail.PriceWithTaxesAndFees;
}

// Stay tax evaluation
internal static void EvaluateStayTaxes(
    AvailabilityCriteria criteria,
    ResultItem product,
    ResultItem externalRateProduct,
    ITaxDataHolder data,
    int adultQty,
    int lengthOfStay,
    ChildAgeRangeBreakdown childBreakdown)
{
    // Calculate one-time per-stay taxes
    TaxEvaluator.Instance.EvaluateStayTaxes(
        context,
        criteria,
        data,
        product.BookingData,
        externalRateBookingData,
        notifyOfTax,
        addStayTaxToDailyPrice,
        adultQty,
        lengthOfStay,
        childBreakdown,
        primaryChannelID,
        minAdultQuantity,
        minChildOccupancy,
        usesChildOccupancy
    );
}
```

### 6. TaxEvaluator (Core Engine)

**Location**: `Synxis.Enterprise.Business.Taxes.TaxEvaluator`

**Responsibilities**:
- Core tax calculation logic
- Handles all tax types and configurations
- Applies tax rules (inclusive, exclusive, cascading)
- Calculates final tax amounts

**Key Method**:
```csharp
internal TaxEvaluatedDetail EvaluateDailyTaxes(
    TaxEvaluationContextPO contextPO,
    AvailabilityCriteriaPO criteriaPO,
    ITaxDataHolder data,
    CalendarDate date,
    decimal price,
    decimal? externalRatePrice,
    Guid rateUniqueID,
    Guid roomUniqueID,
    NotifyOfTaxMethod notifyOfTax,
    int adultQty,
    int lengthOfStay,
    ChildAgeRangeBreakdown childBreakdown,
    int primaryChannelID,
    NotifyOfDailyTax notifyOfDailyTax,
    IList<VerboseAvailabilityEvent> dayItemEvents,
    decimal? pointsEquivalentCashPrice = null,
    ResultItem resultItem = null,
    IList<ExemptableTax> manualExemptTaxes = null)
{
    // Use new tax engine for calculation
    var result = TaxEngine.ProductTaxEvaluator.CalculateTaxList(
        taxes.Select(x => BuildSeasonalProductTax(x, primaryChannelID)),
        exemptedTaxes.EmptyWhenNull().Select(MapExemptableTax),
        BuildTaxEvaluationContext(contextPO, isEnabledForPrepaidTax),
        BuildProductTaxEvaluationCriteria(criteriaPO, adultQty, lengthOfStay, frequency, date, childBreakdown),
        BuildProductPricingData(price, totalPrice, totalPriceBeforeExclusiveTaxes, externalRatePrice, pointsEquivalentCashPrice),
        eventData,
        BuildTaxEvaluationCallbacks(notifyOfTax, notifyOfDailyTax, handleInclusiveStayTaxDailyAdjustment)
    );
    
    return BuildTaxEvaluatedDetail(result, rateCurrencyID);
}
```

---

## Tax Calculation Flow

### Complete Flow Diagram

```
---------------------------------------
? PHASE 1: REQUEST RECEPTION                                          ?
---------------------------------------
?                                                                      ?
?  User Search Request                                                ?
?    ?                                                                ?
?  Shopping Engine validates criteria                                 ?
?    ?                                                                ?
?  Build AvailabilityCriteria object                                 ?
?    - Start/End dates                                               ?
?    - Guest counts (adults, children + ages)                        ?
?    - Number of rooms                                               ?
?    - Hotel ID                                                      ?
?    - Channel/Access codes                                          ?
?                                                                      ?
---------------------------------------
                               ?
                               ?
---------------------------------------
? PHASE 2: PRODUCT LOADING                                            ?
---------------------------------------
?                                                                      ?
?  AvailabilityChecker.Check()                                        ?
?    ?                                                                ?
?  DataLoader.GetProductList()                                       ?
?    - Query all available rate/room combinations                    ?
?    - Filter by requested dates                                     ?
?    - Apply channel restrictions                                    ?
?    - Apply access code restrictions                                ?
?    ?                                                                ?
?  Result: ProductList (50+ products typical)                        ?
?                                                                      ?
---------------------------------------
                               ?
                               ?
---------------------------------------
? PHASE 3: TAX DATA LOADING                                           ?
---------------------------------------
?                                                                      ?
?  DataLoader.LoadAvailabilityTaxesData()                            ?
?    ?                                                                ?
?  SQL Query:                                                         ?
?    SELECT Tax.*, TaxSeason.*                                       ?
?    FROM Hotel_Tax Tax                                              ?
?    INNER JOIN Hotel_Tax_Season TaxSeason                           ?
?      ON Tax.UniqueID = TaxSeason.TaxUniqueID                      ?
?    LEFT JOIN Hotel_Tax_Rate RateTax                               ?
?      ON Tax.UniqueID = RateTax.TaxUniqueID                        ?
?    LEFT JOIN Hotel_Tax_Room RoomTax                               ?
?      ON Tax.UniqueID = RoomTax.TaxUniqueID                        ?
?    WHERE                                                            ?
?      Tax.HotelUniqueID = :hotelGuid                               ?
?      AND TaxSeason.StartCalendarID <= :endDate                    ?
?      AND TaxSeason.EndCalendarID >= :startDate                    ?
?      AND (channel/access filters)                                  ?
?    ?                                                                ?
?  Categorize taxes:                                                 ?
?    - Hotel level taxes (apply to all)                             ?
?    - Room level taxes (specific rooms)                            ?
?    - Rate level taxes (specific rates)                            ?
?    - Package level taxes (specific packages)                      ?
?    ?                                                                ?
?  Cache in AvailabilityData object                                 ?
?                                                                      ?
---------------------------------------
                               ?
                               ?
---------------------------------------
? PHASE 4: PER-PRODUCT PROCESSING                                     ?
---------------------------------------
?                                                                      ?
?  FOR EACH Product (Rate/Room combination):                         ?
?    ?                                                                ?
?    RateProductChecker.CheckProduct()                               ?
?      ?                                                              ?
?      Calculate base prices for each night                          ?
?        - Get season prices                                         ?
?        - Apply derived pricing                                     ?
?        - Apply promotions                                          ?
?      ?                                                              ?
?      FOR EACH Night in stay:                                       ?
?        ?                                                            ?
?        TaxEvaluatorHelper.EvaluateDailyTaxes()                    ?
?          ?                                                          ?
?          Get applicable taxes for this date:                       ?
?            - Hotel taxes (always)                                  ?
?            - Room taxes (if assigned to this room)                ?
?            - Rate taxes (if assigned to this rate)                ?
?          ?                                                          ?
?          TaxEvaluator.EvaluateDailyTaxes()                        ?
?            ?                                                        ?
?            FOR EACH Tax:                                           ?
?              ?                                                      ?
?              1. Check if tax applies:                             ?
?                 - Date in season range?                           ?
?                 - Price in range (if specified)?                  ?
?                 - LOS in range (if specified)?                    ?
?              ?                                                      ?
?              2. Determine base amount:                            ?
?                 - If CalculateFromBase: use room price           ?
?                 - If CalculateFromSubtotal: use subtotal         ?
?                 - Else: use running total                        ?
?              ?                                                      ?
?              3. Calculate tax amount:                             ?
?                 IF Percentage:                                    ?
?                   amount = base * (percent / 100)                ?
?                 ELSE (Fixed):                                     ?
?                   amount = configured amount                     ?
?              ?                                                      ?
?              4. Apply charge type multiplier:                     ?
?                 IF PerPerson:                                     ?
?                   amount *= (adults + children)                  ?
?                 ELSE IF PerAdult:                                 ?
?                   amount *= adults                               ?
?                 ELSE IF PerChild:                                 ?
?                   amount *= children                             ?
?                 ELSE IF PerRoom:                                  ?
?                   amount *= room count                           ?
?              ?                                                      ?
?              5. Apply guest age offsets (if configured):         ?
?                 - Adjust for child ages                          ?
?                 - Apply senior discounts                         ?
?              ?                                                      ?
?              6. Apply ceiling (if configured):                    ?
?                 IF amount > ceiling:                             ?
?                   amount = ceiling                               ?
?              ?                                                      ?
?              7. Categorize as tax or fee:                        ?
?                 IF tax type is fee-type:                         ?
?                   Add to fees                                    ?
?                 ELSE:                                             ?
?                   Add to taxes                                   ?
?              ?                                                      ?
?              8. Handle inclusive/exclusive:                       ?
?                 IF IsInclusive:                                   ?
?                   Extract from price                             ?
?                 ELSE:                                             ?
?                   Add to price                                   ?
?              ?                                                      ?
?              9. Update running totals:                            ?
?                 - Add to tax/fee totals                          ?
?                 - Update subtotals (if configured)               ?
?            ?                                                        ?
?            Return TaxEvaluatedDetail                              ?
?          ?                                                          ?
?          Store in DayItem:                                        ?
?            - Base price                                           ?
?            - Tax amount                                           ?
?            - Fee amount                                           ?
?            - Price with taxes and fees                           ?
?            - Inclusive tax amount                                ?
?                                                                      ?
---------------------------------------
                               ?
                               ?
---------------------------------------
? PHASE 5: STAY TAX CALCULATION                                       ?
---------------------------------------
?                                                                      ?
?  After all daily taxes calculated:                                 ?
?    ?                                                                ?
?    TaxEvaluatorHelper.EvaluateStayTaxes()                         ?
?      ?                                                              ?
?      Get stay-level taxes (ChargeFrequency = PerStay)            ?
?      ?                                                              ?
?      Calculate total price for stay:                              ?
?        totalPrice = Sum of all night prices                       ?
?        totalPriceWithTaxes = Sum of all night prices with taxes  ?
?      ?                                                              ?
?      TaxEvaluator.GetStayTaxes()                                  ?
?        ?                                                            ?
?        FOR EACH Stay Tax:                                         ?
?          ?                                                          ?
?          Use same calculation logic as daily taxes                ?
?          BUT base = total stay price                             ?
?          ?                                                          ?
?          Calculate tax amount (one time for entire stay)         ?
?        ?                                                            ?
?        Return stay tax totals                                     ?
?      ?                                                              ?
?      IF addStayTaxToDailyPrice:                                   ?
?        Distribute stay tax across nights                          ?
?        stayTaxPerNight = stayTaxAmount / numberOfNights          ?
?        Add to each DayItem                                        ?
?      ?                                                              ?
?      Store stay tax amounts in ProductBookingData                ?
?                                                                      ?
---------------------------------------
                               ?
                               ?
---------------------------------------
? PHASE 6: AGGREGATION & TOTALING                                     ?
---------------------------------------
?                                                                      ?
?  ProductBookingData.CalculatePrices()                              ?
?    ?                                                                ?
?    Calculate totals from all DayItems:                            ?
?      ?                                                              ?
?      TotalPrice = Sum of all DayItem.Price                        ?
?      TotalTaxAmount = Sum of all DayItem.TaxAmount               ?
?      TotalFeeAmount = Sum of all DayItem.FeeAmount               ?
?      TotalPriceWithTaxesAndFees = Sum of DayItem.PriceWithTaxesAndFees ?
?      ?                                                              ?
?    Add stay taxes:                                                 ?
?      TotalTaxAmount += StayTaxAmount                              ?
?      TotalFeeAmount += StayFeeAmount                              ?
?      TotalPriceWithTaxesAndFees += (StayTaxAmount + StayFeeAmount) ?
?      ?                                                              ?
?    Calculate averages:                                            ?
?      AveragePrice = TotalPrice / NumberOfNights                   ?
?      AveragePriceWithTaxesAndFees = TotalPriceWithTaxesAndFees / NumberOfNights ?
?      ?                                                              ?
?    Separate pay-at-property vs prepaid:                           ?
?      FOR EACH Tax:                                                ?
?        IF IsPayAtProperty:                                        ?
?          TotalPayAtPropertyAmount += amount                      ?
?        ELSE:                                                       ?
?          TotalPayableNowAmount += amount                         ?
?      ?                                                              ?
?    Build tax breakdown list:                                      ?
?      Group taxes by code                                          ?
?      Consolidate consecutive date ranges                          ?
?      Create ChargeBreakdown entries                              ?
?                                                                      ?
---------------------------------------
                               ?
                               ?
---------------------------------------
? PHASE 7: RESPONSE FORMATTING                                        ?
---------------------------------------
?                                                                      ?
?  ShoppingEngine maps to response DTO:                              ?
?    ?                                                                ?
?    FOR EACH Available Product:                                     ?
?      ?                                                              ?
?      ProductDto:                                                   ?
?        - RateCode, RoomCode                                       ?
?        - Rate/Room descriptions                                   ?
?        ?                                                            ?
?        ProductBookingDataDto:                                     ?
?          - TotalPrice                                             ?
?          - TotalPriceWithTaxesAndFees                            ?
?          - TaxAmount                                              ?
?          - FeeAmount                                              ?
?          - StayTaxAmount                                          ?
?          - StayFeeAmount                                          ?
?          - AveragePrice                                           ?
?          - AveragePriceWithTaxesAndFees                          ?
?          - TotalPayableNowAmount                                  ?
?          - TotalPayAtPropertyAmount                               ?
?          ?                                                          ?
?          DayItems[] (per night breakdown):                        ?
?            - Date                                                 ?
?            - Price                                                ?
?            - TaxAmount                                            ?
?            - FeeAmount                                            ?
?            - PriceWithTaxesAndFees                               ?
?            - AreTaxesAndFeesIncluded                             ?
?          ?                                                          ?
?          TaxDetails:                                              ?
?            - TotalTaxAmount                                       ?
?            - TotalStayTaxAmount                                   ?
?            - AverageTaxAmount                                     ?
?            ?                                                        ?
?            TaxesBreakdown[] (itemized):                          ?
?              - Code (e.g., "OCCTAX")                            ?
?              - Type (e.g., "OccupancyTax")                      ?
?              - Level (Hotel/Room/Rate)                          ?
?              - Amount                                            ?
?              - IsPerStay                                         ?
?              - IsPayAtProperty                                   ?
?              - IsInclusive                                       ?
?          ?                                                          ?
?          FeeDetails:                                              ?
?            - TotalFeeAmount                                       ?
?            - FeesBreakdown[] (same structure as taxes)           ?
?    ?                                                                ?
?    Return AvailabilityResultDto                                   ?
?                                                                      ?
---------------------------------------
```

### Simplified Sequence

```
1. User searches for hotel (dates, guests)
   ?
2. Load available rate/room products
   ?
3. Load all applicable taxes for date range
   ?
4. For each product:
   ?
5.   For each night:
   ?
6.     Calculate base price
   ?
7.     Calculate daily taxes
   ?
8.     Store in DayItem
   ?
9.   Calculate stay taxes (one-time)
   ?
10.  Aggregate all amounts
   ?
11. Format and return results
```

---

## Data Structures

### TaxAvailabilityData

**Purpose**: In-memory representation of tax loaded from database

**Location**: `Synxis.Enterprise.Business.AvailabilityChecking.InternalData.TaxAvailabilityData`

```csharp
internal class TaxAvailabilityData
{
    // Identity
    public Guid TaxUniqueID { get; }
    public string Name { get; }
    public string Description { get; }
    
    // Tax Type
    public int TaxType { get; }              // e.g., OccupancyTax, ResortFee
    public TaxLevel Level { get; }           // Hotel, Room, Rate, Package
    
    // Assignment
    public Guid RoomUniqueID { get; }        // If room-level tax
    public Guid RateUniqueID { get; }        // If rate-level tax
    public Guid PackageUniqueId { get; }     // If package-level tax
    
    // Date Range (Season)
    public int StartCalendarID { get; }
    public int EndCalendarID { get; }
    
    // Calculation Configuration
    public ChargeType ChargeType { get; }    // FlatCharge, PerPerson, PerAdult, etc.
    public int FrequencyTypeID { get; }      // PerNight or PerStay
    public decimal Amount { get; }           // Fixed amount
    public decimal Percent { get; }          // Percentage value
    public decimal? Ceiling { get; }         // Maximum amount cap
    
    // Calculation Behavior
    public bool CalcFromBase { get; }        // Calculate from base price vs running total
    public int CalculateFromSubtotal { get; } // Which subtotal to use
    public string AddToSubtotals { get; }    // Comma-separated subtotal IDs
    
    // Inclusive/Exclusive
    public bool IsInclusive { get; }
    public int? TaxInclusiveTypeID { get; }
    
    // Advanced Features
    public bool ApplyToFreeNights { get; }
    public bool IsPayAtProperty { get; }
    public int SortOrder { get; }
    
    // Price/LOS Filtering
    public bool IsPriceRangeSpecific { get; }
    public decimal? MinDailyPrice { get; }
    public decimal? MaxDailyPrice { get; }
    public int? MinLengthOfStay { get; }
    public int? MaxLengthOfStay { get; }
    
    // Exemption
    public Guid? ExemptReasonUniqueID { get; }
    public bool IsExemptable { get; }
}
```

### DayItem (Result Storage)

**Purpose**: Stores calculated pricing for one night

**Location**: `Synxis.Enterprise.Business.Reservations.DayItem`

```csharp
public class DayItem : DayItemBase
{
    // Date
    public CalendarDate Date { get; set; }
    
    // Base Pricing
    public decimal Price { get; set; }               // Room price for the night
    public decimal BasePrice { get; set; }           // Original base before adjustments
    public decimal OriginalPrice { get; set; }       // Before promotions
    
    // Tax & Fee Amounts
    public decimal TaxAmount { get; set; }           // Daily taxes
    public decimal FeeAmount { get; set; }           // Daily fees
    public decimal PriceWithTaxesAndFees { get; set; } // Total for this night
    
    // Inclusive Tax Handling
    public decimal PriceWithInclusiveTax { get; set; }
    public decimal AppliedInclusiveTaxes { get; set; }
    
    // Slash-Through Pricing
    public bool IsSlashThru { get; set; }
    public decimal OriginalPriceWithTaxesAndFees { get; set; }
    
    // Tax Details
    public IEnumerable<TaxDetailDto> TaxDetails { get; set; }
    
    // Loyalty Points
    public int? LoyaltyPointsValue { get; set; }
    
    // Inventory
    public int AvailableInventory { get; set; }
    
    // Methods
    internal void SetPricingInfo(
        decimal basePrice,
        decimal price,
        decimal priceWithTaxesAndFees,
        decimal taxes,
        decimal fees,
        decimal originalPrice,
        decimal priceWithInclusiveTaxes,
        decimal appliedInclusiveTaxes)
    {
        this.BasePrice = basePrice;
        this.Price = price;
        this.PriceWithTaxesAndFees = priceWithTaxesAndFees;
        this.TaxAmount = taxes;
        this.FeeAmount = fees;
        this.OriginalPrice = originalPrice;
        this.PriceWithInclusiveTax = priceWithInclusiveTaxes;
        this.AppliedInclusiveTaxes = appliedInclusiveTaxes;
    }
}
```

### ProductBookingData (Aggregated Results)

**Purpose**: Aggregates all pricing for entire stay

**Location**: `Synxis.Enterprise.Business.Reservations.ProductBookingData`

```csharp
public class ProductBookingData : IProductBookingData
{
    // Nightly Totals
    public decimal TotalPrice { get; }                      // Sum of all nights base price
    public decimal TotalPriceWithTaxesAndFees { get; }     // Grand total
    public decimal TotalTaxAmount { get; }                  // Sum of daily taxes
    public decimal TotalFeeAmount { get; }                  // Sum of daily fees
    
    // Stay Totals (one-time charges)
    public decimal StayTaxAmount { get; }                   // Per-stay taxes
    public decimal StayFeeAmount { get; }                   // Per-stay fees
    
    // Averages
    public decimal AveragePrice { get; }                    // Average nightly base price
    public decimal AveragePriceWithTaxesAndFees { get; }   // Average nightly total
    public decimal AverageTaxAmount { get; }                // Average tax per night
    
    // First/Highest/Lowest Night
    public decimal FirstNightPrice { get; }
    public decimal FirstNightPriceWithTaxesAndFees { get; }
    public decimal HighestPrice { get; }
    public decimal HighestPriceWithTaxesAndFees { get; }
    public decimal LowestPrice { get; }
    public decimal LowestPriceWithTaxesAndFees { get; }
    
    // Inclusive Tax Totals
    public decimal TotalPriceWithInclusiveTax { get; }
    public decimal TotalNonRedeemablePriceWithInclusiveTax { get; }
    
    // Payment Split
    public decimal TotalPayAtPropertyAmount { get; }        // Pay at hotel
    public decimal TotalPayableNowAmount { get; }           // Prepaid
    
    // Loyalty Points
    public int? TotalLoyaltyPoints { get; }
    public int? TotalTaxPoints { get; }
    public int? TotalFeePoints { get; }
    public int? TotalStayTaxPoints { get; }
    public int? TotalStayFeePoints { get; }
    
    // Rate Change Detection
    public bool HasRateChange { get; }
    public bool HasRateChangeWithTaxesAndFees { get; }
    
    // Collections
    public ICollection DayItems { get; }                    // DayItem per night
    public IDictionary<int, IList<TaxItem>> OccupancyTaxItems { get; }
    public IList<TaxItem> TaxItems { get; }
    
    // Slash-Through
    public bool HasSlashThru { get; }
    public decimal TotalSlashThruPrice { get; }
    public decimal TotalSlashThruPriceWithTaxesAndFees { get; }
    
    // Methods
    internal void CalculatePrices()
    {
        // Aggregate all DayItem amounts
        // Calculate averages
        // Determine min/max/first night values
    }
}
```

### TaxDetailsBE (Response DTO)

**Purpose**: Tax breakdown in API response

**Location**: `SHS.Contracts.ShoppingEngine.Response.TaxDetailsBE`

```csharp
public class TaxDetailsBE
{
    // Summary Amounts
    public decimal TotalTaxAmount { get; set; }
    public decimal TotalStayTaxAmount { get; set; }
    public decimal AverageTaxAmount { get; set; }
    public int TotalTaxPoints { get; set; }
    
    // Itemized Breakdown
    public ChargeBreakdownBE[] TaxesBreakdown { get; set; }
}
```

### ChargeBreakdownBE (Individual Tax Entry)

**Purpose**: Details for one tax in the breakdown

**Location**: `SHS.Contracts.ShoppingEngine.Response.ChargeBreakdownBE`

```csharp
public class ChargeBreakdownBE
{
    // Identity
    public string Code { get; set; }                 // Tax code (e.g., "OCCTAX")
    public TaxTypeBE Type { get; set; }             // Tax type enum
    public TaxLevelBE Level { get; set; }           // Hotel/Room/Rate/Package
    
    // Amount
    public decimal Amount { get; set; }              // Tax amount
    public decimal? OriginalAmount { get; set; }     // Before overrides
    
    // Loyalty Points
    public int? Points { get; set; }
    public int? OriginalPoints { get; set; }
    
    // Configuration Flags
    public bool IsPerStay { get; set; }              // Per-stay vs per-night
    public bool IsPayAtProperty { get; set; }        // Pay at hotel vs prepaid
    public bool IsInclusive { get; set; }            // Inclusive in rate price
    
    // Exemption Info
    public TaxExemptTypeBE? ExemptType { get; set; }
    public string ExemptReason { get; set; }
}
```

### TaxEvaluatedDetail (Calculation Result)

**Purpose**: Result of tax calculation for one night or stay

**Location**: `Synxis.Enterprise.Business.Taxes.TaxEvaluatedDetail`

```csharp
public class TaxEvaluatedDetail
{
    // Calculated Amounts
    public decimal Price { get; set; }                      // Base price (adjusted for inclusive)
    public decimal Taxes { get; set; }                      // Tax amount
    public decimal Fees { get; set; }                       // Fee amount
    public decimal PriceWithTaxesAndFees { get; set; }     // Total
    
    // Inclusive Tax Details
    public decimal AppliedInclusiveTaxes { get; set; }
    public decimal PriceWithInclusiveTaxes { get; set; }
    
    // Pay at Property
    public decimal PayAtPropertyAmount { get; set; }
    
    // Loyalty Points
    public int TaxPoints { get; set; }
    public int FeePoints { get; set; }
    
    // Array Format (for compatibility)
    public decimal[] TaxAmounts { get; set; }
    /*
     * Index mapping:
     * [0] = PriceWithTaxesAndFees
     * [1] = Taxes
     * [2] = Fees
     * [3] = Price
     * [4] = AppliedInclusiveTaxes
     * [5] = PriceWithInclusiveTaxes
     * [6] = PayAtPropertyAmount
     */
    
    // Total Tax Amount
    public decimal TotalTaxAmount { get; set; }
    
    // Verbose Events (for debugging)
    public IList<VerboseAvailabilityEvent> Events { get; set; }
    public IList<VerboseAvailabilityEvent> EvaluationEvents { get; set; }
    
    // Tax List Evaluation Data
    public IEnumerable<TaxEvaluationData> TaxListEvaluationData { get; set; }
}
```

---

## Tax Loading Process

### Database Schema

**Key Tables**:

```sql
-- Main tax definition
Hotel_Tax
  - UniqueID (PK)
  - HotelUniqueID (FK)
  - Code
  - Name
  - Description
  - TaxTypeID
  - TaxLevelID (Hotel/Room/Rate/Package)
  - ChargeTypeID
  - FrequencyTypeID (PerNight/PerStay)
  - IsInclusive
  - ApplyToFreeNights
  - IsPayAtProperty
  - InclusiveTypeID
  - CalculateFromBase
  - CalculateFromSubtotal
  - AddToSubtotals
  - SortOrder

-- Tax seasons (date-ranged configurations)
Hotel_Tax_Season
  - UniqueID (PK)
  - TaxUniqueID (FK)
  - StartCalendarID
  - EndCalendarID
  - Amount (fixed amount)
  - Percent (percentage value)
  - Ceiling (maximum amount)
  - IsPriceRangeSpecific
  - MinDailyPrice
  - MaxDailyPrice
  - MinLengthOfStay
  - MaxLengthOfStay
  - FactorTypeID (Percentage/Amount)

-- Room assignments
Hotel_Tax_Room
  - TaxUniqueID (FK)
  - RoomUniqueID (FK)

-- Rate assignments
Hotel_Tax_Rate
  - TaxUniqueID (FK)
  - RateUniqueID (FK)
  - ExemptReasonUniqueID (for exemptions)

-- Package assignments
Hotel_Tax_Package
  - TaxUniqueID (FK)
  - PackageUniqueID (FK)

-- Guest age offsets
Hotel_Tax_Guest_Offset
  - TaxUniqueID (FK)
  - ChildAgeRangeID
  - OffsetPercent
  - OffsetAmount
  - OffsetTypeID
```

### SQL Query

```sql
SELECT 
    -- Tax Identity
    Tax.UniqueID AS TaxUniqueID,
    Tax.Code,
    Tax.Name,
    Tax.Description,
    
    -- Tax Type & Level
    Tax.TaxTypeID,
    Tax.TaxLevelID AS Level,
    
    -- Assignments
    RoomTax.RoomUniqueID,
    RateTax.RateUniqueID,
    PackageTax.PackageUniqueID,
    
    -- Season Date Range
    TaxSeason.StartCalendarID,
    TaxSeason.EndCalendarID,
    
    -- Amount Configuration
    TaxSeason.Amount,
    TaxSeason.Percent,
    TaxSeason.Ceiling,
    TaxSeason.FactorTypeID,
    
    -- Charge Configuration
    Tax.ChargeTypeID AS ChargeType,
    Tax.FrequencyTypeID,
    
    -- Calculation Behavior
    Tax.CalculateFromBase AS CalcFromBase,
    Tax.CalculateFromSubtotal,
    Tax.AddToSubtotals,
    
    -- Inclusive/Exclusive
    Tax.IsInclusive,
    Tax.InclusiveTypeID AS TaxInclusiveTypeID,
    
    -- Advanced Features
    Tax.ApplyToFreeNights,
    Tax.IsPayAtProperty,
    Tax.SortOrder,
    
    -- Price/LOS Filtering
    TaxSeason.IsPriceRangeSpecific,
    TaxSeason.MinDailyPrice,
    TaxSeason.MaxDailyPrice,
    TaxSeason.MinLengthOfStay,
    TaxSeason.MaxLengthOfStay,
    
    -- Exemption
    RateTax.ExemptReasonUniqueID

FROM Hotel_Tax Tax

-- Tax seasons (required)
INNER JOIN Hotel_Tax_Season TaxSeason 
    ON Tax.UniqueID = TaxSeason.TaxUniqueID

-- Room assignments (optional)
LEFT JOIN Hotel_Tax_Room RoomTax 
    ON Tax.UniqueID = RoomTax.TaxUniqueID

-- Rate assignments (optional)
LEFT JOIN Hotel_Tax_Rate RateTax 
    ON Tax.UniqueID = RateTax.TaxUniqueID

-- Package assignments (optional)
LEFT JOIN Hotel_Tax_Package PackageTax 
    ON Tax.UniqueID = PackageTax.TaxUniqueID

WHERE 
    -- Hotel filter
    Tax.HotelUniqueID = :hotelGuid
    
    -- Date range filter (seasons that overlap search dates)
    AND TaxSeason.StartCalendarID <= :endDateCalendarID
    AND TaxSeason.EndCalendarID >= :startDateCalendarID
    
    -- Active taxes only
    AND Tax.IsActive = 1
    AND TaxSeason.IsActive = 1
    
    -- Channel/Access code filters (if applicable)
    AND (channel access code logic here)

ORDER BY 
    Tax.SortOrder,
    TaxSeason.StartCalendarID
```

### Caching Strategy

```csharp
// Cache key structure
string cacheKey = $"TaxData_{hotelUniqueID}_{startDate}_{endDate}_{channelID}";

// Cache lookup
AvailabilityData cachedData = cache.Get<AvailabilityData>(cacheKey);

if (cachedData != null)
{
    // Use cached tax data
    return cachedData;
}

// Load from database
AvailabilityData data = LoadTaxDataFromDatabase(criteria);

// Cache for 10 minutes (configurable)
cache.Add(cacheKey, data, TimeSpan.FromMinutes(10));

return data;
```

**Cache Invalidation**:
- On tax configuration changes
- On tax season modifications
- On tax assignment changes
- Manual invalidation via admin tools

### Loading Performance

**Typical Metrics**:
- **Small hotel** (5 taxes, 2 seasons each): 10-20ms
- **Medium hotel** (15 taxes, 3 seasons each): 30-50ms
- **Large hotel** (30+ taxes, 5+ seasons each): 80-150ms
- **With cache hit**: <1ms

**Optimization Techniques**:
1. Single SQL query loads all taxes at once
2. Result caching per hotel/date range
3. Indexed database columns (HotelUniqueID, StartCalendarID, EndCalendarID)
4. Minimal data transformation

---

## Daily Tax Calculation

### Calculation Algorithm

```csharp
// Pseudo-code for daily tax calculation

public TaxEvaluatedDetail CalculateDailyTaxes(
    CalendarDate date,
    decimal basePrice,
    Guid rateUniqueID,
    Guid roomUniqueID,
    int adultCount,
    int childCount,
    int lengthOfStay)
{
    // 1. Get applicable taxes for this specific date
    List<TaxAvailabilityData> applicableTaxes = GetApplicableTaxes(
        date, 
        rateUniqueID, 
        roomUniqueID
    );
    
    // 2. Sort taxes by level and order
    applicableTaxes = SortTaxes(applicableTaxes);
    /*
     * Sort order:
     * 1. By TaxLevel (Hotel ? Room ? Rate ? Package)
     * 2. Within same level, by SortOrder property
     */
    
    // 3. Initialize tracking variables
    decimal runningTotal = basePrice;
    decimal totalTaxes = 0;
    decimal totalFees = 0;
    decimal inclusiveTaxAmount = 0;
    Dictionary<int, decimal> subtotals = new Dictionary<int, decimal>();
    List<ChargeBreakdownBE> breakdown = new List<ChargeBreakdownBE>();
    
    // 4. Calculate each tax
    foreach (var tax in applicableTaxes)
    {
        // 4a. Check if tax applies to this scenario
        if (!TaxApplies(tax, basePrice, lengthOfStay))
            continue;
        
        // 4b. Determine base amount for calculation
        decimal baseAmount = DetermineBaseAmount(
            tax, 
            basePrice, 
            runningTotal, 
            subtotals
        );
        
        // 4c. Calculate raw tax amount
        decimal taxAmount = CalculateRawAmount(tax, baseAmount);
        
        // 4d. Apply charge type multiplier
        taxAmount = ApplyChargeTypeMultiplier(
            taxAmount, 
            tax.ChargeType, 
            adultCount, 
            childCount
        );
        
        // 4e. Apply guest age offsets (if configured)
        taxAmount = ApplyGuestAgeOffsets(tax, taxAmount, childAges);
        
        // 4f. Apply ceiling (if configured)
        if (tax.Ceiling.HasValue && taxAmount > tax.Ceiling.Value)
        {
            taxAmount = tax.Ceiling.Value;
        }
        
        // 4g. Categorize as tax or fee
        bool isFee = IsFeeType(tax.TaxType);
        
        // 4h. Handle inclusive/exclusive
        if (tax.IsInclusive)
        {
            // Inclusive: extract from price
            inclusiveTaxAmount += taxAmount;
            // Don't add to running total (already in price)
        }
        else
        {
            // Exclusive: add to price
            if (isFee)
                totalFees += taxAmount;
            else
                totalTaxes += taxAmount;
            
            runningTotal += taxAmount;
        }
        
        // 4i. Update subtotals (if configured)
        UpdateSubtotals(tax, taxAmount, subtotals, runningTotal);
        
        // 4j. Add to breakdown
        breakdown.Add(new ChargeBreakdownBE
        {
            Code = tax.Code,
            Amount = taxAmount,
            Type = MapTaxType(tax.TaxType),
            Level = tax.Level,
            IsInclusive = tax.IsInclusive,
            IsPayAtProperty = tax.IsPayAtProperty,
            IsPerStay = false
        });
    }
    
    // 5. Calculate final price
    decimal adjustedBasePrice = basePrice;
    if (inclusiveTaxAmount > 0)
    {
        // Extract inclusive taxes from base price
        adjustedBasePrice = basePrice - inclusiveTaxAmount;
    }
    
    decimal priceWithTaxesAndFees = adjustedBasePrice + totalTaxes + totalFees;
    
    // 6. Return result
    return new TaxEvaluatedDetail
    {
        Price = adjustedBasePrice,
        Taxes = totalTaxes,
        Fees = totalFees,
        PriceWithTaxesAndFees = priceWithTaxesAndFees,
        AppliedInclusiveTaxes = inclusiveTaxAmount,
        PriceWithInclusiveTaxes = basePrice,
        TaxesBreakdown = breakdown.ToArray()
    };
}

// Helper: Get applicable taxes for this date/rate/room
List<TaxAvailabilityData> GetApplicableTaxes(
    CalendarDate date,
    Guid rateUniqueID,
    Guid roomUniqueID)
{
    List<TaxAvailabilityData> applicable = new List<TaxAvailabilityData>();
    
    int dateCalendarID = date.CalendarID;
    
    // Hotel-level taxes (always apply)
    foreach (var tax in hotelTaxes)
    {
        if (tax.StartCalendarID <= dateCalendarID && 
            tax.EndCalendarID >= dateCalendarID)
        {
            applicable.Add(tax);
        }
    }
    
    // Room-level taxes (only if assigned to this room)
    if (roomTaxes.ContainsKey(roomUniqueID))
    {
        foreach (var tax in roomTaxes[roomUniqueID])
        {
            if (tax.StartCalendarID <= dateCalendarID && 
                tax.EndCalendarID >= dateCalendarID)
            {
                applicable.Add(tax);
            }
        }
    }
    
    // Rate-level taxes (only if assigned to this rate)
    if (rateTaxes.ContainsKey(rateUniqueID))
    {
        foreach (var tax in rateTaxes[rateUniqueID])
        {
            if (tax.StartCalendarID <= dateCalendarID && 
                tax.EndCalendarID >= dateCalendarID)
            {
                applicable.Add(tax);
            }
        }
    }
    
    return applicable;
}

// Helper: Check if tax applies
bool TaxApplies(
    TaxAvailabilityData tax,
    decimal basePrice,
    int lengthOfStay)
{
    // Check price range (if specified)
    if (tax.IsPriceRangeSpecific)
    {
        if (tax.MinDailyPrice.HasValue && basePrice < tax.MinDailyPrice.Value)
            return false;
        
        if (tax.MaxDailyPrice.HasValue && basePrice > tax.MaxDailyPrice.Value)
            return false;
    }
    
    // Check length of stay range (if specified)
    if (tax.MinLengthOfStay.HasValue && lengthOfStay < tax.MinLengthOfStay.Value)
        return false;
    
    if (tax.MaxLengthOfStay.HasValue && lengthOfStay > tax.MaxLengthOfStay.Value)
        return false;
    
    return true;
}

// Helper: Determine base amount
decimal DetermineBaseAmount(
    TaxAvailabilityData tax,
    decimal basePrice,
    decimal runningTotal,
    Dictionary<int, decimal> subtotals)
{
    // Calculate from base price
    if (tax.CalcFromBase)
        return basePrice;
    
    // Calculate from specific subtotal
    if (tax.CalculateFromSubtotal > 0)
    {
        if (subtotals.ContainsKey(tax.CalculateFromSubtotal))
            return subtotals[tax.CalculateFromSubtotal];
        else
            return basePrice; // Fallback
    }
    
    // Calculate from running total
    return runningTotal;
}

// Helper: Calculate raw amount
decimal CalculateRawAmount(
    TaxAvailabilityData tax,
    decimal baseAmount)
{
    // Percentage-based
    if (tax.Percent > 0)
    {
        return baseAmount * (tax.Percent / 100m);
    }
    
    // Fixed amount
    return tax.Amount;
}

// Helper: Apply charge type multiplier
decimal ApplyChargeTypeMultiplier(
    decimal amount,
    ChargeType chargeType,
    int adultCount,
    int childCount)
{
    switch (chargeType)
    {
        case ChargeType.FlatCharge:
            return amount; // No multiplier
        
        case ChargeType.PerPerson:
            return amount * (adultCount + childCount);
        
        case ChargeType.PerAdult:
            return amount * adultCount;
        
        case ChargeType.PerChild:
            return amount * childCount;
        
        case ChargeType.PerRoom:
            return amount; // Multiplied by room count at higher level
        
        default:
            return amount;
    }
}

// Helper: Update subtotals
void UpdateSubtotals(
    TaxAvailabilityData tax,
    decimal taxAmount,
    Dictionary<int, decimal> subtotals,
    decimal runningTotal)
{
    if (string.IsNullOrEmpty(tax.AddToSubtotals))
        return;
    
    // Parse comma-separated subtotal IDs
    string[] subtotalIDs = tax.AddToSubtotals.Split(',');
    
    foreach (string idStr in subtotalIDs)
    {
        if (int.TryParse(idStr.Trim(), out int id))
        {
            if (!subtotals.ContainsKey(id))
                subtotals[id] = runningTotal;
            
            subtotals[id] += taxAmount;
        }
    }
}
```

### Example Calculation

**Scenario**:
- Base price: $100.00
- Guest count: 2 adults, 1 child
- Length of stay: 3 nights
- Taxes:
  1. Occupancy Tax: 10% (exclusive, per room)
  2. City Tax: $5.00 (exclusive, per person)
  3. Resort Fee: $25.00 (exclusive, per stay)

**Night 1 Calculation**:

```
Tax 1: Occupancy Tax
  Base amount: $100.00
  Rate: 10%
  Calculation: $100.00 * 0.10 = $10.00
  Charge type: Per room (no multiplier)
  Amount: $10.00

Tax 2: City Tax
  Base amount: $100.00 (calculate from base)
  Amount: $5.00
  Charge type: Per person
  Guests: 2 adults + 1 child = 3
  Calculation: $5.00 * 3 = $15.00
  Amount: $15.00

Resort Fee: Skipped (per-stay, calculated separately)

Daily Total:
  Base price: $100.00
  Occupancy tax: $10.00
  City tax: $15.00
  Total for night: $125.00
```

**All Nights**:
- Night 1: $100.00 + $25.00 taxes = $125.00
- Night 2: $100.00 + $25.00 taxes = $125.00
- Night 3: $100.00 + $25.00 taxes = $125.00

**Stay Total**:
- Room subtotal: $300.00
- Daily taxes: $75.00
- Resort fee (stay): $25.00
- **Grand total: $400.00**

---

## Stay Tax Calculation

### When Stay Taxes Apply

Stay taxes are:
- Charged **once per reservation** (not per night)
- Configured with `ChargeFrequency = PerStay`
- Examples: resort fees, parking fees, facility fees

### Calculation Process

```csharp
public TaxEvaluatedDetail CalculateStayTaxes(
    decimal totalNightlyPrice,
    decimal totalPriceWithDailyTaxes,
    Guid rateUniqueID,
    Guid roomUniqueID,
    int adultCount,
    int childCount,
    int lengthOfStay,
    int numberOfNights)
{
    // 1. Get stay-level taxes
    List<TaxAvailabilityData> stayTaxes = GetStayLevelTaxes(
        rateUniqueID,
        roomUniqueID
    );
    
    // 2. Initialize totals
    decimal totalStayTaxes = 0;
    decimal totalStayFees = 0;
    List<ChargeBreakdownBE> breakdown = new List<ChargeBreakdownBE>();
    
    // 3. Calculate each stay tax
    foreach (var tax in stayTaxes)
    {
        // 3a. Determine base amount
        decimal baseAmount;
        if (tax.CalcFromBase)
            baseAmount = totalNightlyPrice;
        else
            baseAmount = totalPriceWithDailyTaxes;
        
        // 3b. Calculate amount (same logic as daily)
        decimal taxAmount = CalculateRawAmount(tax, baseAmount);
        
        // 3c. Apply charge type
        taxAmount = ApplyChargeTypeMultiplier(
            taxAmount,
            tax.ChargeType,
            adultCount,
            childCount
        );
        
        // 3d. Apply ceiling
        if (tax.Ceiling.HasValue && taxAmount > tax.Ceiling.Value)
            taxAmount = tax.Ceiling.Value;
        
        // 3e. Categorize
        bool isFee = IsFeeType(tax.TaxType);
        
        if (isFee)
            totalStayFees += taxAmount;
        else
            totalStayTaxes += taxAmount;
        
        // 3f. Add to breakdown
        breakdown.Add(new ChargeBreakdownBE
        {
            Code = tax.Code,
            Amount = taxAmount,
            Type = MapTaxType(tax.TaxType),
            Level = tax.Level,
            IsInclusive = false, // Stay taxes are always exclusive
            IsPayAtProperty = tax.IsPayAtProperty,
            IsPerStay = true
        });
    }
    
    // 4. Optional: Distribute across nights
    if (addStayTaxToDailyPrice)
    {
        decimal stayTaxPerNight = (totalStayTaxes + totalStayFees) / numberOfNights;
        
        foreach (DayItem dayItem in dayItems)
        {
            dayItem.TaxAmount += stayTaxPerNight;
            dayItem.PriceWithTaxesAndFees += stayTaxPerNight;
        }
    }
    
    // 5. Return result
    return new TaxEvaluatedDetail
    {
        Taxes = totalStayTaxes,
        Fees = totalStayFees,
        TaxesBreakdown = breakdown.ToArray()
    };
}
```

### Example

```
Nightly pricing (already calculated):
  Night 1: $100 base + $10 tax = $110
  Night 2: $100 base + $10 tax = $110
  Night 3: $100 base + $10 tax = $110
  Total: $300 base + $30 daily taxes = $330

Stay taxes:
  Resort Fee: $25.00 per stay
  Parking Fee: $15.00 per stay per day (special case)

Calculation:
  Resort Fee: $25.00 (flat, one time)
  Parking Fee: $15.00 * 3 nights = $45.00

Stay tax total: $70.00

Grand Total: $330 (with daily taxes) + $70 (stay taxes) = $400.00
```

---

## Tax Aggregation

### Aggregation Process

```csharp
public void CalculatePrices()
{
    // 1. Sum all daily amounts
    decimal totalPrice = 0;
    decimal totalTaxAmount = 0;
    decimal totalFeeAmount = 0;
    decimal totalPriceWithTaxesAndFees = 0;
    decimal totalInclusiveTaxes = 0;
    
    decimal firstNightPrice = 0;
    decimal firstNightPriceWithTaxes = 0;
    decimal highestPrice = decimal.MinValue;
    decimal lowestPrice = decimal.MaxValue;
    
    int nightCount = 0;
    
    foreach (DayItem dayItem in DayItems)
    {
        nightCount++;
        
        // Accumulate totals
        totalPrice += dayItem.Price;
        totalTaxAmount += dayItem.TaxAmount;
        totalFeeAmount += dayItem.FeeAmount;
        totalPriceWithTaxesAndFees += dayItem.PriceWithTaxesAndFees;
        totalInclusiveTaxes += dayItem.AppliedInclusiveTaxes;
        
        // Track first night
        if (nightCount == 1)
        {
            firstNightPrice = dayItem.Price;
            firstNightPriceWithTaxes = dayItem.PriceWithTaxesAndFees;
        }
        
        // Track highest/lowest
        if (dayItem.Price > highestPrice)
            highestPrice = dayItem.Price;
        
        if (dayItem.Price < lowestPrice)
            lowestPrice = dayItem.Price;
    }
    
    // 2. Add stay taxes
    totalTaxAmount += StayTaxAmount;
    totalFeeAmount += StayFeeAmount;
    totalPriceWithTaxesAndFees += StayTaxAmount + StayFeeAmount;
    
    // 3. Calculate averages
    decimal averagePrice = totalPrice / nightCount;
    decimal averagePriceWithTaxes = totalPriceWithTaxesAndFees / nightCount;
    decimal averageTaxAmount = totalTaxAmount / nightCount;
    
    // 4. Detect rate changes
    bool hasRateChange = (highestPrice != lowestPrice);
    
    // 5. Calculate payment split
    decimal totalPayAtProperty = 0;
    decimal totalPayableNow = 0;
    
    foreach (DayItem dayItem in DayItems)
    {
        foreach (TaxDetailDto tax in dayItem.TaxDetails)
        {
            if (tax.IsPayAtProperty)
                totalPayAtProperty += tax.Amount;
            else
                totalPayableNow += tax.Amount;
        }
    }
    
    // Add stay taxes to payment split
    foreach (TaxItem taxItem in StayTaxItems)
    {
        if (taxItem.IsPayAtProperty)
            totalPayAtProperty += taxItem.Amount;
        else
            totalPayableNow += taxItem.Amount;
    }
    
    // Add room price to payable now
    totalPayableNow += totalPrice;
    
    // 6. Store calculated values
    this.TotalPrice = totalPrice;
    this.TotalTaxAmount = totalTaxAmount;
    this.TotalFeeAmount = totalFeeAmount;
    this.TotalPriceWithTaxesAndFees = totalPriceWithTaxesAndFees;
    this.AveragePrice = averagePrice;
    this.AveragePriceWithTaxesAndFees = averagePriceWithTaxes;
    this.AverageTaxAmount = averageTaxAmount;
    this.FirstNightPrice = firstNightPrice;
    this.FirstNightPriceWithTaxesAndFees = firstNightPriceWithTaxes;
    this.HighestPrice = highestPrice;
    this.LowestPrice = lowestPrice;
    this.HasRateChange = hasRateChange;
    this.TotalPayAtPropertyAmount = totalPayAtProperty;
    this.TotalPayableNowAmount = totalPayableNow;
}
```

### Tax Consolidation

**Purpose**: Combine consecutive nights with same tax into single entry

```csharp
public static List<TaxDetailDto> ConsolidateAppliedTaxesDates(
    List<TaxDetailDto> currentTaxes,
    List<TaxDetailDto> nextDayTaxes)
{
    // Group by tax code
    var groupedByCode = currentTaxes.GroupBy(t => t.TaxCode);
    
    List<TaxDetailDto> consolidated = new List<TaxDetailDto>();
    
    foreach (var group in groupedByCode)
    {
        // Find corresponding tax in next day
        var nextDayTax = nextDayTaxes.FirstOrDefault(
            t => t.TaxCode == group.Key
        );
        
        if (nextDayTax != null && 
            nextDayTax.Amount == group.First().Amount &&
            nextDayTax.Percent == group.First().Percent)
        {
            // Extend date range
            var consolidated Tax = group.First();
            consolidatedTax.EndDate = nextDayTax.EndDate;
            consolidated.Add(consolidatedTax);
        }
        else
        {
            // Different amount or not present in next day
            consolidated.AddRange(group);
        }
    }
    
    return consolidated;
}
```

**Example**:

Before consolidation:
```
OCCTAX: 1/1/2024 - 1/1/2024, Amount: $10.00
OCCTAX: 1/2/2024 - 1/2/2024, Amount: $10.00
OCCTAX: 1/3/2024 - 1/3/2024, Amount: $10.00
RESORT: 1/1/2024 - 1/3/2024, Amount: $25.00
```

After consolidation:
```
OCCTAX: 1/1/2024 - 1/3/2024, Amount: $10.00/night
RESORT: 1/1/2024 - 1/3/2024, Amount: $25.00 (per stay)
```

---

## Response Formatting

### JSON Response Example

```json
{
  "availabilityResult": {
    "success": true,
    "products": [
      {
        "rateCode": "BAR",
        "rateName": "Best Available Rate",
        "roomCode": "KING",
        "roomName": "King Room",
        "sortOrder": 1,
        
        "bookingData": {
          // Nightly totals
          "totalPrice": 300.00,
          "totalPriceWithTaxesAndFees": 355.00,
          "taxAmount": 30.00,
          "feeAmount": 25.00,
          
          // Stay totals
          "stayTaxAmount": 0.00,
          "stayFeeAmount": 0.00,
          
          // Averages
          "averagePrice": 100.00,
          "averagePriceWithTaxesAndFees": 118.33,
          "averageTaxAmount": 10.00,
          
          // First/Highest/Lowest
          "firstNightPrice": 100.00,
          "firstNightPriceWithTaxesAndFees": 115.00,
          "highestPrice": 100.00,
          "lowestPrice": 100.00,
          
          // Rate change detection
          "hasRateChange": false,
          "hasRateChangeWithTaxesAndFees": false,
          
          // Payment split
          "totalPayableNowAmount": 330.00,
          "totalPayAtPropertyAmount": 25.00,
          
          // Per-night breakdown
          "dayItems": [
            {
              "date": "2024-01-15",
              "price": 100.00,
              "taxAmount": 10.00,
              "feeAmount": 5.00,
              "priceWithTaxesAndFees": 115.00,
              "priceWithInclusiveTax": 100.00,
              "appliedInclusiveTaxes": 0.00,
              "areTaxesAndFeesIncluded": false,
              "availableInventory": 5
            },
            {
              "date": "2024-01-16",
              "price": 100.00,
              "taxAmount": 10.00,
              "feeAmount": 5.00,
              "priceWithTaxesAndFees": 115.00,
              "priceWithInclusiveTax": 100.00,
              "appliedInclusiveTaxes": 0.00,
              "areTaxesAndFeesIncluded": false,
              "availableInventory": 5
            },
            {
              "date": "2024-01-17",
              "price": 100.00,
              "taxAmount": 10.00,
              "feeAmount": 5.00,
              "priceWithTaxesAndFees": 115.00,
              "priceWithInclusiveTax": 100.00,
              "appliedInclusiveTaxes": 0.00,
              "areTaxesAndFeesIncluded": false,
              "availableInventory": 5
            }
          ],
          
          // Tax details
          "taxDetails": {
            "totalTaxAmount": 30.00,
            "totalStayTaxAmount": 0.00,
            "averageTaxAmount": 10.00,
            "totalTaxPoints": 0,
            
            "taxesBreakdown": [
              {
                "code": "OCCTAX",
                "type": "OccupancyTax",
                "level": "Hotel",
                "amount": 30.00,
                "originalAmount": null,
                "points": null,
                "originalPoints": null,
                "isPerStay": false,
                "isPayAtProperty": false,
                "isInclusive": false,
                "exemptType": null,
                "exemptReason": null
              }
            ]
          },
          
          // Fee details
          "feeDetails": {
            "totalFeeAmount": 25.00,
            "averageFeeAmount": 8.33,
            
            "feesBreakdown": [
              {
                "code": "RESORT",
                "type": "ResortFee",
                "level": "Hotel",
                "amount": 15.00,
                "isPerStay": false,
                "isPayAtProperty": true,
                "isInclusive": false
              },
              {
                "code": "FACILITY",
                "type": "MaintenanceFee",
                "level": "Hotel",
                "amount": 10.00,
                "isPerStay": true,
                "isPayAtProperty": false,
                "isInclusive": false
              }
            ]
          }
        }
      }
    ]
  }
}
```

### OTA Response (OpenTravel Alliance format)

```xml
<OTA_HotelAvailRS>
  <Success/>
  <RoomStays>
    <RoomStay>
      <RoomRates>
        <RoomRate RoomTypeCode="KING" RatePlanCode="BAR">
          <Rates>
            <Rate EffectiveDate="2024-01-15" ExpireDate="2024-01-17">
              <!-- Per night rate -->
              <Base AmountBeforeTax="100.00" AmountAfterTax="115.00" CurrencyCode="USD"/>
              
              <!-- Taxes breakdown -->
              <Taxes Amount="15.00">
                <Tax Amount="10.00" Code="OCCTAX" Type="OccupancyTax" ChargeFrequency="PerNight"/>
                <Tax Amount="5.00" Code="FACILITY" Type="ResortFee" ChargeFrequency="PerNight"/>
              </Taxes>
            </Rate>
          </Rates>
          
          <!-- Total for stay -->
          <Total AmountBeforeTax="300.00" AmountAfterTax="355.00" CurrencyCode="USD">
            <Taxes Amount="55.00">
              <Tax Amount="30.00" Code="OCCTAX" Type="OccupancyTax" ChargeFrequency="PerNight"/>
              <Tax Amount="15.00" Code="FACILITY" Type="ResortFee" ChargeFrequency="PerNight"/>
              <Tax Amount="10.00" Code="PARKING" Type="MaintenanceFee" ChargeFrequency="PerStay"/>
            </Taxes>
          </Total>
        </RoomRate>
      </RoomRates>
    </RoomStay>
  </RoomStays>
</OTA_HotelAvailRS>
```

---

## Advanced Scenarios

### 1. Inclusive Tax Scenario

**Configuration**:
- Rate price: $110.00 per night (inclusive)
- Tax: 10% occupancy tax (inclusive)

**Calculation**:
```
1. Identify inclusive taxes
   Tax: 10% occupancy (IsInclusive = true)

2. Extract tax from price
   Net price = $110.00 / 1.10 = $100.00
   Tax amount = $110.00 - $100.00 = $10.00

3. Result
   Base price shown: $100.00
   Tax shown: $10.00
   Total shown: $110.00 (matches rate price)
```

**Response**:
```json
{
  "price": 100.00,
  "priceWithInclusiveTax": 110.00,
  "appliedInclusiveTaxes": 10.00,
  "taxAmount": 0.00,
  "priceWithTaxesAndFees": 110.00,
  "areTaxesAndFeesIncluded": true
}
```

### 2. Cascading Tax Scenario (Tax-on-Tax)

**Configuration**:
- Room price: $100.00
- Tax 1: 10% occupancy (CalcFromBase = true, AddToSubtotals = "1")
- Tax 2: 5% city tax (CalculateFromSubtotal = 1)

**Calculation**:
```
1. Tax 1: Occupancy Tax
   Base: $100.00
   Calculation: $100.00 * 0.10 = $10.00
   Subtotal 1: $100.00 + $10.00 = $110.00

2. Tax 2: City Tax
   Base: Subtotal 1 = $110.00
   Calculation: $110.00 * 0.05 = $5.50

3. Total
   Room: $100.00
   Tax 1: $10.00
   Tax 2: $5.50
   Total: $115.50
```

### 3. Guest Age Offset Scenario

**Configuration**:
- Room price: $100.00
- Tax: $10.00 resort fee per person
- Guests: 2 adults, 2 children (ages 8, 12)
- Guest offset: 50% discount for children under 10

**Calculation**:
```
1. Base tax per person: $10.00

2. Apply to guests:
   Adult 1: $10.00
   Adult 2: $10.00
   Child 1 (age 8): $10.00 * 0.50 = $5.00 (under 10 discount)
   Child 2 (age 12): $10.00 (no discount)

3. Total fee
   $10.00 + $10.00 + $5.00 + $10.00 = $35.00
```

### 4. Price Range Specific Tax

**Configuration**:
- Tax: 5% luxury tax
- Min price: $200.00
- Max price: $500.00

**Scenarios**:
```
Room price $150.00: Tax does NOT apply (below minimum)
Room price $250.00: Tax applies ? $250.00 * 0.05 = $12.50
Room price $600.00: Tax does NOT apply (above maximum)
```

### 5. Length of Stay Specific Tax

**Configuration**:
- Tax: $50.00 extended stay fee
- Min LOS: 7 nights
- Max LOS: 30 nights

**Scenarios**:
```
5-night stay: Fee does NOT apply (too short)
10-night stay: Fee applies ? $50.00
35-night stay: Fee does NOT apply (too long)
```

### 6. Tax Ceiling Example

**Configuration**:
- Room price: $500.00
- Tax: 15% luxury tax
- Ceiling: $50.00

**Calculation**:
```
Uncapped: $500.00 * 0.15 = $75.00
With ceiling: min($75.00, $50.00) = $50.00

Result: Tax capped at $50.00
```

### 7. Per-Tax Inclusivity (Mixed)

**Configuration**:
- VAT: 10% (inclusive)
- City tax: 5% (exclusive)
- Resort fee: $25.00 (exclusive)

**Calculation**:
```
Rate price: $110.00 (VAT inclusive)

1. Extract VAT
   Net price: $110.00 / 1.10 = $100.00
   VAT: $10.00 (shown but already in price)

2. Add exclusive taxes
   City tax: $100.00 * 0.05 = $5.00
   Resort fee: $25.00

3. Total
   Base: $100.00
   VAT (inclusive): $10.00
   City tax (exclusive): $5.00
   Resort fee (exclusive): $25.00
   Total price: $130.00
   
4. Display
   "Room rate: $110.00 (includes VAT)"
   "City tax: $5.00"
   "Resort fee: $25.00"
   "Total: $130.00"
```

### 8. Loyalty Points Tax Calculation

**Configuration**:
- Rate: Redemption rate (pay with points)
- Room price equivalent: $100.00
- Points required: 10,000
- Tax: 10% occupancy (must be paid in cash or points)

**Calculation**:
```
Option 1: Pay tax in cash
  Points: 10,000 (room only)
  Cash: $10.00 (tax)
  
Option 2: Pay tax in points
  Points: 11,000 (room + tax)
  Cash: $0.00
  
Response includes both options
```

### 9. Onshore Pricing (Dual Currency)

**Configuration**:
- Display currency: USD
- Local (onshore) currency: EUR
- Exchange rate: 1 USD = 0.92 EUR
- Tax in local jurisdiction

**Calculation**:
```
USD Pricing:
  Room: $100.00
  Tax: $10.00
  Total: $110.00

EUR Pricing (onshore):
  Room: 92.00
  Tax: 9.20
  Total: 101.20

Response includes both:
  totalPrice: 100.00
  totalPriceWithTaxesAndFees: 110.00
  totalOnshorePrice: 92.00
  totalOnshorePriceWithTaxesAndFees: 101.20
```

### 10. Tax Exemption Scenario

**Configuration**:
- Rate: Government rate (exempt from certain taxes)
- Normal taxes: Occupancy tax, Resort fee
- Exempt reason: "Government rate"

**Calculation**:
```
Standard rate:
  Room: $100.00
  Occupancy tax: $10.00
  Resort fee: $15.00
  Total: $125.00

Government rate (exemption):
  Room: $100.00
  Occupancy tax: $0.00 (exempt)
  Resort fee: $15.00 (not exempt)
  Total: $115.00

Response includes:
  taxesBreakdown: [
    {
      code: "OCCTAX",
      amount: 0.00,
      exemptType: "GovernmentRate",
      exemptReason: "Tax exempt for government employees"
    },
    {
      code: "RESORT",
      amount: 15.00,
      exemptType: null
    }
  ]
```

---

## Performance Considerations

### Benchmarks

**Typical Performance** (3-night stay, 2 adults, 1 hotel):

| Metric | Time | Notes |
|--------|------|-------|
| Total request | 2-5 seconds | End-to-end |
| Product loading | 500-1000ms | 50 products |
| Tax data loading | 50-100ms | Without cache |
| Tax data loading | <1ms | With cache hit |
| Tax calculation (per product) | 10-20ms | 3 nights, 3 taxes |
| Tax calculation (all products) | 500-1000ms | 50 products |
| Response formatting | 200-400ms | JSON serialization |

**Breakdown by Phase**:
```
Request validation:        50ms      (2%)
Product loading:         800ms     (27%)
Tax loading:             100ms      (3%)
Price calculation:       600ms     (20%)
Tax calculation:        1000ms     (33%)
Aggregation:             200ms      (7%)
Response formatting:     250ms      (8%)
---------------------------------------
Total:                  3000ms    (100%)
```

### Optimization Strategies

#### 1. Tax Data Caching

```csharp
// Cache configuration
public static class TaxCacheConfiguration
{
    public static TimeSpan CacheDuration = TimeSpan.FromMinutes(10);
    public static int MaxCacheEntries = 1000;
    
    public static string GetCacheKey(
        Guid hotelUniqueID,
        CalendarDate startDate,
        CalendarDate endDate,
        int channelID)
    {
        return $"TaxData_{hotelUniqueID}_{startDate}_{endDate}_{channelID}";
    }
}

// Cache implementation
public AvailabilityData LoadTaxData(AvailabilityCriteria criteria)
{
    string cacheKey = TaxCacheConfiguration.GetCacheKey(
        criteria.HotelUniqueID,
        criteria.StartDate,
        criteria.EndDate,
        criteria.ChannelID
    );
    
    // Try cache first
    AvailabilityData cached = cache.Get<AvailabilityData>(cacheKey);
    if (cached != null)
    {
        Metrics.RecordCacheHit("TaxData");
        return cached;
    }
    
    // Load from database
    Metrics.RecordCacheMiss("TaxData");
    AvailabilityData data = LoadFromDatabase(criteria);
    
    // Cache for next request
    cache.Add(cacheKey, data, TaxCacheConfiguration.CacheDuration);
    
    return data;
}
```

**Cache Hit Rate**: 70-90% typical

#### 2. Parallel Tax Calculation

```csharp
// Calculate taxes for multiple products in parallel
public void CalculateAllProductTaxes(
    ProductList products,
    AvailabilityData data,
    AvailabilityCriteria criteria)
{
    Parallel.ForEach(
        products,
        new ParallelOptions { MaxDegreeOfParallelism = 4 },
        product =>
        {
            CalculateProductTaxes(product, data, criteria);
        }
    );
}
```

**Speed improvement**: 2-3x faster on multi-core systems

#### 3. Early Exit Optimization

```csharp
// Skip tax calculation if product already failed other checks
public void CheckProduct(
    AvailabilityCriteria criteria,
    AvailabilityData data,
    ResultItem product)
{
    // Check inventory first (fast)
    if (!HasInventory(product))
    {
        product.AddFailure(FailureCause.NoInventory);
        return; // Skip expensive tax calculation
    }
    
    // Check restrictions (fast)
    if (!MeetsRestrictions(product, criteria))
    {
        product.AddFailure(FailureCause.RestrictionsNotMet);
        return; // Skip tax calculation
    }
    
    // Calculate prices and taxes (expensive)
    CalculatePricing(product, criteria, data);
    CalculateTaxes(product, criteria, data);
}
```

**Speed improvement**: 30-50% faster when many products fail early checks

#### 4. Batch Database Queries

```csharp
// Load all taxes in single query instead of per-tax queries
SELECT /* All tax fields */
FROM Hotel_Tax
WHERE HotelUniqueID IN (:hotelGuids)
  AND /* date filters */

// vs. multiple queries:
SELECT * FROM Hotel_Tax WHERE UniqueID = :tax1
SELECT * FROM Hotel_Tax WHERE UniqueID = :tax2
SELECT * FROM Hotel_Tax WHERE UniqueID = :tax3
...
```

**Speed improvement**: 10x faster (100ms vs 1000ms)

#### 5. Minimize Object Allocations

```csharp
// Reuse objects instead of creating new ones
private static readonly TaxEvaluatedDetail _reusableResult = 
    new TaxEvaluatedDetail();

public TaxEvaluatedDetail CalculateTaxes(...)
{
    // Clear previous values
    _reusableResult.Clear();
    
    // Calculate and populate
    _reusableResult.Price = ...;
    _reusableResult.Taxes = ...;
    
    return _reusableResult;
}
```

**Memory improvement**: 50-70% less garbage collection

#### 6. Database Query Optimization

```sql
-- Add indexes
CREATE INDEX IX_Hotel_Tax_Hotel_Date 
ON Hotel_Tax_Season (TaxUniqueID, StartCalendarID, EndCalendarID);

CREATE INDEX IX_Hotel_Tax_Room 
ON Hotel_Tax_Room (TaxUniqueID, RoomUniqueID);

CREATE INDEX IX_Hotel_Tax_Rate 
ON Hotel_Tax_Rate (TaxUniqueID, RateUniqueID);

-- Use query hints
SELECT /* FIRST_ROWS(100) */ 
  Tax.*, TaxSeason.*
FROM Hotel_Tax Tax
INNER JOIN Hotel_Tax_Season TaxSeason
  ON Tax.UniqueID = TaxSeason.TaxUniqueID
WHERE ...
```

**Speed improvement**: 50-80% faster queries

### Performance Monitoring

```csharp
// Metrics to track
public class TaxCalculationMetrics
{
    public static void RecordTaxCalculation(
        int productCount,
        int nightCount,
        int taxCount,
        TimeSpan duration)
    {
        // Log to monitoring system
        Metrics.Record("TaxCalculation.Duration", duration.TotalMilliseconds);
        Metrics.Record("TaxCalculation.ProductCount", productCount);
        Metrics.Record("TaxCalculation.NightCount", nightCount);
        Metrics.Record("TaxCalculation.TaxCount", taxCount);
        
        // Calculate rate
        double taxesPerSecond = (productCount * nightCount * taxCount) / 
                                 duration.TotalSeconds;
        Metrics.Record("TaxCalculation.TaxesPerSecond", taxesPerSecond);
    }
}
```

**Target Metrics**:
- Tax calculation: <20ms per product
- Cache hit rate: >70%
- Taxes per second: >1000
- Total availability request: <3 seconds

---

## Troubleshooting Guide

### Common Issues

#### Issue 1: Taxes Not Appearing

**Symptoms**: Product shows but no taxes calculated

**Possible Causes**:
1. Tax not assigned to rate/room
2. Tax season date range doesn't overlap search dates
3. Tax inactive
4. Channel restrictions

**Diagnosis**:
```sql
-- Check tax configuration
SELECT 
    t.Code,
    t.Name,
    t.IsActive,
    ts.StartCalendarID,
    ts.EndCalendarID,
    tr.RateUniqueID,
    trm.RoomUniqueID
FROM Hotel_Tax t
LEFT JOIN Hotel_Tax_Season ts ON t.UniqueID = ts.TaxUniqueID
LEFT JOIN Hotel_Tax_Rate tr ON t.UniqueID = tr.TaxUniqueID
LEFT JOIN Hotel_Tax_Room trm ON t.UniqueID = trm.TaxUniqueID
WHERE t.HotelUniqueID = :hotelGuid
  AND t.Code = :taxCode

-- Check if season overlaps dates
SELECT 
    *,
    CASE 
        WHEN StartCalendarID <= :endDate 
         AND EndCalendarID >= :startDate 
        THEN 'OVERLAPS' 
        ELSE 'NO OVERLAP' 
    END AS DateCheck
FROM Hotel_Tax_Season
WHERE TaxUniqueID = :taxGuid
```

**Solutions**:
- Verify tax assignment to correct rates/rooms
- Check tax season dates
- Enable tax if inactive
- Review channel restrictions

#### Issue 2: Wrong Tax Amount

**Symptoms**: Tax calculated but amount is incorrect

**Possible Causes**:
1. Wrong percentage or amount configured
2. Ceiling applied
3. Guest count incorrect
4. Base amount calculation wrong (subtotal vs base)

**Diagnosis**:
```csharp
// Enable verbose logging
criteria.EnableVerboseEvents = true;

// Check event log
foreach (var event in result.Events)
{
    if (event.Field == VerboseAvailabilityField.Tax)
    {
        Console.WriteLine($"{event.Description}: " +
                         $"{event.OldValue} ? {event.NewValue}");
    }
}
```

**Solutions**:
- Verify tax amount/percentage configuration
- Check ceiling value
- Verify guest count passed to calculator
- Review CalculateFromBase vs CalculateFromSubtotal

#### Issue 3: Inclusive Tax Extraction Incorrect

**Symptoms**: Inclusive tax not properly extracted from price

**Possible Causes**:
1. InclusiveType not set correctly
2. Multiple inclusive taxes with different percentages
3. Rounding errors

**Diagnosis**:
```csharp
// Check tax configuration
var tax = GetTax(taxCode);
Console.WriteLine($"IsInclusive: {tax.IsInclusive}");
Console.WriteLine($"InclusiveType: {tax.InclusiveType}");
Console.WriteLine($"Percent: {tax.Percent}");

// Manual calculation
decimal grossPrice = 110.00m;
decimal taxPercent = 10.00m;
decimal netPrice = grossPrice / (1 + taxPercent / 100);
decimal taxAmount = grossPrice - netPrice;

Console.WriteLine($"Net: {netPrice}, Tax: {taxAmount}");
// Expected: Net: 100.00, Tax: 10.00
```

**Solutions**:
- Set InclusiveType = CalculateAsInclusive
- Review multiple inclusive tax logic
- Check decimal precision

#### Issue 4: Performance Degradation

**Symptoms**: Slow tax calculation, timeouts

**Possible Causes**:
1. Too many taxes configured
2. Cache not working
3. Database query slow
4. Too many products being evaluated

**Diagnosis**:
```csharp
// Profile tax calculation
var sw = Stopwatch.StartNew();

// Load taxes
sw.Restart();
LoadTaxData(criteria);
Console.WriteLine($"Load taxes: {sw.ElapsedMilliseconds}ms");

// Calculate taxes
sw.Restart();
CalculateProductTaxes(product, data, criteria);
Console.WriteLine($"Calculate taxes: {sw.ElapsedMilliseconds}ms");

// Check cache
var cacheKey = GetCacheKey(...);
var cached = cache.Get(cacheKey);
Console.WriteLine($"Cache hit: {cached != null}");
```

**Solutions**:
- Review and consolidate taxes
- Verify cache is enabled and working
- Add database indexes
- Limit products in search criteria

#### Issue 5: Stay Tax Not Applied

**Symptoms**: Per-stay taxes not appearing

**Possible Causes**:
1. ChargeFrequency not set to PerStay
2. Stay tax calculation not called
3. Price is zero (free stay)

**Diagnosis**:
```sql
-- Check tax frequency
SELECT 
    t.Code,
    t.FrequencyTypeID,
    CASE t.FrequencyTypeID
        WHEN 1 THEN 'PerNight'
        WHEN 2 THEN 'PerStay'
        ELSE 'Unknown'
    END AS Frequency
FROM Hotel_Tax t
WHERE t.Code = :taxCode
```

```csharp
// Check if stay tax method called
public void EvaluateStayTaxes(...)
{
    Logger.Debug("EvaluateStayTaxes called");
    
    var stayTaxes = GetStayTaxes();
    Logger.Debug($"Found {stayTaxes.Count} stay taxes");
    
    foreach (var tax in stayTaxes)
    {
        Logger.Debug($"Calculating stay tax: {tax.Code}");
    }
}
```

**Solutions**:
- Set FrequencyTypeID = 2 (PerStay)
- Ensure EvaluateStayTaxes is called
- Check price threshold for tax application

### Debug Tools

#### Enable Verbose Logging

```csharp
// In criteria
criteria.VerboseAvailabilityFieldsToCheck = new[]
{
    VerboseAvailabilityField.Tax,
    VerboseAvailabilityField.Fee,
    VerboseAvailabilityField.Price
};

// Check results
foreach (var product in result.AvailableProducts)
{
    foreach (var event in product.Events)
    {
        Console.WriteLine($"[{event.Date}] {event.Field}: " +
                         $"{event.Description} " +
                         $"({event.OldValue} ? {event.NewValue})");
    }
}
```

#### SQL Profiling

```sql
-- Enable SQL trace
ALTER SESSION SET EVENTS '10046 trace name context forever, level 12';

-- Run tax query
-- ...

-- Disable trace
ALTER SESSION SET EVENTS '10046 trace name context off';

-- Analyze trace file
tkprof trace_file output_file explain=username/password
```

#### Performance Profiling

```csharp
// Use stopwatch for timing
using (new PerformanceTimer("Tax Calculation"))
{
    CalculateTaxes(product, data, criteria);
}

public class PerformanceTimer : IDisposable
{
    private readonly string _name;
    private readonly Stopwatch _sw;
    
    public PerformanceTimer(string name)
    {
        _name = name;
        _sw = Stopwatch.StartNew();
    }
    
    public void Dispose()
    {
        _sw.Stop();
        Logger.Debug($"{_name}: {_sw.ElapsedMilliseconds}ms");
    }
}
```

---

## Code Examples

### Complete Tax Calculation Example

```csharp
using Synxis.Enterprise.Business.AvailabilityChecking;
using Synxis.Enterprise.Business.Taxes;
using Synxis.Enterprise.Common;

public class TaxCalculationExample
{
    public void CalculateTaxesForSearch()
    {
        // 1. Build search criteria
        var criteria = new AvailabilityCriteria
        {
            HotelUniqueID = Guid.Parse("..."),
            StartDate = new CalendarDate(2024, 1, 15),
            EndDate = new CalendarDate(2024, 1, 18),
            NumberOfAdults = 2,
            NumberOfChildren = 1,
            ChildAges = new List<int> { 8 },
            ChannelID = 1
        };
        
        // 2. Execute availability check (includes tax calculation)
        IAvailabilityResult result = 
            AvailabilityChecker.Instance.Check(criteria, CheckType.Standard);
        
        // 3. Review results
        foreach (var product in result.AvailableProducts)
        {
            Console.WriteLine($"Rate: {product.RateCode}, " +
                            $"Room: {product.RoomCode}");
            
            var bookingData = product.BookingData;
            
            Console.WriteLine($"  Total Price: {bookingData.TotalPrice:C}");
            Console.WriteLine($"  Total Taxes: {bookingData.TotalTaxAmount:C}");
            Console.WriteLine($"  Total Fees: {bookingData.TotalFeeAmount:C}");
            Console.WriteLine($"  Grand Total: {bookingData.TotalPriceWithTaxesAndFees:C}");
            
            // Per-night breakdown
            Console.WriteLine("  Nightly Breakdown:");
            foreach (DayItem dayItem in bookingData.DayItems)
            {
                Console.WriteLine($"    {dayItem.Date}: " +
                                $"{dayItem.Price:C} + " +
                                $"{dayItem.TaxAmount:C} tax + " +
                                $"{dayItem.FeeAmount:C} fees = " +
                                $"{dayItem.PriceWithTaxesAndFees:C}");
            }
            
            // Tax breakdown
            Console.WriteLine("  Tax Breakdown:");
            foreach (var taxItem in bookingData.TaxItems)
            {
                Console.WriteLine($"    {taxItem.Tax.Code}: " +
                                $"{taxItem.Amount:C}");
            }
        }
    }
}
```

### Manual Tax Calculation Example

```csharp
public class ManualTaxCalculation
{
    public decimal CalculateTaxManually(
        decimal basePrice,
        int adultCount,
        int childCount)
    {
        // Example tax configuration
        var occupancyTax = new
        {
            Code = "OCCTAX",
            Percent = 10.00m,
            ChargeType = ChargeType.FlatCharge,
            IsInclusive = false
        };
        
        var resortFee = new
        {
            Code = "RESORT",
            Amount = 5.00m,
            ChargeType = ChargeType.PerPerson,
            IsInclusive = false
        };
        
        // Calculate occupancy tax
        decimal occupancyTaxAmount = basePrice * (occupancyTax.Percent / 100m);
        
        // Calculate resort fee
        int guestCount = adultCount + childCount;
        decimal resortFeeAmount = resortFee.Amount * guestCount;
        
        // Total taxes
        decimal totalTax = occupancyTaxAmount + resortFeeAmount;
        
        Console.WriteLine($"Base Price: {basePrice:C}");
        Console.WriteLine($"Occupancy Tax (10%): {occupancyTaxAmount:C}");
        Console.WriteLine($"Resort Fee ({guestCount} guests): {resortFeeAmount:C}");
        Console.WriteLine($"Total Tax: {totalTax:C}");
        Console.WriteLine($"Total Price: {basePrice + totalTax:C}");
        
        return totalTax;
    }
}
```

### Custom Tax Evaluator Example

```csharp
public class CustomTaxEvaluator
{
    public TaxEvaluatedDetail EvaluateCustomTax(
        decimal basePrice,
        List<TaxConfiguration> taxes,
        int adultCount,
        int childCount)
    {
        decimal runningTotal = basePrice;
        decimal totalTaxes = 0;
        decimal totalFees = 0;
        
        foreach (var tax in taxes)
        {
            decimal taxAmount = 0;
            
            // Calculate based on type
            if (tax.IsPercentage)
            {
                taxAmount = runningTotal * (tax.Percent / 100m);
            }
            else
            {
                taxAmount = tax.Amount;
            }
            
            // Apply charge type
            switch (tax.ChargeType)
            {
                case "PerPerson":
                    taxAmount *= (adultCount + childCount);
                    break;
                case "PerAdult":
                    taxAmount *= adultCount;
                    break;
                case "PerChild":
                    taxAmount *= childCount;
                    break;
            }
            
            // Apply ceiling
            if (tax.Ceiling.HasValue && taxAmount > tax.Ceiling.Value)
            {
                taxAmount = tax.Ceiling.Value;
            }
            
            // Categorize
            if (tax.IsFee)
                totalFees += taxAmount;
            else
                totalTaxes += taxAmount;
            
            // Update running total
            if (!tax.IsInclusive)
                runningTotal += taxAmount;
        }
        
        return new TaxEvaluatedDetail
        {
            Price = basePrice,
            Taxes = totalTaxes,
            Fees = totalFees,
            PriceWithTaxesAndFees = runningTotal
        };
    }
}

public class TaxConfiguration
{
    public string Code { get; set; }
    public bool IsPercentage { get; set; }
    public decimal Percent { get; set; }
    public decimal Amount { get; set; }
    public string ChargeType { get; set; }
    public decimal? Ceiling { get; set; }
    public bool IsFee { get; set; }
    public bool IsInclusive { get; set; }
}
```

### Testing Tax Calculation

```csharp
using NUnit.Framework;

[TestFixture]
public class TaxCalculationTests
{
    [Test]
    public void CalculateTax_WithPercentage_ReturnsCorrectAmount()
    {
        // Arrange
        decimal basePrice = 100.00m;
        decimal taxPercent = 10.00m;
        
        // Act
        decimal taxAmount = basePrice * (taxPercent / 100m);
        
        // Assert
        Assert.AreEqual(10.00m, taxAmount);
    }
    
    [Test]
    public void CalculateTax_WithCeiling_CapsAtMaximum()
    {
        // Arrange
        decimal basePrice = 500.00m;
        decimal taxPercent = 15.00m;
        decimal ceiling = 50.00m;
        
        // Act
        decimal uncapped = basePrice * (taxPercent / 100m);
        decimal capped = Math.Min(uncapped, ceiling);
        
        // Assert
        Assert.AreEqual(75.00m, uncapped);
        Assert.AreEqual(50.00m, capped);
    }
    
    [Test]
    public void CalculateTax_PerPerson_MultipliesByGuestCount()
    {
        // Arrange
        decimal taxPerPerson = 5.00m;
        int adultCount = 2;
        int childCount = 1;
        
        // Act
        decimal totalTax = taxPerPerson * (adultCount + childCount);
        
        // Assert
        Assert.AreEqual(15.00m, totalTax);
    }
    
    [Test]
    public void CalculateTax_Inclusive_ExtractsFromPrice()
    {
        // Arrange
        decimal grossPrice = 110.00m;
        decimal taxPercent = 10.00m;
        
        // Act
        decimal netPrice = grossPrice / (1 + taxPercent / 100m);
        decimal taxAmount = grossPrice - netPrice;
        
        // Assert
        Assert.AreEqual(100.00m, netPrice, 0.01m);
        Assert.AreEqual(10.00m, taxAmount, 0.01m);
    }
}
```

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-01-15 | Development Team | Initial document creation |

---

## Related Documentation

- [TAXES_DOCUMENTATION.md](TAXES_DOCUMENTATION.md) - Complete tax system documentation
- Rate Configuration Guide
- Shopping Engine API Reference
- Availability Checker Developer Guide
- Performance Tuning Guide

---

## Support Contacts

**For tax calculation issues**:
- Development Team: dev-team@synxis.com
- Technical Support: support@synxis.com

**For tax configuration assistance**:
- Product Configuration Team: config@synxis.com

---

**End of Document**
