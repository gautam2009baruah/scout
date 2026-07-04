---
name: Tax Calculation Developer Guide
description: Developer-level reference for tax calculation during shopping (SynXis)
commands: [domain, kb, workflow, review, explain]
tools: []
tags: [tax, developer, hospitality, synxis, shopping, intent:GetDomainHelp, intent:CodeReview, intent:Explain]
category: domain-skill
priority: 5
---
# Tax Calculation During Shopping - Developer Reference
## SynXis Hotel Management System

---

## Document Purpose

This developer-focused reference explains how taxes and fees are calculated during hotel availability searches in the SynXis system. It provides comprehensive coverage of the implementation flow, business rules, calculation algorithms, data structures, and architectural components necessary for understanding and working with the tax subsystem.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Shopping Flow with Tax Calculation](#shopping-flow-with-tax-calculation)
3. [Tax Calculation Rules](#tax-calculation-rules)
4. [Tax Types and Configuration](#tax-types-and-configuration)
5. [Tax Application Algorithm](#tax-application-algorithm)
6. [Pricing Calculation Examples](#pricing-calculation-examples)
7. [Advanced Tax Scenarios](#advanced-tax-scenarios)
8. [Component Architecture](#component-architecture)
9. [Data Structures](#data-structures)
10. [Database Schema](#database-schema)
11. [Tax Season Management](#tax-season-management)
12. [Integration Points](#integration-points)
13. [Developer Reference](#developer-reference)

---

## System Overview

### Tax Calculation in the Shopping Pipeline

The tax calculation subsystem integrates into the hotel availability shopping flow. When a user searches for available rooms, the system calculates complete pricing including all applicable taxes and fees.

**Processing Sequence**:
1. Receive search criteria (dates, guests, hotel, channel)
2. Load available rate/room products
3. Calculate base room prices for each night
4. Load applicable tax configurations for the date range
5. Calculate daily taxes (per-night charges)
6. Calculate stay taxes (one-time charges per reservation)
7. Aggregate all totals (room + taxes + fees)
8. Return complete pricing with detailed breakdown

### Core Implementation Principles

**1. Hierarchical Tax Application**
```
Hotel Level ? Room Level ? Rate Level ? Package Level
```
Taxes are evaluated in a fixed hierarchy to ensure consistent application order.

**2. Date-Aware Calculation**
Tax rates and rules can vary by date through the Season mechanism. A single stay can span multiple tax seasons with different rates.

**3. Guest-Based Calculation**
Tax amounts can depend on:
- Number of adults
- Number of children
- Ages of children
- Guest type classifications

**4. Inclusive vs. Exclusive Tax Modes**
- **Exclusive**: Tax added to room rate (common in US)
- **Inclusive**: Tax embedded in room rate (common in Europe/VAT)

**5. Cascading Tax Support**
Taxes can be calculated on subtotals that include other taxes ("tax-on-tax").

### Performance Targets

| Operation | Target | Cache Hit |
|-----------|--------|-----------|
| Tax data load | 50-100ms | <1ms |
| Tax calc per product | 10-20ms | - |
| Tax calc 50 products | 500-1000ms | - |
| Total availability request | 2-5 seconds | - |

---

## Shopping Flow with Tax Calculation

### High-Level Flow

```
---------------------------------------
? Client Request (Shopping API, OTA, GDS, etc.)          ?
---------------------------------------
                     ?
                     ?
---------------------------------------
? ShoppingEngineService                                   ?
? - Validates search criteria                            ?
? - Builds AvailabilityCriteria                         ?
---------------------------------------
                     ?
                     ?
---------------------------------------
? AvailabilityChecker                                     ?
? - Loads products (rate/room combinations)              ?
? - Coordinates data loading                             ?
---------------------------------------
                     ?
                     ?
---------------------------------------
? DataLoader.LoadAvailabilityTaxesData()                 ?
? - Queries tax configuration from database              ?
? - Filters by hotel, date range, channel               ?
? - Categorizes by tax level (Hotel/Room/Rate/Package)  ?
? - Caches results                                       ?
---------------------------------------
                     ?
                     ?
---------------------------------------
? ProductsChecker / RateProductChecker                   ?
? - Iterates through each product                        ?
? - Calculates base prices per night                    ?
? - Calls TaxEvaluatorHelper for tax calculation        ?
---------------------------------------
                     ?
                     ?
---------------------------------------
? TaxEvaluatorHelper                                      ?
? FOR EACH NIGHT:                                        ?
?   - EvaluateDailyTaxes()                              ?
?   - Gets applicable taxes for the date                ?
?   - Calls TaxEvaluator.EvaluateDailyTaxes()          ?
?   - Stores results in DayItem                         ?
?                                                         ?
? AFTER ALL NIGHTS:                                      ?
?   - EvaluateStayTaxes()                               ?
?   - Calculates one-time per-stay charges             ?
?   - Distributes across nights if configured           ?
---------------------------------------
                     ?
                     ?
---------------------------------------
? TaxEvaluator (Core Engine)                             ?
? - Sorts taxes by level and order                      ?
? - Applies tax calculation algorithm                    ?
? - Handles inclusive/exclusive logic                    ?
? - Manages cascading calculations                       ?
? - Returns TaxEvaluatedDetail                          ?
---------------------------------------
                     ?
                     ?
---------------------------------------
? ProductBookingData.CalculatePrices()                   ?
? - Aggregates all DayItem amounts                      ?
? - Calculates totals and averages                      ?
? - Separates prepaid vs pay-at-property                ?
? - Builds tax breakdown list                           ?
---------------------------------------
                     ?
                     ?
---------------------------------------
? Response Formatting & Return                            ?
? - Maps to response DTO                                 ?
? - Includes complete pricing breakdown                  ?
? - Returns to client                                    ?
---------------------------------------
```

### Component Interactions

**ShoppingEngineService**
- **Location**: `SHS.Services.ShoppingEngine.ShoppingEngineService`
- **Responsibility**: Entry point for shopping requests, validates criteria, calls availability checker
- **Key Interface**: `CheckAvailability(SearchCriteriaDto)`

**AvailabilityChecker**
- **Location**: `Synxis.Enterprise.Business.AvailabilityChecking.AvailabilityChecker`
- **Responsibility**: Orchestrates the entire availability checking workflow
- **Key Interface**: `Check(AvailabilityCriteria, CheckType)`

**DataLoader**
- **Location**: `Synxis.Enterprise.Business.AvailabilityChecking.DataLoader`
- **Responsibility**: Loads tax configuration from database, handles caching
- **Key Interface**: `LoadAvailabilityTaxesData(AvailabilityCriteria, AvailabilityData, CheckType)`

**TaxEvaluatorHelper**
- **Location**: `Synxis.Enterprise.Business.AvailabilityChecking.Workers.TaxEvaluatorHelper`
- **Responsibility**: Coordinates daily and stay tax evaluation
- **Key Interfaces**:
  - `EvaluateDailyTaxes()` - Per-night tax calculation
  - `EvaluateStayTaxes()` - Per-reservation tax calculation

**TaxEvaluator**
- **Location**: `Synxis.Enterprise.Business.Taxes.TaxEvaluator`
- **Responsibility**: Core tax calculation engine
- **Key Interface**: `EvaluateDailyTaxes(...)` - Returns `TaxEvaluatedDetail`

---

## Tax Calculation Rules

### Rule 1: Hierarchical Tax Application

Taxes are evaluated in a fixed hierarchy:

```
1. Hotel Level Taxes (TaxLevel = Hotel)
   ?
2. Room Level Taxes (TaxLevel = Room)
   ?
3. Rate Level Taxes (TaxLevel = Rate)
   ?
4. Package Level Taxes (TaxLevel = Package)
```

**Implementation**:
- Within each level, taxes are sorted by `SortOrder` property
- All taxes at a higher level are evaluated before any taxes at a lower level
- This ensures predictable calculation order and consistent results

**Assignment Tables**:
| Tax Level | Assignment Table | Join Column |
|-----------|-----------------|-------------|
| Hotel | None (applies to all) | - |
| Room | `Hotel_Tax_Room` | `RoomUniqueID` |
| Rate | `Hotel_Tax_Rate` | `RateUniqueID` |
| Package | `Hotel_Tax_Package` | `PackageUniqueID` |

### Rule 2: Date-Based Tax Evaluation

Each tax has one or more **seasons** that define date ranges with specific rates/amounts.

**Season Selection Logic**:
```
For each night in the stay:
    nightCalendarID = GetCalendarID(nightDate)
    
    For each tax:
        applicableSeasons = tax.Seasons.Where(s => 
            s.StartCalendarID <= nightCalendarID AND 
            s.EndCalendarID >= nightCalendarID)
        
        If applicableSeasons.Count > 0:
            Apply tax using season configuration
        Else:
            Tax does not apply for this night
```

**Multi-Season Stays**:
A reservation can span multiple seasons:
```
Example:
Tax Season 1: Jan 1-15, Rate = 10%
Tax Season 2: Jan 16-31, Rate = 12%

Guest Stay: Jan 10-20
- Nights 1-6 (Jan 10-15): 10% rate
- Nights 7-11 (Jan 16-20): 12% rate
```

### Rule 3: Guest-Based Calculation

Tax amounts can be multiplied based on guest count using the `ChargeType` property.

**ChargeType Values**:

| ChargeType | Multiplier | Use Case |
|------------|-----------|----------|
| `FlatCharge` | 1 | Fixed amount per room |
| `PerPerson` | Adults + Children | Per total guest |
| `PerAdult` | Adults only | Adult-specific charges |
| `PerChild` | Children only | Child-specific charges |
| `PerRoom` | Number of rooms | Multi-room bookings |

**Algorithm**:
```
baseAmount = CalculateBaseAmount(tax, roomPrice)

switch (tax.ChargeType):
    case FlatCharge:
        finalAmount = baseAmount
    case PerPerson:
        finalAmount = baseAmount * (adultCount + childCount)
    case PerAdult:
        finalAmount = baseAmount * adultCount
    case PerChild:
        finalAmount = baseAmount * childCount
    case PerRoom:
        finalAmount = baseAmount * roomCount
```

**Guest Age Offsets**:
Taxes can have age-based adjustments stored in `Hotel_Tax_Guest_Offset`:
```
Example:
Base Resort Fee: $20 per person
Children under 10: 50% discount

Calculation for family (2 adults, 2 children ages 8 and 12):
- Adult 1: $20
- Adult 2: $20
- Child 1 (age 8): $20 * 0.50 = $10
- Child 2 (age 12): $20
Total: $70
```

### Rule 4: Tax Calculation Base Amount

Each tax can be calculated on different base amounts:

**Option 1: Room Price** (`CalcFromBase = true`)
```
Tax Amount = Room Price  Tax Rate
```
Used when tax should always be based on the base room rate.

**Option 2: Running Total** (`CalcFromBase = false, CalculateFromSubtotal = 0`)
```
Tax Amount = (Room Price + All Previous Taxes)  Tax Rate
```
Used for taxes that compound on previous taxes.

**Option 3: Specific Subtotal** (`CalculateFromSubtotal = N`)
```
Tax Amount = Subtotal[N]  Tax Rate
```
Used for complex cascading scenarios where tax is based on a specific subtotal.

**Subtotal Management**:
Taxes can contribute to subtotals using `AddToSubtotals`:
```
Tax Configuration:
- AddToSubtotals = "1,3"

After calculating this tax:
- Subtotal[1] += taxAmount
- Subtotal[3] += taxAmount
```

### Rule 5: Inclusive vs. Exclusive Tax Handling

**Exclusive Taxes** (`IsInclusive = false`):
```
Advertised Rate: $100
Tax (10%): $10
Total Price: $110

Display:
  Room Rate: $100
  Tax: $10
  Total: $110
```

**Inclusive Taxes** (`IsInclusive = true`):
```
Advertised Rate: $110 (tax included)
Net Room Rate: $110 / 1.10 = $100
Tax (10%): $10

Display:
  Room Rate: $110 (includes $10 tax)
  Total: $110
```

**Extraction Formula**:
```
grossPrice = advertisedRate
taxRate = tax.Percent / 100
netPrice = grossPrice / (1 + taxRate)
taxAmount = grossPrice - netPrice
```

### Rule 6: Tax Ceiling (Maximum Cap)

Taxes can have a maximum amount cap:

```
If tax.Ceiling.HasValue:
    calculatedAmount = baseAmount * taxRate
    finalAmount = Min(calculatedAmount, tax.Ceiling.Value)
Else:
    finalAmount = baseAmount * taxRate
```

**Example**:
```
Room Rate: $500
Luxury Tax: 15%
Ceiling: $50

Calculation:
- Uncapped: $500  0.15 = $75
- With Ceiling: Min($75, $50) = $50
- Final Tax: $50
```

### Rule 7: Price and LOS Filtering

Taxes can be conditionally applied based on:

**Price Range**:
```
If tax.IsPriceRangeSpecific:
    If roomPrice < tax.MinDailyPrice OR roomPrice > tax.MaxDailyPrice:
        Skip this tax
```

**Length of Stay Range**:
```
If lengthOfStay < tax.MinLengthOfStay OR lengthOfStay > tax.MaxLengthOfStay:
    Skip this tax
```

**Example Use Cases**:
- Luxury tax only on rooms over $300/night
- Extended stay fee only on 7+ night stays
- Discount tax for 3+ night bookings

### Rule 8: Tax vs. Fee Classification

The system distinguishes between government-mandated taxes and hotel-imposed fees:

**Classification Logic**:
```
Based on TaxType:
- Tax Types: BedTax, CityTax, CountyTax, FederalTax, FoodBeverageTax, 
              LodgingTax, OccupancyTax, SalesTax, StateTax, TourismTax, 
              VAT_GST_Tax
- Fee Types: CityHotelFee, EnergyTax, MaintenanceFee, MiscellaneousFee, 
             PackageFee, ResortFee, ServiceCharge, Surcharge

If IsFeeType(tax.TaxType):
    Add to FeeAmount
Else:
    Add to TaxAmount
```

**Importance**:
- Separate totals for taxes vs. fees
- Different display requirements
- Tax exemption eligibility differs
- Accounting/reporting categorization

---

## Tax Types and Configuration

### Supported Tax Types (TaxType Enum)

The system supports 22 predefined tax types:

#### Government Taxes

**OccupancyTax**
- Most common hotel tax
- Typically percentage-based
- Applied per night, per room
- Municipal or county-imposed

**StateTax**
- State-level lodging tax
- Percentage-based
- Applied per night

**CityTax**
- City-specific tax
- Can be percentage or flat amount
- Often per person per night

**CountyTax**
- County-level tax
- Usually percentage-based
- Layered with state/city taxes

**FederalTax**
- National-level tax
- Rare in US, common internationally
- Various calculation methods

**TourismTax**
- Funds local tourism initiatives
- Percentage or flat amount
- Per night or per stay

**VAT_GST_Tax**
- Value Added Tax / Goods and Services Tax
- Typically 10-25%
- Usually inclusive in rate
- Common in Europe, Canada, Australia

**SalesTax**
- General sales tax applied to lodging
- Percentage-based
- Per night

**BedTax**
- Per-bed or per-guest tax
- Flat amount
- Per person per night

**LodgingTax**
- Generic lodging tax
- Various configurations
- Per night

**FoodBeverageTax**
- Applied when packages include meals
- Percentage of meal value
- Package-level tax

#### Hotel Fees

**ResortFee**
- Covers resort amenities (pool, gym, WiFi, etc.)
- Flat amount per night or per stay
- Can be per room or per person
- May be pay-at-property

**ServiceCharge**
- Hotel operational fee
- Typically 10-20% of room rate
- Per night
- Common internationally

**MaintenanceFee**
- Property upkeep charge
- Flat amount
- Per stay

**EnergyTax/Surcharge**
- Utility cost recovery
- Small flat amount
- Per night

**CityHotelFee**
- Municipal hotel fee
- Flat amount
- Per night or per stay

**PackageFee**
- Additional charge for package inclusions
- Various configurations
- Package-level

**MiscellaneousFee/Tax**
- Catch-all for other charges
- Flexible configuration

**Surcharge**
- Generic additional charge
- Various configurations

### Tax Configuration Properties

Each tax record in `Hotel_Tax` contains:

**Identity**:
- `UniqueID` (Guid) - Primary key
- `HotelUniqueID` (Guid) - Hotel association
- `Code` (string) - Short identifier (e.g., "OCCTAX")
- `Name` (string) - Display name
- `Description` (string) - Detailed description

**Type & Level**:
- `TaxTypeID` (int) - Enum value from TaxType
- `TaxLevelID` (int) - Hotel/Room/Rate/Package

**Calculation Method**:
- `ChargeTypeID` (int) - FlatCharge/PerPerson/PerAdult/PerChild/PerRoom
- `FrequencyTypeID` (int) - PerNight/PerStay

**Calculation Behavior**:
- `CalculateFromBase` (bool) - Use room price vs. running total
- `CalculateFromSubtotal` (int) - Which subtotal to use (0 = none)
- `AddToSubtotals` (string) - Comma-separated subtotal IDs

**Inclusive/Exclusive**:
- `IsInclusive` (bool) - Tax included in rate price
- `InclusiveTypeID` (int) - Type of inclusive calculation

**Advanced**:
- `ApplyToFreeNights` (bool) - Apply to complimentary nights
- `IsPayAtProperty` (bool) - Collected at check-in vs. prepaid
- `SortOrder` (int) - Evaluation order within level
- `IsExemptable` (bool) - Can be exempted for qualified guests

**Season-Specific** (in `Hotel_Tax_Season`):
- `Amount` (decimal) - Fixed amount
- `Percent` (decimal) - Percentage rate
- `Ceiling` (decimal?) - Maximum cap
- `FactorTypeID` (int) - Percentage vs. Amount
- `StartCalendarID` (int) - Start date
- `EndCalendarID` (int) - End date
- `IsPriceRangeSpecific` (bool) - Apply price filters
- `MinDailyPrice` (decimal?) - Minimum room rate
- `MaxDailyPrice` (decimal?) - Maximum room rate
- `MinLengthOfStay` (int?) - Minimum nights
- `MaxLengthOfStay` (int?) - Maximum nights

---

## Tax Application Algorithm

### Daily Tax Calculation Algorithm

**Pseudocode**:
```
FUNCTION CalculateDailyTaxes(date, roomPrice, rateID, roomID, adults, children, LOS):
    
    // 1. Get applicable taxes for this date
    applicableTaxes = []
    calendarID = GetCalendarID(date)
    
    FOR EACH tax IN allTaxes:
        // Check date range
        IF tax.StartCalendarID <= calendarID AND tax.EndCalendarID >= calendarID:
            // Check assignment
            IF TaxAppliesTo(tax, rateID, roomID):
                // Check price/LOS filters
                IF PriceAndLOSMatch(tax, roomPrice, LOS):
                    applicableTaxes.Add(tax)
    
    // 2. Sort taxes by level and order
    applicableTaxes.Sort(by: Level, SortOrder)
    
    // 3. Initialize calculation state
    runningTotal = roomPrice
    totalTaxes = 0
    totalFees = 0
    inclusiveTaxAmount = 0
    subtotals = {}
    
    // 4. Calculate each tax
    FOR EACH tax IN applicableTaxes:
        
        // 4a. Determine base amount
        IF tax.CalculateFromBase:
            baseAmount = roomPrice
        ELSE IF tax.CalculateFromSubtotal > 0:
            baseAmount = subtotals[tax.CalculateFromSubtotal]
        ELSE:
            baseAmount = runningTotal
        
        // 4b. Calculate raw amount
        IF tax.Percent > 0:
            rawAmount = baseAmount * (tax.Percent / 100)
        ELSE:
            rawAmount = tax.Amount
        
        // 4c. Apply charge type multiplier
        taxAmount = ApplyChargeTypeMultiplier(
            rawAmount, 
            tax.ChargeType, 
            adults, 
            children
        )
        
        // 4d. Apply guest age offsets
        taxAmount = ApplyGuestAgeOffsets(tax, taxAmount, childAges)
        
        // 4e. Apply ceiling
        IF tax.Ceiling.HasValue:
            taxAmount = Min(taxAmount, tax.Ceiling.Value)
        
        // 4f. Classify as tax or fee
        isFee = IsFeeType(tax.TaxType)
        
        // 4g. Handle inclusive/exclusive
        IF tax.IsInclusive:
            inclusiveTaxAmount += taxAmount
            // Don't add to running total (already in price)
        ELSE:
            IF isFee:
                totalFees += taxAmount
            ELSE:
                totalTaxes += taxAmount
            runningTotal += taxAmount
        
        // 4h. Update subtotals
        IF tax.AddToSubtotals:
            FOR EACH subtotalID IN ParseSubtotalIDs(tax.AddToSubtotals):
                subtotals[subtotalID] += taxAmount
    
    // 5. Calculate final amounts
    adjustedRoomPrice = roomPrice
    IF inclusiveTaxAmount > 0:
        adjustedRoomPrice = roomPrice - inclusiveTaxAmount
    
    priceWithTaxesAndFees = adjustedRoomPrice + totalTaxes + totalFees
    
    // 6. Return results
    RETURN TaxEvaluatedDetail(
        Price: adjustedRoomPrice,
        Taxes: totalTaxes,
        Fees: totalFees,
        PriceWithTaxesAndFees: priceWithTaxesAndFees,
        AppliedInclusiveTaxes: inclusiveTaxAmount,
        PriceWithInclusiveTaxes: roomPrice
    )
```

### Stay Tax Calculation Algorithm

**Pseudocode**:
```
FUNCTION CalculateStayTaxes(totalNightlyPrice, totalWithDailyTaxes, rateID, roomID, adults, children, LOS, numberOfNights):
    
    // 1. Get stay-level taxes
    stayTaxes = allTaxes.Where(t => t.FrequencyType == PerStay)
    
    // 2. Initialize totals
    totalStayTaxes = 0
    totalStayFees = 0
    
    // 3. Calculate each stay tax
    FOR EACH tax IN stayTaxes:
        
        // 3a. Determine base amount
        IF tax.CalculateFromBase:
            baseAmount = totalNightlyPrice
        ELSE:
            baseAmount = totalWithDailyTaxes
        
        // 3b. Calculate amount (same as daily logic)
        IF tax.Percent > 0:
            taxAmount = baseAmount * (tax.Percent / 100)
        ELSE:
            taxAmount = tax.Amount
        
        // 3c. Apply charge type
        taxAmount = ApplyChargeTypeMultiplier(
            taxAmount,
            tax.ChargeType,
            adults,
            children
        )
        
        // 3d. Apply ceiling
        IF tax.Ceiling.HasValue:
            taxAmount = Min(taxAmount, tax.Ceiling.Value)
        
        // 3e. Classify
        IF IsFeeType(tax.TaxType):
            totalStayFees += taxAmount
        ELSE:
            totalStayTaxes += taxAmount
    
    // 4. Optional: Distribute across nights
    IF addStayTaxToDailyPrice:
        stayTaxPerNight = (totalStayTaxes + totalStayFees) / numberOfNights
        FOR EACH dayItem IN dayItems:
            dayItem.TaxAmount += stayTaxPerNight
            dayItem.PriceWithTaxesAndFees += stayTaxPerNight
    
    // 5. Return results
    RETURN TaxEvaluatedDetail(
        Taxes: totalStayTaxes,
        Fees: totalStayFees
    )
```

### Charge Type Multiplier Logic

```
FUNCTION ApplyChargeTypeMultiplier(amount, chargeType, adults, children):
    SWITCH chargeType:
        CASE FlatCharge:
            RETURN amount
        CASE PerPerson:
            RETURN amount * (adults + children)
        CASE PerAdult:
            RETURN amount * adults
        CASE PerChild:
            RETURN amount * children
        CASE PerRoom:
            RETURN amount  // Multiplied by room count at higher level
        DEFAULT:
            RETURN amount
```

### Subtotal Management

```
FUNCTION UpdateSubtotals(tax, taxAmount, subtotals, runningTotal):
    IF tax.AddToSubtotals IS NULL OR EMPTY:
        RETURN
    
    subtotalIDs = Split(tax.AddToSubtotals, ',')
    
    FOR EACH idString IN subtotalIDs:
        IF ParseInt(idString, OUT id):
            IF NOT subtotals.ContainsKey(id):
                subtotals[id] = runningTotal
            subtotals[id] += taxAmount
```

---

## Pricing Calculation Examples

### Example 1: Simple Percentage Tax

**Configuration**:
- Room Rate: $100/night
- Occupancy Tax: 10% (exclusive, per room)
- Stay: 3 nights

**Calculation**:
```
Night 1:
  Base Price: $100
  Occupancy Tax: $100  0.10 = $10
  Total: $110

Night 2:
  Base Price: $100
  Occupancy Tax: $100  0.10 = $10
  Total: $110

Night 3:
  Base Price: $100
  Occupancy Tax: $100  0.10 = $10
  Total: $110

Stay Total:
  Room Subtotal: $300
  Tax Total: $30
  Grand Total: $330
```

### Example 2: Per-Person Fee

**Configuration**:
- Room Rate: $150/night
- Resort Fee: $25 per person per night
- Guests: 2 adults, 1 child
- Stay: 2 nights

**Calculation**:
```
Per Night:
  Base Price: $150
  Resort Fee: $25  3 guests = $75
  Total: $225

2 Nights:
  Room Subtotal: $300
  Resort Fee Total: $150
  Grand Total: $450
```

### Example 3: Cascading Taxes

**Configuration**:
- Room Rate: $100/night
- Tax 1: 10% occupancy (CalcFromBase=true, AddToSubtotals="1")
- Tax 2: 5% city tax (CalculateFromSubtotal=1)
- Stay: 1 night

**Calculation**:
```
Step 1: Base Price
  Room: $100

Step 2: Occupancy Tax
  Base: $100
  Tax: $100  0.10 = $10
  Subtotal[1]: $100 + $10 = $110

Step 3: City Tax
  Base: Subtotal[1] = $110
  Tax: $110  0.05 = $5.50

Total:
  Room: $100
  Tax 1: $10
  Tax 2: $5.50
  Grand Total: $115.50
```

### Example 4: Inclusive VAT

**Configuration**:
- Advertised Rate: 110/night (VAT included)
- VAT: 10% (inclusive)
- City Tax: 3 (exclusive)
- Stay: 2 nights

**Calculation**:
```
Extract VAT:
  Gross Price: 110
  Net Price: 110 / 1.10 = 100
  VAT Amount: 110 - 100 = 10

Add Exclusive Taxes:
  Net Price: 100
  VAT (included): 10
  City Tax: 3
  Total per Night: 113

2 Nights:
  Base (VAT included): 220
  City Tax: 6
  Grand Total: 226

Display:
  Room Rate: 220 (includes 20 VAT)
  City Tax: 6
  Total: 226
```

### Example 5: Guest Age Offsets

**Configuration**:
- Room Rate: $200/night
- Resort Fee: $30 per person
- Guests: 2 adults, 2 children (ages 6, 12)
- Guest Offset: Children under 10 = 50% discount
- Stay: 3 nights

**Calculation**:
```
Per Night:
  Base Price: $200
  
  Resort Fee:
    Adult 1: $30
    Adult 2: $30
    Child 1 (age 6): $30  0.50 = $15
    Child 2 (age 12): $30
    Total: $105
  
  Total per Night: $305

3 Nights:
  Room Subtotal: $600
  Resort Fee Total: $315
  Grand Total: $915
```

### Example 6: Tax Ceiling

**Configuration**:
- Room Rate: $500/night
- Luxury Tax: 15%
- Ceiling: $50
- Stay: 1 night

**Calculation**:
```
Uncapped Calculation:
  Base: $500
  Tax: $500  0.15 = $75

Apply Ceiling:
  Calculated: $75
  Ceiling: $50
  Final Tax: Min($75, $50) = $50

Total:
  Room: $500
  Tax (capped): $50
  Total: $550

Savings from ceiling: $25
```

### Example 7: Price Range Specific

**Configuration**:
- Room Rate: $250/night
- Luxury Tax: 5% (only on rooms $200-$500)
- Occupancy Tax: 10% (all rooms)
- Stay: 2 nights

**Calculation**:
```
Check Luxury Tax:
  Room Rate: $250
  Min Price: $200
  Max Price: $500
  Applies: YES ($200 <= $250 <= $500)

Per Night:
  Base: $250
  Occupancy Tax: $250  0.10 = $25
  Luxury Tax: $250  0.05 = $12.50
  Total: $287.50

2 Nights:
  Room: $500
  Occupancy Tax: $50
  Luxury Tax: $25
  Grand Total: $575
```

### Example 8: Per-Stay Fee

**Configuration**:
- Room Rate: $120/night
- Occupancy Tax: 8% per night
- Parking Fee: $40 per stay
- Stay: 4 nights

**Calculation**:
```
Nightly Taxes:
  Night 1: $120 + ($120  0.08) = $129.60
  Night 2: $120 + ($120  0.08) = $129.60
  Night 3: $120 + ($120  0.08) = $129.60
  Night 4: $120 + ($120  0.08) = $129.60
  
  Subtotal: $518.40

Stay Taxes:
  Parking Fee: $40 (one time)

Grand Total: $558.40

Breakdown:
  Room Subtotal: $480
  Occupancy Tax: $38.40
  Parking Fee: $40
  Total: $558.40
```

---

## Advanced Tax Scenarios

### Scenario 1: Multi-Season Stay

**Configuration**:
```
Tax Season 1: Dec 20-31
  Occupancy Tax: 15%

Tax Season 2: Jan 1+
  Occupancy Tax: 10%

Guest Stay: Dec 28 - Jan 3
Room Rate: $200/night
```

**Calculation**:
```
Dec 28 (Season 1): $200 + ($200  0.15) = $230
Dec 29 (Season 1): $200 + ($200  0.15) = $230
Dec 30 (Season 1): $200 + ($200  0.15) = $230
Dec 31 (Season 1): $200 + ($200  0.15) = $230
Jan 1 (Season 2):  $200 + ($200  0.10) = $220
Jan 2 (Season 2):  $200 + ($200  0.10) = $220
Jan 3 (Season 2):  $200 + ($200  0.10) = $220

Total:
  Room: $1,400 (7 nights)
  Tax: $120 (4 nights @ 15%) + $60 (3 nights @ 10%) = $180
  Grand Total: $1,580
```

### Scenario 2: Mixed Inclusive/Exclusive Taxes

**Configuration**:
```
Rate: $110/night (VAT included)
VAT: 10% (inclusive)
City Tax: 5% (exclusive on net rate)
Resort Fee: $25/night (exclusive)
```

**Calculation**:
```
Step 1: Extract Inclusive VAT
  Gross: $110
  Net: $110 / 1.10 = $100
  VAT: $10

Step 2: Calculate Exclusive Taxes on Net
  Base: $100
  City Tax: $100  0.05 = $5

Step 3: Add Flat Fee
  Resort Fee: $25

Total per Night:
  Net Room: $100
  VAT (included): $10
  City Tax: $5
  Resort Fee: $25
  Total: $130

Display:
  "Room: $110 (includes $10 VAT)"
  "City Tax: $5"
  "Resort Fee: $25"
  "Total: $130"
```

### Scenario 3: Length-of-Stay Specific Fee

**Configuration**:
```
Room Rate: $150/night
Occupancy Tax: 10%
Extended Stay Fee: $100 (applies to 7+ night stays only)
```

**Scenario A - 5 Night Stay**:
```
5 nights  $150 = $750
Occupancy Tax: $750  0.10 = $75
Extended Stay Fee: N/A (< 7 nights)
Total: $825
```

**Scenario B - 10 Night Stay**:
```
10 nights  $150 = $1,500
Occupancy Tax: $1,500  0.10 = $150
Extended Stay Fee: $100 (? 7 nights)
Total: $1,750
```

### Scenario 4: Tax Exemption

**Configuration**:
```
Standard Rate: $200/night
Occupancy Tax: 10% (exemptable)
Resort Fee: $30/night (not exemptable)
Guest: Government employee with exemption certificate
```

**Standard Guest Calculation**:
```
Room: $200
Occupancy Tax: $20
Resort Fee: $30
Total: $250
```

**Exempt Guest Calculation**:
```
Room: $200
Occupancy Tax: $0 (exempt)
Resort Fee: $30 (not exempt)
Total: $230

Savings: $20
```

**Implementation**:
```
In Hotel_Tax_Rate table:
- RateUniqueID: {government-rate-guid}
- ExemptReasonUniqueID: {govt-exemption-guid}

At runtime:
IF rate has exemption reason:
    taxAmount = 0
    Record exemption details in response
```

### Scenario 5: Complex Cascading with Multiple Subtotals

**Configuration**:
```
Room: $100
Tax 1: 10% (CalcFromBase=true, AddToSubtotals="1")
Tax 2: 5% (CalculateFromSubtotal=1, AddToSubtotals="2")
Tax 3: 2% (CalculateFromSubtotal=2)
```

**Calculation**:
```
Base Price: $100

Tax 1 (10%):
  Base: $100
  Amount: $10
  Subtotal[1]: $100 + $10 = $110

Tax 2 (5%):
  Base: Subtotal[1] = $110
  Amount: $5.50
  Subtotal[2]: $110 + $5.50 = $115.50

Tax 3 (2%):
  Base: Subtotal[2] = $115.50
  Amount: $2.31

Final Total:
  Room: $100
  Tax 1: $10
  Tax 2: $5.50
  Tax 3: $2.31
  Total: $117.81
```

### Scenario 6: Occupancy-Based Tiered Fee

**Configuration**:
```
Room Rate: $180/night
Resort Fee Configuration:
  - Per Person: $20
  - Guest Ages:
    * Adults: Full price
    * Children 11-17: 75% ($15)
    * Children 5-10: 50% ($10)
    * Children 0-4: Free

Guests: 2 adults, 3 children (ages 3, 8, 14)
```

**Calculation**:
```
Room: $180

Resort Fee per Night:
  Adult 1: $20
  Adult 2: $20
  Child 1 (age 3): $0 (free)
  Child 2 (age 8): $10 (50%)
  Child 3 (age 14): $15 (75%)
  Total: $65

Total per Night: $245

3 Nights:
  Room: $540
  Resort Fee: $195
  Grand Total: $735
```

---

## Component Architecture

### Tax Subsystem Components

```
---------------------------------------
?          Shopping/Availability Layer                ?
?  - ShoppingEngineService                           ?
?  - AvailabilityChecker                             ?
?  - ProductsChecker / RateProductChecker            ?
---------------------------------------
                 ?
                 ?
---------------------------------------
?          Tax Orchestration Layer                    ?
?  - TaxEvaluatorHelper                              ?
?    * EvaluateDailyTaxes()                         ?
?    * EvaluateStayTaxes()                          ?
---------------------------------------
                 ?
                 ?
---------------------------------------
?          Tax Calculation Engine                     ?
?  - TaxEvaluator                                    ?
?    * Core calculation algorithm                    ?
?    * Inclusive/exclusive handling                  ?
?    * Cascading logic                               ?
?    * Returns TaxEvaluatedDetail                   ?
---------------------------------------
                 ?
                 ?
---------------------------------------
?          Tax Data Layer                             ?
?  - DataLoader                                      ?
?    * LoadAvailabilityTaxesData()                  ?
?    * Categorizes by level                          ?
?    * Caching                                       ?
---------------------------------------
                 ?
                 ?
---------------------------------------
?          Database / Cache                           ?
?  - Hotel_Tax                                       ?
?  - Hotel_Tax_Season                                ?
?  - Assignment tables                               ?
?  - In-memory cache                                 ?
---------------------------------------
```

### Key Components Detail

**DataLoader**
- **Namespace**: `Synxis.Enterprise.Business.AvailabilityChecking`
- **Purpose**: Loads tax configuration from database
- **Caching**: 10-minute cache per hotel/date range/channel
- **Key Method**: `LoadAvailabilityTaxesData(AvailabilityCriteria, AvailabilityData, CheckType)`
- **Output**: Populates `AvailabilityData` with categorized taxes

**TaxEvaluatorHelper**
- **Namespace**: `Synxis.Enterprise.Business.AvailabilityChecking.Workers`
- **Purpose**: Coordinates tax evaluation during availability checking
- **Key Methods**:
  - `EvaluateDailyTaxes()` - Calculates per-night taxes
  - `EvaluateStayTaxes()` - Calculates per-stay taxes
- **Integration**: Called from `RateProductChecker` during product evaluation

**TaxEvaluator**
- **Namespace**: `Synxis.Enterprise.Business.Taxes`
- **Purpose**: Core tax calculation engine
- **Pattern**: Singleton (`TaxEvaluator.Instance`)
- **Key Method**: `EvaluateDailyTaxes(...)` ? `TaxEvaluatedDetail`
- **Responsibilities**:
  - Sort taxes by hierarchy
  - Apply calculation algorithm
  - Handle inclusive/exclusive logic
  - Manage subtotals
  - Apply ceilings and multipliers

**ProductBookingData**
- **Namespace**: `Synxis.Enterprise.Business.Reservations`
- **Purpose**: Aggregates pricing results
- **Key Method**: `CalculatePrices()`
- **Aggregations**:
  - Total room charges
  - Total taxes/fees
  - Averages per night
  - First/highest/lowest night
  - Prepaid vs pay-at-property split

---

## Data Structures

### TaxAvailabilityData

In-memory representation of tax loaded from database during availability checking.

**Namespace**: `Synxis.Enterprise.Business.AvailabilityChecking.InternalData`

**Key Properties**:
```
TaxUniqueID: Guid
Name: string
Description: string
TaxType: int (TaxType enum value)
Level: TaxLevel (Hotel/Room/Rate/Package)
RoomUniqueID: Guid (if room-level)
RateUniqueID: Guid (if rate-level)
PackageUniqueId: Guid (if package-level)
StartCalendarID: int (season start date)
EndCalendarID: int (season end date)
ChargeType: ChargeType (FlatCharge/PerPerson/etc.)
FrequencyTypeID: int (PerNight/PerStay)
Amount: decimal (fixed amount)
Percent: decimal (percentage rate)
Ceiling: decimal? (maximum cap)
CalcFromBase: bool
CalculateFromSubtotal: int
AddToSubtotals: string
IsInclusive: bool
TaxInclusiveTypeID: int?
ApplyToFreeNights: bool
IsPayAtProperty: bool
SortOrder: int
IsPriceRangeSpecific: bool
MinDailyPrice: decimal?
MaxDailyPrice: decimal?
MinLengthOfStay: int?
MaxLengthOfStay: int?
ExemptReasonUniqueID: Guid?
IsExemptable: bool
```

### DayItem

Stores calculated pricing for a single night.

**Namespace**: `Synxis.Enterprise.Business.Reservations`

**Key Properties**:
```
Date: CalendarDate
Price: decimal (room price)
BasePrice: decimal (original base)
OriginalPrice: decimal (before promotions)
TaxAmount: decimal (daily taxes)
FeeAmount: decimal (daily fees)
PriceWithTaxesAndFees: decimal (total for night)
PriceWithInclusiveTax: decimal
AppliedInclusiveTaxes: decimal
TaxDetails: IEnumerable<TaxDetailDto>
LoyaltyPointsValue: int?
AvailableInventory: int
```

### ProductBookingData

Aggregates all pricing for entire stay.

**Namespace**: `Synxis.Enterprise.Business.Reservations`

**Key Properties**:
```
TotalPrice: decimal (sum of nightly base prices)
TotalPriceWithTaxesAndFees: decimal (grand total)
TotalTaxAmount: decimal (sum of daily taxes)
TotalFeeAmount: decimal (sum of daily fees)
StayTaxAmount: decimal (per-stay taxes)
StayFeeAmount: decimal (per-stay fees)
AveragePrice: decimal (average nightly base)
AveragePriceWithTaxesAndFees: decimal (average nightly total)
AverageTaxAmount: decimal (average tax per night)
FirstNightPrice: decimal
FirstNightPriceWithTaxesAndFees: decimal
HighestPrice: decimal
LowestPrice: decimal
TotalPriceWithInclusiveTax: decimal
TotalPayAtPropertyAmount: decimal
TotalPayableNowAmount: decimal
TotalLoyaltyPoints: int?
HasRateChange: bool
DayItems: ICollection<DayItem>
TaxItems: IList<TaxItem>
```

### TaxEvaluatedDetail

Result of tax calculation for one night or entire stay.

**Namespace**: `Synxis.Enterprise.Business.Taxes`

**Key Properties**:
```
Price: decimal (base price adjusted for inclusive)
Taxes: decimal (tax amount)
Fees: decimal (fee amount)
PriceWithTaxesAndFees: decimal (total)
AppliedInclusiveTaxes: decimal
PriceWithInclusiveTaxes: decimal
PayAtPropertyAmount: decimal
TaxPoints: int (loyalty points for taxes)
FeePoints: int (loyalty points for fees)
TotalTaxAmount: decimal
TaxListEvaluationData: IEnumerable<TaxEvaluationData>
```

### AvailabilityData

Container for all data loaded during availability checking, including taxes.

**Namespace**: `Synxis.Enterprise.Business.AvailabilityChecking.InternalData`

**Tax-Related Collections**:
```
HotelTaxes: List<TaxAvailabilityData>
RoomTaxes: Dictionary<Guid, List<TaxAvailabilityData>>  // Key = RoomUniqueID
RateTaxes: Dictionary<Guid, List<TaxAvailabilityData>>  // Key = RateUniqueID
PackageTaxes: Dictionary<Guid, List<TaxAvailabilityData>>  // Key = PackageUniqueID
```

### Response DTOs

**TaxDetailsBE** (Tax breakdown in API response):
```
TotalTaxAmount: decimal
TotalStayTaxAmount: decimal
AverageTaxAmount: decimal
TotalTaxPoints: int
TaxesBreakdown: ChargeBreakdownBE[]
```

**ChargeBreakdownBE** (Individual tax entry):
```
Code: string (tax code)
Type: TaxTypeBE (tax type enum)
Level: TaxLevelBE (Hotel/Room/Rate/Package)
Amount: decimal
OriginalAmount: decimal?
Points: int?
IsPerStay: bool
IsPayAtProperty: bool
IsInclusive: bool
ExemptType: TaxExemptTypeBE?
ExemptReason: string
```

---

## Database Schema

### Core Tax Tables

**Hotel_Tax** (Main tax definition):
```sql
CREATE TABLE Hotel_Tax (
    UniqueID UNIQUEIDENTIFIER PRIMARY KEY,
    HotelUniqueID UNIQUEIDENTIFIER NOT NULL,
    Code VARCHAR(20) NOT NULL,
    Name VARCHAR(100),
    Description VARCHAR(500),
    TaxTypeID INT NOT NULL,
    TaxLevelID INT NOT NULL,
    ChargeTypeID INT NOT NULL,
    FrequencyTypeID INT NOT NULL,
    IsInclusive BIT DEFAULT 0,
    ApplyToFreeNights BIT DEFAULT 0,
    IsPayAtProperty BIT DEFAULT 0,
    InclusiveTypeID INT NULL,
    CalculateFromBase BIT DEFAULT 1,
    CalculateFromSubtotal INT DEFAULT 0,
    AddToSubtotals VARCHAR(50) NULL,
    SortOrder INT DEFAULT 0,
    IsActive BIT DEFAULT 1,
    IsExemptable BIT DEFAULT 0,
    
    FOREIGN KEY (HotelUniqueID) REFERENCES Hotel(UniqueID)
)

CREATE INDEX IX_Hotel_Tax_Hotel ON Hotel_Tax(HotelUniqueID, IsActive)
```

**Hotel_Tax_Season** (Date-ranged tax configuration):
```sql
CREATE TABLE Hotel_Tax_Season (
    UniqueID UNIQUEIDENTIFIER PRIMARY KEY,
    TaxUniqueID UNIQUEIDENTIFIER NOT NULL,
    StartCalendarID INT NOT NULL,
    EndCalendarID INT NOT NULL,
    Amount DECIMAL(18,4) DEFAULT 0,
    Percent DECIMAL(18,4) DEFAULT 0,
    Ceiling DECIMAL(18,4) NULL,
    FactorTypeID INT NOT NULL,
    IsPriceRangeSpecific BIT DEFAULT 0,
    MinDailyPrice DECIMAL(18,4) NULL,
    MaxDailyPrice DECIMAL(18,4) NULL,
    MinLengthOfStay INT NULL,
    MaxLengthOfStay INT NULL,
    IsActive BIT DEFAULT 1,
    
    FOREIGN KEY (TaxUniqueID) REFERENCES Hotel_Tax(UniqueID),
    FOREIGN KEY (StartCalendarID) REFERENCES Calendar(CalendarID),
    FOREIGN KEY (EndCalendarID) REFERENCES Calendar(CalendarID)
)

CREATE INDEX IX_Hotel_Tax_Season_Tax_Dates 
    ON Hotel_Tax_Season(TaxUniqueID, StartCalendarID, EndCalendarID, IsActive)
```

**Hotel_Tax_Room** (Room-level assignments):
```sql
CREATE TABLE Hotel_Tax_Room (
    TaxUniqueID UNIQUEIDENTIFIER NOT NULL,
    RoomUniqueID UNIQUEIDENTIFIER NOT NULL,
    
    PRIMARY KEY (TaxUniqueID, RoomUniqueID),
    FOREIGN KEY (TaxUniqueID) REFERENCES Hotel_Tax(UniqueID),
    FOREIGN KEY (RoomUniqueID) REFERENCES Hotel_Room(UniqueID)
)

CREATE INDEX IX_Hotel_Tax_Room_Room ON Hotel_Tax_Room(RoomUniqueID)
```

**Hotel_Tax_Rate** (Rate-level assignments):
```sql
CREATE TABLE Hotel_Tax_Rate (
    TaxUniqueID UNIQUEIDENTIFIER NOT NULL,
    RateUniqueID UNIQUEIDENTIFIER NOT NULL,
    ExemptReasonUniqueID UNIQUEIDENTIFIER NULL,
    
    PRIMARY KEY (TaxUniqueID, RateUniqueID),
    FOREIGN KEY (TaxUniqueID) REFERENCES Hotel_Tax(UniqueID),
    FOREIGN KEY (RateUniqueID) REFERENCES Hotel_Rate(UniqueID)
)

CREATE INDEX IX_Hotel_Tax_Rate_Rate ON Hotel_Tax_Rate(RateUniqueID)
```

**Hotel_Tax_Package** (Package-level assignments):
```sql
CREATE TABLE Hotel_Tax_Package (
    TaxUniqueID UNIQUEIDENTIFIER NOT NULL,
    PackageUniqueID UNIQUEIDENTIFIER NOT NULL,
    
    PRIMARY KEY (TaxUniqueID, PackageUniqueID),
    FOREIGN KEY (TaxUniqueID) REFERENCES Hotel_Tax(UniqueID),
    FOREIGN KEY (PackageUniqueID) REFERENCES Hotel_Package(UniqueID)
)
```

**Hotel_Tax_Guest_Offset** (Age-based adjustments):
```sql
CREATE TABLE Hotel_Tax_Guest_Offset (
    UniqueID UNIQUEIDENTIFIER PRIMARY KEY,
    TaxUniqueID UNIQUEIDENTIFIER NOT NULL,
    ChildAgeRangeID INT NOT NULL,
    OffsetPercent DECIMAL(18,4) NULL,
    OffsetAmount DECIMAL(18,4) NULL,
    OffsetTypeID INT NOT NULL,
    
    FOREIGN KEY (TaxUniqueID) REFERENCES Hotel_Tax(UniqueID)
)
```

### Data Loading Query

The system uses a single optimized query to load all tax data:

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

INNER JOIN Hotel_Tax_Season TaxSeason 
    ON Tax.UniqueID = TaxSeason.TaxUniqueID

LEFT JOIN Hotel_Tax_Room RoomTax 
    ON Tax.UniqueID = RoomTax.TaxUniqueID

LEFT JOIN Hotel_Tax_Rate RateTax 
    ON Tax.UniqueID = RateTax.TaxUniqueID

LEFT JOIN Hotel_Tax_Package PackageTax 
    ON Tax.UniqueID = PackageTax.TaxUniqueID

WHERE 
    Tax.HotelUniqueID = @HotelUniqueID
    AND TaxSeason.StartCalendarID <= @EndDateCalendarID
    AND TaxSeason.EndCalendarID >= @StartDateCalendarID
    AND Tax.IsActive = 1
    AND TaxSeason.IsActive = 1
    -- Additional channel/access code filters

ORDER BY 
    Tax.TaxLevelID,
    Tax.SortOrder,
    TaxSeason.StartCalendarID
```

---

## Tax Season Management

### Season Concept

A **tax season** is a date-ranged configuration for a tax that specifies:
- Specific rates/amounts
- Price range filters
- Length of stay filters
- Other seasonal rules

**Key Points**:
- One tax can have multiple seasons
- Seasons define non-overlapping or overlapping date ranges
- System automatically selects the applicable season for each night
- Allows for flexible seasonal pricing (peak/off-peak, special events, etc.)

### Season Selection Logic

When evaluating taxes for a specific night:

```
1. Convert night date to CalendarID
2. For each tax:
   a. Find all seasons where:
      StartCalendarID <= nightCalendarID AND EndCalendarID >= nightCalendarID
   b. If multiple seasons match (overlapping):
      - Use most recently created
      - Or use priority field if configured
   c. If no season matches:
      - Tax doesn't apply for this night
   d. If season matches:
      - Use that season's Amount/Percent/Ceiling
```

### Common Season Patterns

**Pattern 1: Year-Round Single Season**
```
Season 1: Jan 1, 2024 - Dec 31, 2024
  - Amount: $25
  - No price/LOS filters
```

**Pattern 2: Peak/Off-Peak**
```
Season 1 (Peak): Jun 1 - Sep 30
  - Percent: 12%
  
Season 2 (Off-Peak): Oct 1 - May 31
  - Percent: 10%
```

**Pattern 3: Special Event**
```
Season 1 (Regular): Jan 1 - Dec 31
  - Percent: 10%
  
Season 2 (Convention Week): Mar 15 - Mar 22
  - Percent: 15%
  - MinLengthOfStay: 2
```

**Pattern 4: Tiered by Price**
```
Season 1: Year-round
  - Percent: 5%
  - MinDailyPrice: $200
  - MaxDailyPrice: $500
  
Season 2: Year-round  
  - Percent: 10%
  - MinDailyPrice: $501
  - No max
```

### Season Creation/Management

Seasons are typically managed through:
- Policy Data Access layer (`SHS.Services.PolicyDA`)
- Admin interfaces
- Bulk upload tools
- API endpoints

**Creation Flow**:
1. Create or update Hotel_Tax record
2. Create Hotel_Tax_Season record(s)
3. Set date ranges (StartCalendarID, EndCalendarID)
4. Configure amounts/percentages
5. Set optional filters (price, LOS)
6. Activate season

**Best Practices**:
- Avoid overlapping seasons for the same tax unless intentional
- Use clear naming conventions
- Document season purposes
- Test edge cases (season boundaries)
- Consider time zones for multi-property chains

---

## Integration Points

### Availability API

**Endpoint**: ShoppingEngineService
**Input**: SearchCriteriaDto
**Output**: AvailabilityResultDto

Tax calculation is embedded in the standard availability flow. No separate tax endpoint needed.

### Booking Flow

When a booking is created:
1. Availability is re-checked with same criteria
2. Taxes are recalculated (rates may have changed)
3. Final pricing is locked
4. Tax breakdown stored in reservation

### Modification Scenarios

When a reservation is modified:
- **Date change**: Taxes recalculated for new dates
- **Guest count change**: Per-person taxes recalculated
- **Room/rate change**: New tax assignments may apply
- **Length of stay change**: LOS-specific taxes may apply/not apply

### Channel-Specific Handling

Different channels may have special tax requirements:

**OTA (Online Travel Agency)**:
- May require taxes shown separately
- Some OTAs handle tax calculation themselves
- Pass-through mode supported

**GDS (Global Distribution System)**:
- Specific tax formatting requirements
- May limit number of tax line items
- Aggregation may be required

**Direct Booking**:
- Full tax breakdown displayed
- Interactive tax calculators
- Tax exemption handling

---

## Developer Reference

### Key Classes and Locations

**Tax Calculation Core**:
- `Synxis.Enterprise.Business.Taxes.TaxEvaluator` - Main calculation engine
- `Synxis.Enterprise.Business.Taxes.Tax` - Base tax class
- `Synxis.Enterprise.Business.Taxes.TaxEvaluatedDetail` - Calculation result

**Availability Integration**:
- `Synxis.Enterprise.Business.AvailabilityChecking.DataLoader` - Tax data loading
- `Synxis.Enterprise.Business.AvailabilityChecking.Workers.TaxEvaluatorHelper` - Orchestration
- `Synxis.Enterprise.Business.AvailabilityChecking.Workers.RateProductChecker` - Product evaluation

**Data Structures**:
- `Synxis.Enterprise.Business.AvailabilityChecking.InternalData.TaxAvailabilityData` - In-memory tax
- `Synxis.Enterprise.Business.AvailabilityChecking.InternalData.AvailabilityData` - Container
- `Synxis.Enterprise.Business.Reservations.DayItem` - Per-night results
- `Synxis.Enterprise.Business.Reservations.ProductBookingData` - Aggregated results

**Data Access**:
- `SHS.Services.PolicyDA` - Tax configuration CRUD
- `SHS.Services.ProductDA` - Rate/room/package data

**Service Contracts**:
- `SHS.Contracts.ShoppingEngine` - Shopping API contracts
- `SHS.Contracts.PolicyDA` - Policy data contracts

### Configuration Points

**Database Connection**:
- Connection string in service configuration
- Connection pooling settings
- Query timeout settings

**Caching**:
- Cache duration: Default 10 minutes
- Cache key format: `TaxData_{HotelUniqueID}_{StartDate}_{EndDate}_{ChannelID}`
- Cache provider: Configurable (in-memory, Redis, etc.)

**Performance Tuning**:
- Parallel product evaluation: Configurable thread count
- Tax data batch size: Configurable
- Query hints: Can be adjusted in DataLoader

### Extension Points

**Custom Tax Types**:
1. Add to TaxType enum
2. Update tax type classification logic
3. Implement custom calculation if needed

**Custom Calculation Logic**:
1. Extend TaxEvaluator class
2. Override calculation methods
3. Register custom evaluator

**Custom Subtotal Logic**:
1. Define subtotal IDs
2. Configure taxes to populate subtotals
3. Configure dependent taxes to use subtotals

### Testing Considerations

**Unit Testing**:
- Mock AvailabilityData for tax data
- Test calculation algorithm with known inputs
- Verify edge cases (ceilings, filters, etc.)
- Test inclusive/exclusive logic
- Test cascading scenarios

**Integration Testing**:
- End-to-end availability tests with tax calculation
- Multi-season boundary testing
- Channel-specific formatting tests
- Performance tests with realistic data volumes

**Test Data Requirements**:
- Sample hotel with various tax configurations
- Multiple seasons with different rates
- Room/rate assignments
- Guest age offset configurations
- Exemption scenarios

### Common Implementation Patterns

**Pattern 1: Add New Tax Type**
```
1. Update TaxType enum in SHS.Contracts.SHS2BuiltInModel
2. Add classification logic in IsFeeType() if it's a fee
3. Update tax configuration UI
4. Test with new tax type
```

**Pattern 2: Implement Custom Subtotal**
```
1. Define subtotal ID (e.g., "10")
2. Configure Tax A with AddToSubtotals="10"
3. Configure Tax B with CalculateFromSubtotal=10
4. Tax B will calculate on (base + Tax A)
```

**Pattern 3: Create Seasonal Tax**
```
1. Create Hotel_Tax record
2. Create multiple Hotel_Tax_Season records
3. Set non-overlapping date ranges
4. Configure different rates per season
5. System automatically picks correct season per night
```

### Debugging Tips

**Enable Verbose Logging**:
Set `VerboseAvailabilityFieldsToCheck` in criteria to include tax events.

**Check Tax Loading**:
Verify taxes are loaded by checking `AvailabilityData.HotelTaxes` count.

**Trace Calculation**:
Set breakpoint in `TaxEvaluator.EvaluateDailyTaxes()` to step through logic.

**Verify Season Selection**:
Check that `CalendarID` falls within season `StartCalendarID` and `EndCalendarID`.

**Check Assignment**:
Verify room/rate/package assignments in respective tables.

**Validate Calculation**:
Manually calculate expected tax amount and compare with result.

### Performance Optimization

**Caching Strategy**:
- Cache tax data per hotel/date range/channel
- Cache duration: 10 minutes default (configurable)
- Invalidate on tax configuration changes
- Monitor cache hit rate (target: >70%)

**Query Optimization**:
- Single query loads all taxes with seasons
- Indexes on key columns (HotelUniqueID, CalendarID ranges)
- Query hints for optimal execution plan
- Connection pooling

**Calculation Optimization**:
- Pre-sort taxes by level/order
- Early exit for inapplicable taxes
- Minimize object allocations
- Parallel product evaluation (configurable)

### Related Documentation

- **TAXES_DOCUMENTATION.md** - Complete tax system documentation (all aspects)
- **TAX_CALCULATION_SHOPPING_AVAILABILITY.md** - Technical deep dive (includes code)
- Rate Management Guide - Rate configuration and pricing
- Policy Data Access Guide - Tax configuration APIs
- Availability Checker Guide - Availability subsystem details

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024 | Development Team | Initial developer-focused document |

---

## Support Contacts

**Development Questions**:
- Development Team: dev-team@synxis.com
- Architecture Team: architecture@synxis.com

**Tax System Issues**:
- Technical Support: support@synxis.com
- Tax Configuration: taxconfig@synxis.com

---

**End of Developer Reference**
