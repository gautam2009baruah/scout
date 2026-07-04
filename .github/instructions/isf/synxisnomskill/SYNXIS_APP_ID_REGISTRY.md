# SynXis Application ID Registry

**Source:** HS_ProjectX_CodeMapping.json (domain application records)
**Generated app entries from domains:** 119
**Format:** ApplicationId | ApplicationName | ServiceType | Description

Use this file for exact app lookup, full domain inventory, or cross-domain comparison.
Use SYNXIS_SERVICE_DISCOVERY_DICTIONARY.md first when the user provides short aliases or uncertain service names.

---

## Fast Lookup Rules

1. Exact app ID -> answer directly from the matching row.
2. Alias or short service name -> normalize via the discovery dictionary, then map here.
3. Domain inventory request -> jump to the matching domain section.
4. Service type question -> answer from the row and include the dictionary meaning when needed.

---

## HSS  Hospitality Services Stack (Enterprise Services) (19 applications)

| App ID | Application Name | Service Type | Description |
|---|---|---|---|
| HSS-AAM | AccountAdminManagerService | Web Service Host | Account Admin Manager service (AAM or HAA-AAM) for account administrative operations |
| HSS-AMS | ActivityManagerService | Web Service Host | Activity Manager service (AMS or HAA-AMS) for tracking and managing user and system activities |
| HSS-API | Frontman | Web Service Host | Frontman Edge API service (EdgeAPI or Forntman) for frontend API gateway |
| HSS-AQM | AuditQueueManagerService | Windows Service | Audit Queue Manager Windows service for processing audit events |
| HSS-BDS | BlobStoreUtilityService | Web Service Host | Blob Store Utility service (BDS or BlobStore) for blob storage operations |
| HSS-FSS | FileStoreUtilityService | Web Service Host | File Store Utility service for file storage operations |
| HSS-ITM | ItineraryManagerService | Web Service Host | Itinerary Manager service (ITM OR ITIN) for managing guest itineraries and bookings |
| HSS-IWM | InteractionWorkflowManagerService | Web Service Host | Interaction Workflow Manager for managing guest interaction workflows |
| HSS-KSS | KeyServer | Web Service | Key Server (KSS or KSSAPI) for managing encryption keys and secrets |
| HSS-LKM | LookupManagerService | Web Service Host | Lookup Manager service (LKM or HPA-LKM) for managing lookup data and reference information |
| HSS-PAM | ProductAdminManagerService | Web Service Host | Product Admin Manager service (PAM or HAA-PAM)for product administrative functions |
| HSS-PAMS | PartnerAdminManagerService | Web Service Host | Partner Admin Manager service (PAMS or HAA-PAMS)for partner administrative functions |
| HSS-PDM | ProductManagerService | Web Service Host | Product Manager service (PDM or HAA-PDM) for managing hotel products and inventory |
| HSS-PFM | ProfileManagerService | Web Service Host | Profile Manager service (PFM) for managing guest and user profiles |
| HSS-PTM | PartnerManagerService | Web Service Host | Partner Manager service for managing partner relationships and data |
| HSS-RSS | RezSummaryListenerService | Windows Service | Reservation Summary Service or Listener Windows service (RSS) for monitoring reservation events |
| HSS-SUT | SecurityUtilityService | Web Service Host | Security Utility service (SUT or UTI) for authentication, authorization, and security operations |
| HSS-VAAPI | WebAPI | Web Service Host | Web API service host for HSS REST APIs |
| HSS-WSS | HSSWorkspace | Web Application | HSS Workspace application for workspace management and collaboration |

---

## CHC  Channel Connect (12 applications)

| App ID | Application Name | Service Type | Description |
|---|---|---|---|
| CHC-CCA | ChannelConnectServiceASMX | Web Service (ASMX) | Channel connect interface ASMX web service for processing channel partner requests |
| CHC-CCC | ChannelConnectServiceSoapCore | Web Service (SoapCore) | Channel connect interface SoapCore(.net 8 ASMX implementation) web service for processing channel partner requests |
| CHC-CCS | ChannelConnectGdsService | Web Service | Channel Connect GDS integration service for GDS channel partners |
| CHC-CCW | ChannelConnectServiceWCF | Web Service | Channel connect interface WCF web service for processing channel partner requests |
| CHC-CEC | ExpediaChannelConnect | Web Service | Expedia Channel Connect integration (packer list reference) |
| CHC-CLF | GoogleLocalFeedService | Windows Service | Google Local Feed service for Google Hotel Ads integration |
| CHC-CRR | RezRequestorWindowsService | Windows Service | Reservation Requestor Windows service for processing channel reservation requests |
| CHC-CSC | CtripService | Web Service | Ctrip-specific Channel Connect integration service |
| CHC-CWW | ChannelConnectServiceCoreWCF | Web Service | Channel connect interface WCF web service for processing channel partner requests |
| CHC-ECC | ExpediaCoreChannelConnect | Web Service | Expedia Channel Connect .net 8 integration service |
| CHC-GFA | GoogleLocalFeedServiceAspNetCore | Linux Service | Google Local Feed service .net 8 for Google Hotel Ads integration |
| CHC-RRA | RezRequestorServiceAspNetCore | Linux Service | Reservation Requestor .net 8 service for processing channel reservation requests |

---

## ARI  ARI (Availability, Rates, Inventory) (13 applications)

| App ID | Application Name | Service Type | Description |
|---|---|---|---|
| ARI-APM | ProductManagerService | Web Service Host | ARI Product Manager (legacy APM) - this service is actually being decommissioned. |
| ARI-AS2 | AriShoppingService | Web Service (.NET Core) | ARI Shopping service for shopping for Availability Rates and Inventory information (.NET Core) |
| ARI-CMU | CommunicationUtilityService | Web Service Host | Communication Utility service (CMU) - Called by ARI Processor after shopping to send ARI messages and communications to external systems and partners. |
| ARI-DES | DomainEventStoreUtilityService | Web Service Host | Domain Events Utility service (DES, DESU) |
| ARI-DMB | DumboBrokerService | Windows Service | Dumbo Broker message service responsible for building and sending ARI messages to external channels. Subscribes to Pub/Sub topics for new ARI messages to process. |
| ARI-DMBB | DumboMessageBuilderService | Windows Service | Dumbo Message builder service responsible for building outbound ARI messages based on conversation data taken from pub/sub topic. |
| ARI-DumboFramework | DumboFramework | Library/Framework | Library containing Dumbo message delivery framework logic and contracts |
| ARI-NM | NotificationManagerService | Web Service Host | Notification Manager service (NM) used by ARI for managing notifications |
| ARI-NTM | NotificationTaskManagerService | WCF Worker Service Host | Notification Task Manager (NTM) - Called by ARI Scheduler to manage notification tasks. NTM then calls the ARI Dto Builder to construct the message DTOs for processing. |
| ARI-ShoppingLib | Ari.ShoppingLibrary | Library/Framework | ARI Shopping library - |
| ARI-ThrottlingLib | AriThrottlingLibrary | Library/Service Component | ARI Throttling library for rate limiting and throttling ARI operations |
| DataAccess-PubSubLib | ARI Data Access Pub Sub Library | Library/Service Component | Library contatining pub/sub related code used by ARI services |
| Expedia-MsgBuildingLib | Expedia Message Building Library | Library/Service Component | Expedia-specific ARI message building and formatting library |

---

## UI  User Interface (Control Center, Cockpit, White Label) (7 applications)

| App ID | Application Name | Service Type | Description |
|---|---|---|---|
| UI-004 | SuperSwitch | Web Service | SuperSwitch - Environment switching utility web service |
| UI-005 | CCResRedirectFile | Configuration File Package | Control Center Reservation Redirect File service |
| UI-BLK | BulkValidationApi | Web API | Bulk Validation API for batch validation operations |
| UI-CC | ControlCenter | Web Application (ASP.NET) | Control Center (CC20 or CC) - Main administrative web application for hotel management |
| UI-CPT | Cockpit | Web Application (ASP.NET) | Cockpit - Administrative dashboard web application |
| UI-HES | HES | Web Application (ASP.NET) | Hotel Extranet System (HES) - Hotel extranet web application |
| UI-WLB | WlbHealthCheck | Web Service | White Label Booking Health Check service |

---

## SV  Legacy Services (CRS Misc Services) (21 applications)

| App ID | Application Name | Service Type | Description |
|---|---|---|---|
| SV-CNS | CustomerNotificationsService | Windows Service | Responsible for sending customer alerts based on dashboard configuration |
| SV-FAX | FaxerWindowsService | Windows Service | Worker service that manages sending out reservation faxes using a 3rd party faxing service |
| SV-GCS | GroupCutOffConverterService | Windows Service | Group cutoff date converter service |
| SV-INS | InternalNotifierService | Windows Service | Internal notification service for system alerts and messages |
| SV-IVP | IdeasV5IProcessorService | Windows Service | IDEAS V5 integration processor service |
| SV-LEO | LeonardoUpdateService | Windows Service | Leonardo system update synchronization service |
| SV-OHR | OnHoldResReleasorService | Windows Service | Releases on-hold reservations based on configured rules |
| SV-PCM | PegasusFtpClientService | Windows Service | FTP client for Pegasus system integration |
| SV-PHD | PegHcdAgentService | Windows Service | Pegasus HCD (Hotel Content Distribution) agent service |
| SV-PNS | PasswordNotifierService | Windows Service | Password expiration and notification service |
| SV-PYT | PaymentStatusService | Windows Service | Payment status monitoring and tracking service |
| SV-RCM | PerotFtpClientService | Windows Service | FTP client for Perot Systems integration |
| SV-REM | RezEmailMonitorService | Windows Service | Reservation email monitoring service |
| SV-RIN | RollingInventoryService | Windows Service | Rolling inventory management service |
| SV-RMT | RezMonitorService | Windows Service | Reservation monitoring and alerting service |
| SV-SDI | ScheduledDataImportWindowsService | Windows Service | Takes daily external currency data feed and ingests into CRS |
| SV-SSS | SipSynchronizationService | Windows Service | Synxis retail studio or synxis synchronization service |
| SV-SUA | SupersetAlertingService | Windows Service | Superset business intelligence alerting service |
| SV-SUS | SupersetService | Windows Service | Superset business intelligence platform service |
| SV-TCM | TcmFtpClientService | Windows Service | TCM (Trust Content Management) FTP client service |
| SV-WCM | WpsFtpClientService | Windows Service | WPS (Wholesaler/Portal System) FTP client service |

---

## GD  GDS (Global Distribution System) (10 applications)

| App ID | Application Name | Service Type | Description |
|---|---|---|---|
| GD-AAR | Amadeus Async Response Service | Web Service (WCF) | This service is used by us to sync the messages |
| GD-ADR | GdsSocketsRouterService | Windows Service | GDS sockets routing service for connection management |
| GD-ADS | GdsSocketsWindowsService | Windows Service | GDS sockets Windows service for persistent connections |
| GD-ADX | Amadeus DCWcfService (GDS) | Web Service (WCF) | The Amadeus GDS Direct Connects web service is a API client applications that expose and process shopping and booking functionality to the GDS channels. While the primary users of the GDSs are Travel Agents, they also expose their GDS services to OTA's as well. |
| GD-AEI | GdsAutoEndIgnore | Windows Service | This service automatically End Transacts (ET) or Ignores (IG) reservations in the GDS "booked" (pending) status. The timeout interfval is 2 hours by default but can be overriden in the GDS_Chain table. |
| GD-GHR | GdsDCHumanReviewAlertManagerService | Windows Service | It flags a few records from interface_book_log so that they can be reviewed by CCD |
| GD-GLR | GdsLoadRequestEmailService | Windows Service | This service sends a single Gds Work Request email to the emails addresses specified when all the items in a Gds Work Request are changed from Submitted to another status (either Rejected or Loaded) in Control Center. |
| GD-SDX | SabreDCXWCFService | Web Service (WCF) | Sabre Direct Connect X WCF web service |
| GD-TDX | TravelPort DCXWCFService (GDS) | Web Service (WCF) | this web service provides shopping and booking functionality for Travelport GDS. The GDS initaties the request and this web service responds. The web service does not initiate the communication. |
| SV-SCM | SabreConnectionManagerService | Windows Service | Sabre connection pool manager service |

---

## PRC  Property Connect (Integration) (37 applications)

| App ID | Application Name | Service Type | Description |
|---|---|---|---|
| PRC-AMS | ApqMigrationService | Windows Service | APQ migration service |
| PRC-APQ | ApqAutoResetService | Windows Service | This service will look for instances where the interface_msg_q table is out of sync with what is actually in local IntegProcessor worker queues. This can be seen today via the Async Processing Queue page in Cockpit, where it will show a queue with messages that have been there for many minutes or even hours and are not being worked. The support team would reset the message in the queue back to New to get them ready for processing. |
| PRC-CNA | cmnetapi | Web Application | This sync web service process Inventory and Rate updates from PMSs. |
| PRC-CPC | PropertyConnect Network | Web Application | The Property Connect interface designed for retrieving reservations and updating rate/room availability for a particular property or set of properties. Property Connect is a public web API made up of Web Service and XML-over-HTTP messages used to accept integration messages from hotel property management systems (PMS). Message types consist of Availability, Rates, Inventory, and Reservations. The API supports multiple versions of OTA as well as some proprietary message structures. |
| PRC-DSS | ReservationDeliveryResynchService | Windows Service | This service is designed to redeliver the configured reservations in reservation batch delivery job. |
| PRC-HNG | OTA2010Av1 | Web Application | This web service receives ARI and Reservation updates from PMSs and queues the requests for processing by another service. |
| PRC-HTG | OTA2010Av2 | Web Application | This web service receives ARI and Reservation updates from PMSs and queues the requests for processing by another service. |
| PRC-HTS | OTA2010Sync | Web Application | This sync web service receives ARI and Reservation updates from PMSs. |
| PRC-IAM | IntegAlertManager Service | Windows Service | Alert manager Windows service |
| PRC-ICE | iceapi | Web Application | This sync web service processes image meta data from ICE Portal for hotels, rooms etc. ICE Portal currently allows hotel images to be associated with room types. ICE Portal uses the VisualsRequest interface method to send images to the SynXis CR including room type image assignments. ICE Portal will be adding the ability to associate hotel images to rates, room categories, promotions and dynamic packages. |
| PRC-IMR | InterfaceMessageRouter Service | Windows Service | Interface Message router Windows service |
| PRC-IOT | InnlinkOTA13 | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service. |
| PRC-IQM | Integ Queue Manager Service | Windows Service | Queue manager Windows service |
| PRC-IRP | IntegReservationPoster service | Windows Service | Reservation poster service |
| PRC-ITP | IntegProcessor Service | Windows Service | Integration processor Windows service |
| PRC-ITT | InnlinkOTA23 | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service. |
| PRC-LYN | Lanyon | Web Application | This web service receives Rate updates from RMSs and queues the requests for processing by another service. |
| PRC-MLG | IntegrationMessageLoggerService | Windows Service | Integration message logger service |
| PRC-MLR | IntegrationMessageLoader Service | Windows Service | Integration message loader service |
| PRC-OES | OhipEventsSubscriberService | Windows Service | OHIP (Oracle Hospitality Integration Platform) events subscriber service |
| PRC-OIS | OtaInteg | Web Application | OTA integration service |
| PRC-ORS | OxiReservationService | Windows Service | Another version of the OxiReservationService for specific customers. |
| PRC-OTA | OTA2004A | Web Application | This sync web service processes ARI and Reservation updates from PMSs. |
| PRC-OTI | OTA2004AIntegService | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service. |
| PRC-OXI | oxi (Oxi.aspx) | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service. |
| PRC-OXM | Oxim | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service via TCP for Marriott hotels |
| PRC-OYO | Oyo Service (a.k.a. OTA2003BSyncApi) | Web Application | This application is designed to accept and process the OTA_HotelRateAmountNotifRQ & OTA_HotelAvailNotifRQ delta messages that comes from Oyo hotels. It processes all messages synchronously and returns the appropriate response with success or failure. |
| PRC-PFX | Profile Sync (ProfileManager.asmx) | Web Application | Profile synchronization service for managing guest and user profiles. |
| PRC-RBD | RezBillDistributionService | Windows Service | Reservation billing distribution service |
| PRC-RBQ | RezBillQueueService | Windows Service | Reservation billing queue service |
| PRC-RBV | RezBillDeliveryService | Windows Service | Reservation billing delivery service |
| PRC-RDS | RezDeliveryWS | Windows Service | Reservation delivery Windows service |
| PRC-SIM | SynxisSimulator | Web Application | Testing tool that provides an endpoint for testing outbound messaging. |
| PRC-SLF | Salesforce Channel Activations | Web Application | Salesforce activation and integration service for channel activations. |
| PRC-TRG | TrustGeneric | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service. |
| PRC-TRO | TrustOta | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service. |
| PRC-TRX | OxiTrust | Web Application | This web service receives ARI and Reservation updates from PMSs and queues the requests for processing by another service. |

---

## Quick Lookup: App ID Only

```
# HSS
HSS-AAM  HSS-AMS  HSS-API  HSS-AQM  HSS-BDS  HSS-FSS  HSS-ITM  HSS-IWM
HSS-KSS  HSS-LKM  HSS-PAM  HSS-PAMS  HSS-PDM  HSS-PFM  HSS-PTM  HSS-RSS
HSS-SUT  HSS-VAAPI  HSS-WSS

# CHC
CHC-CCA  CHC-CCC  CHC-CCS  CHC-CCW  CHC-CEC  CHC-CLF  CHC-CRR  CHC-CSC
CHC-CWW  CHC-ECC  CHC-GFA  CHC-RRA

# ARI
ARI-APM  ARI-AS2  ARI-CMU  ARI-DES  ARI-DMB  ARI-DMBB  ARI-DumboFramework  ARI-NM
ARI-NTM  ARI-ShoppingLib  ARI-ThrottlingLib  DataAccess-PubSubLib  Expedia-MsgBuildingLib

# UI
UI-004  UI-005  UI-BLK  UI-CC  UI-CPT  UI-HES  UI-WLB

# SV
SV-CNS  SV-FAX  SV-GCS  SV-INS  SV-IVP  SV-LEO  SV-OHR  SV-PCM
SV-PHD  SV-PNS  SV-PYT  SV-RCM  SV-REM  SV-RIN  SV-RMT  SV-SDI
SV-SSS  SV-SUA  SV-SUS  SV-TCM  SV-WCM

# GD
GD-AAR  GD-ADR  GD-ADS  GD-ADX  GD-AEI  GD-GHR  GD-GLR  GD-SDX
GD-TDX  SV-SCM

# PRC
PRC-AMS  PRC-APQ  PRC-CNA  PRC-CPC  PRC-DSS  PRC-HNG  PRC-HTG  PRC-HTS
PRC-IAM  PRC-ICE  PRC-IMR  PRC-IOT  PRC-IQM  PRC-IRP  PRC-ITP  PRC-ITT
PRC-LYN  PRC-MLG  PRC-MLR  PRC-OES  PRC-OIS  PRC-ORS  PRC-OTA  PRC-OTI
PRC-OXI  PRC-OXM  PRC-OYO  PRC-PFX  PRC-RBD  PRC-RBQ  PRC-RBV  PRC-RDS
PRC-SIM  PRC-SLF  PRC-TRG  PRC-TRO  PRC-TRX

```
