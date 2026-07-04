# SynXis Service Discovery Dictionary

**Purpose:** Data-driven first-hop dictionary for acronym and service-name discovery.
**Source:** HS_ProjectX_CodeMapping.json domain and application records.
**Generated application coverage:** 119 domain application entries.

---

## Domain Dictionary

| Domain | Full Name | Tier Label | App Count | Domain Description |
|---|---|---:|---:|---|
| HSS | Hospitality Services Stack (Enterprise Services) | HSS (Enterprise Services) | 19 | HSS Enterprise Services including managers, engines, resource access services, and utilities for the modern hospitality platform |
| CHC | Channel Connect | CH (Channel Connect) | 12 | Channel Connect services for integrating with external channel partners and distribution systems (Expedia, Ctrip, Google, etc.) |
| ARI | ARI (Availability, Rates, Inventory) | DM (Dumbo/ARI) | 13 | ARI services for managing availability, rates, and inventory distribution. Architecture flow: ARI Scheduler calls NTM -> NTM calls ARI Dto Builder -> ARI Processor performs shopping calls AriShopping service and finally calls CMU to create Dumbo conversation. CMU creates conversation and publishes message to pub/sub for DumboBroker to pick up and send to channels. |
| UI | User Interface (Control Center, Cockpit, White Label) | UI (User Interface) | 7 | User interface applications including Control Center, Cockpit, HES, White Label Health Check, and supporting UI services |
| SV | Legacy Services (CRS Misc Services) | SV (Services) | 21 | Legacy Windows services handling various business processes including scheduled imports, notifications, FTP clients, and monitoring services |
| GD | GDS (Global Distribution System) | GD (GDS) | 10 | GDS tier services including web services for Amadeus, Sabre, and Travelport integrations, plus supporting Windows services |
| PRC | Property Connect (Integration) | IT (Integration/Property Connect) | 37 | Property Connect and Integration tier applications including OTA services, channel integrations, and reservation delivery services |

## Domain To Application IDs

| Domain | Application IDs |
|---|---|
| HSS | HSS-AAM, HSS-AMS, HSS-API, HSS-AQM, HSS-BDS, HSS-FSS, HSS-ITM, HSS-IWM, HSS-KSS, HSS-LKM, HSS-PAM, HSS-PAMS, HSS-PDM, HSS-PFM, HSS-PTM, HSS-RSS, HSS-SUT, HSS-VAAPI, HSS-WSS |
| CHC | CHC-CCA, CHC-CCC, CHC-CCS, CHC-CCW, CHC-CEC, CHC-CLF, CHC-CRR, CHC-CSC, CHC-CWW, CHC-ECC, CHC-GFA, CHC-RRA |
| ARI | ARI-APM, ARI-AS2, ARI-CMU, ARI-DES, ARI-DMB, ARI-DMBB, ARI-DumboFramework, ARI-NM, ARI-NTM, ARI-ShoppingLib, ARI-ThrottlingLib, DataAccess-PubSubLib, Expedia-MsgBuildingLib |
| UI | UI-004, UI-005, UI-BLK, UI-CC, UI-CPT, UI-HES, UI-WLB |
| SV | SV-CNS, SV-FAX, SV-GCS, SV-INS, SV-IVP, SV-LEO, SV-OHR, SV-PCM, SV-PHD, SV-PNS, SV-PYT, SV-RCM, SV-REM, SV-RIN, SV-RMT, SV-SDI, SV-SSS, SV-SUA, SV-SUS, SV-TCM, SV-WCM |
| GD | GD-AAR, GD-ADR, GD-ADS, GD-ADX, GD-AEI, GD-GHR, GD-GLR, GD-SDX, GD-TDX, SV-SCM |
| PRC | PRC-AMS, PRC-APQ, PRC-CNA, PRC-CPC, PRC-DSS, PRC-HNG, PRC-HTG, PRC-HTS, PRC-IAM, PRC-ICE, PRC-IMR, PRC-IOT, PRC-IQM, PRC-IRP, PRC-ITP, PRC-ITT, PRC-LYN, PRC-MLG, PRC-MLR, PRC-OES, PRC-OIS, PRC-ORS, PRC-OTA, PRC-OTI, PRC-OXI, PRC-OXM, PRC-OYO, PRC-PFX, PRC-RBD, PRC-RBQ, PRC-RBV, PRC-RDS, PRC-SIM, PRC-SLF, PRC-TRG, PRC-TRO, PRC-TRX |

## Service Type Dictionary

| Service Type | Meaning |
|---|---|
| Configuration File Package | Service classification from mapping records |
| Library/Framework | Service classification from mapping records |
| Library/Service Component | Service classification from mapping records |
| Linux Service | Service classification from mapping records |
| WCF Worker Service Host | Service classification from mapping records |
| Web API | Service classification from mapping records |
| Web Application | Service classification from mapping records |
| Web Application (ASP.NET) | Service classification from mapping records |
| Web Service | Service classification from mapping records |
| Web Service (.NET Core) | Service classification from mapping records |
| Web Service (ASMX) | Service classification from mapping records |
| Web Service (SoapCore) | Service classification from mapping records |
| Web Service (WCF) | Service classification from mapping records |
| Web Service Host | Service classification from mapping records |
| Windows Service | Service classification from mapping records |

## High-Value Alias Dictionary (All Domains, Generated)

| User Terms | Canonical Match | Domain | Service Type | Full Definition |
|---|---|---|---|---|
| AccountAdminManagerService, Account Admin Manager, accountadminmanagerservice, HSS-AAM, hssaam | HSS-AAM | HSS | Web Service Host | Account Admin Manager service (AAM or HAA-AAM) for account administrative operations |
| ActivityManagerService, Activity Manager, activitymanagerservice, HSS-AMS, hssams | HSS-AMS | HSS | Web Service Host | Activity Manager service (AMS or HAA-AMS) for tracking and managing user and system activities |
| Frontman, frontman, HSS-API, hssapi | HSS-API | HSS | Web Service Host | Frontman Edge API service (EdgeAPI or Forntman) for frontend API gateway |
| AuditQueueManagerService, Audit Queue Manager, auditqueuemanagerservice, HSS-AQM, hssaqm | HSS-AQM | HSS | Windows Service | Audit Queue Manager Windows service for processing audit events |
| BlobStoreUtilityService, Blob Store Utility, blobstoreutilityservice, HSS-BDS, hssbds | HSS-BDS | HSS | Web Service Host | Blob Store Utility service (BDS or BlobStore) for blob storage operations |
| FileStoreUtilityService, File Store Utility, filestoreutilityservice, HSS-FSS, hssfss | HSS-FSS | HSS | Web Service Host | File Store Utility service for file storage operations |
| ItineraryManagerService, Itinerary Manager, itinerarymanagerservice, HSS-ITM, hssitm | HSS-ITM | HSS | Web Service Host | Itinerary Manager service (ITM OR ITIN) for managing guest itineraries and bookings |
| InteractionWorkflowManagerService, Interaction Workflow Manager, interactionworkflowmanagerservice, HSS-IWM, hssiwm | HSS-IWM | HSS | Web Service Host | Interaction Workflow Manager for managing guest interaction workflows |
| KeyServer, Key Server, keyserver, HSS-KSS, hsskss | HSS-KSS | HSS | Web Service | Key Server (KSS or KSSAPI) for managing encryption keys and secrets |
| LookupManagerService, Lookup Manager, lookupmanagerservice, HSS-LKM, hsslkm | HSS-LKM | HSS | Web Service Host | Lookup Manager service (LKM or HPA-LKM) for managing lookup data and reference information |
| ProductAdminManagerService, Product Admin Manager, productadminmanagerservice, HSS-PAM, hsspam | HSS-PAM | HSS | Web Service Host | Product Admin Manager service (PAM or HAA-PAM)for product administrative functions |
| PartnerAdminManagerService, Partner Admin Manager, partneradminmanagerservice, HSS-PAMS, hsspams | HSS-PAMS | HSS | Web Service Host | Partner Admin Manager service (PAMS or HAA-PAMS)for partner administrative functions |
| ProductManagerService, Product Manager, productmanagerservice, HSS-PDM, hsspdm | HSS-PDM | HSS | Web Service Host | Product Manager service (PDM or HAA-PDM) for managing hotel products and inventory |
| ProfileManagerService, Profile Manager, profilemanagerservice, HSS-PFM, hsspfm | HSS-PFM | HSS | Web Service Host | Profile Manager service (PFM) for managing guest and user profiles |
| PartnerManagerService, Partner Manager, partnermanagerservice, HSS-PTM, hssptm | HSS-PTM | HSS | Web Service Host | Partner Manager service for managing partner relationships and data |
| RezSummaryListenerService, Rez Summary Listener, rezsummarylistenerservice, HSS-RSS, hssrss | HSS-RSS | HSS | Windows Service | Reservation Summary Service or Listener Windows service (RSS) for monitoring reservation events |
| SecurityUtilityService, Security Utility, securityutilityservice, HSS-SUT, hsssut | HSS-SUT | HSS | Web Service Host | Security Utility service (SUT or UTI) for authentication, authorization, and security operations |
| WebAPI, Web, webapi, HSS-VAAPI, hssvaapi | HSS-VAAPI | HSS | Web Service Host | Web API service host for HSS REST APIs |
| HSSWorkspace, hssworkspace, HSS-WSS, hsswss | HSS-WSS | HSS | Web Application | HSS Workspace application for workspace management and collaboration |
| ChannelConnectServiceASMX, Channel Connect Service ASMX, channelconnectserviceasmx, CHC-CCA, chccca | CHC-CCA | CHC | Web Service (ASMX) | Channel connect interface ASMX web service for processing channel partner requests |
| ChannelConnectServiceSoapCore, Channel Connect Service Soap Core, channelconnectservicesoapcore, CHC-CCC, chcccc | CHC-CCC | CHC | Web Service (SoapCore) | Channel connect interface SoapCore(.net 8 ASMX implementation) web service for processing channel partner requests |
| ChannelConnectGdsService, Channel Connect Gds, channelconnectgdsservice, CHC-CCS, chcccs | CHC-CCS | CHC | Web Service | Channel Connect GDS integration service for GDS channel partners |
| ChannelConnectServiceWCF, Channel Connect Service WCF, channelconnectservicewcf, CHC-CCW, chcccw | CHC-CCW | CHC | Web Service | Channel connect interface WCF web service for processing channel partner requests |
| ExpediaChannelConnect, Expedia Channel Connect, expediachannelconnect, CHC-CEC, chccec | CHC-CEC | CHC | Web Service | Expedia Channel Connect integration (packer list reference) |
| GoogleLocalFeedService, Google Local Feed, googlelocalfeedservice, CHC-CLF, chcclf | CHC-CLF | CHC | Windows Service | Google Local Feed service for Google Hotel Ads integration |
| RezRequestorWindowsService, Rez Requestor Windows, rezrequestorwindowsservice, CHC-CRR, chccrr | CHC-CRR | CHC | Windows Service | Reservation Requestor Windows service for processing channel reservation requests |
| CtripService, Ctrip, ctripservice, CHC-CSC, chccsc | CHC-CSC | CHC | Web Service | Ctrip-specific Channel Connect integration service |
| ChannelConnectServiceCoreWCF, Channel Connect Service Core WCF, channelconnectservicecorewcf, CHC-CWW, chccww | CHC-CWW | CHC | Web Service | Channel connect interface WCF web service for processing channel partner requests |
| ExpediaCoreChannelConnect, Expedia Core Channel Connect, expediacorechannelconnect, CHC-ECC, chcecc | CHC-ECC | CHC | Web Service | Expedia Channel Connect .net 8 integration service |
| GoogleLocalFeedServiceAspNetCore, Google Local Feed Service Asp Net Core, googlelocalfeedserviceaspnetcore, CHC-GFA, chcgfa | CHC-GFA | CHC | Linux Service | Google Local Feed service .net 8 for Google Hotel Ads integration |
| RezRequestorServiceAspNetCore, Rez Requestor Service Asp Net Core, rezrequestorserviceaspnetcore, CHC-RRA, chcrra | CHC-RRA | CHC | Linux Service | Reservation Requestor .net 8 service for processing channel reservation requests |
| ProductManagerService, Product Manager, productmanagerservice, ARI-APM, ariapm | ARI-APM | ARI | Web Service Host | ARI Product Manager (legacy APM) - this service is actually being decommissioned. |
| AriShoppingService, Ari Shopping, arishoppingservice, ARI-AS2, arias2 | ARI-AS2 | ARI | Web Service (.NET Core) | ARI Shopping service for shopping for Availability Rates and Inventory information (.NET Core) |
| CommunicationUtilityService, Communication Utility, communicationutilityservice, ARI-CMU, aricmu | ARI-CMU | ARI | Web Service Host | Communication Utility service (CMU) - Called by ARI Processor after shopping to send ARI messages and communications to external systems and partners. |
| DomainEventStoreUtilityService, Domain Event Store Utility, domaineventstoreutilityservice, ARI-DES, arides | ARI-DES | ARI | Web Service Host | Domain Events Utility service (DES, DESU) |
| DumboBrokerService, Dumbo Broker, dumbobrokerservice, ARI-DMB, aridmb | ARI-DMB | ARI | Windows Service | Dumbo Broker message service responsible for building and sending ARI messages to external channels. Subscribes to Pub/Sub topics for new ARI messages to process. |
| DumboMessageBuilderService, Dumbo Message Builder, dumbomessagebuilderservice, ARI-DMBB, aridmbb | ARI-DMBB | ARI | Windows Service | Dumbo Message builder service responsible for building outbound ARI messages based on conversation data taken from pub/sub topic. |
| DumboFramework, Dumbo Framework, dumboframework, ARI-DumboFramework, aridumboframework | ARI-DumboFramework | ARI | Library/Framework | Library containing Dumbo message delivery framework logic and contracts |
| NotificationManagerService, Notification Manager, notificationmanagerservice, ARI-NM, arinm | ARI-NM | ARI | Web Service Host | Notification Manager service (NM) used by ARI for managing notifications |
| NotificationTaskManagerService, Notification Task Manager, notificationtaskmanagerservice, ARI-NTM, arintm | ARI-NTM | ARI | WCF Worker Service Host | Notification Task Manager (NTM) - Called by ARI Scheduler to manage notification tasks. NTM then calls the ARI Dto Builder to construct the message DTOs for processing. |
| Ari.ShoppingLibrary, Ari.Shopping Library, arishoppinglibrary, ARI-ShoppingLib, arishoppinglib | ARI-ShoppingLib | ARI | Library/Framework | ARI Shopping library - |
| AriThrottlingLibrary, Ari Throttling Library, arithrottlinglibrary, ARI-ThrottlingLib, arithrottlinglib | ARI-ThrottlingLib | ARI | Library/Service Component | ARI Throttling library for rate limiting and throttling ARI operations |
| ARI Data Access Pub Sub Library, aridataaccesspubsublibrary, DataAccess-PubSubLib, dataaccesspubsublib | DataAccess-PubSubLib | ARI | Library/Service Component | Library contatining pub/sub related code used by ARI services |
| Expedia Message Building Library, expediamessagebuildinglibrary, Expedia-MsgBuildingLib, expediamsgbuildinglib | Expedia-MsgBuildingLib | ARI | Library/Service Component | Expedia-specific ARI message building and formatting library |
| SuperSwitch, Super Switch, superswitch, UI-004, ui004 | UI-004 | UI | Web Service | SuperSwitch - Environment switching utility web service |
| CCResRedirectFile, CCRes Redirect File, ccresredirectfile, UI-005, ui005 | UI-005 | UI | Configuration File Package | Control Center Reservation Redirect File service |
| BulkValidationApi, Bulk Validation, bulkvalidationapi, UI-BLK, uiblk | UI-BLK | UI | Web API | Bulk Validation API for batch validation operations |
| ControlCenter, Control Center, controlcenter, UI-CC, uicc | UI-CC | UI | Web Application (ASP.NET) | Control Center (CC20 or CC) - Main administrative web application for hotel management |
| Cockpit, cockpit, UI-CPT, uicpt | UI-CPT | UI | Web Application (ASP.NET) | Cockpit - Administrative dashboard web application |
| HES, hes, UI-HES, uihes | UI-HES | UI | Web Application (ASP.NET) | Hotel Extranet System (HES) - Hotel extranet web application |
| WlbHealthCheck, Wlb Health Check, wlbhealthcheck, UI-WLB, uiwlb | UI-WLB | UI | Web Service | White Label Booking Health Check service |
| CustomerNotificationsService, Customer Notifications, customernotificationsservice, SV-CNS, svcns | SV-CNS | SV | Windows Service | Responsible for sending customer alerts based on dashboard configuration |
| FaxerWindowsService, Faxer Windows, faxerwindowsservice, SV-FAX, svfax | SV-FAX | SV | Windows Service | Worker service that manages sending out reservation faxes using a 3rd party faxing service |
| GroupCutOffConverterService, Group Cut Off Converter, groupcutoffconverterservice, SV-GCS, svgcs | SV-GCS | SV | Windows Service | Group cutoff date converter service |
| InternalNotifierService, Internal Notifier, internalnotifierservice, SV-INS, svins | SV-INS | SV | Windows Service | Internal notification service for system alerts and messages |
| IdeasV5IProcessorService, Ideas V5 IProcessor, ideasv5iprocessorservice, SV-IVP, svivp | SV-IVP | SV | Windows Service | IDEAS V5 integration processor service |
| LeonardoUpdateService, Leonardo Update, leonardoupdateservice, SV-LEO, svleo | SV-LEO | SV | Windows Service | Leonardo system update synchronization service |
| OnHoldResReleasorService, On Hold Res Releasor, onholdresreleasorservice, SV-OHR, svohr | SV-OHR | SV | Windows Service | Releases on-hold reservations based on configured rules |
| PegasusFtpClientService, Pegasus Ftp Client, pegasusftpclientservice, SV-PCM, svpcm | SV-PCM | SV | Windows Service | FTP client for Pegasus system integration |
| PegHcdAgentService, Peg Hcd Agent, peghcdagentservice, SV-PHD, svphd | SV-PHD | SV | Windows Service | Pegasus HCD (Hotel Content Distribution) agent service |
| PasswordNotifierService, Password Notifier, passwordnotifierservice, SV-PNS, svpns | SV-PNS | SV | Windows Service | Password expiration and notification service |
| PaymentStatusService, Payment Status, paymentstatusservice, SV-PYT, svpyt | SV-PYT | SV | Windows Service | Payment status monitoring and tracking service |
| PerotFtpClientService, Perot Ftp Client, perotftpclientservice, SV-RCM, svrcm | SV-RCM | SV | Windows Service | FTP client for Perot Systems integration |
| RezEmailMonitorService, Rez Email Monitor, rezemailmonitorservice, SV-REM, svrem | SV-REM | SV | Windows Service | Reservation email monitoring service |
| RollingInventoryService, Rolling Inventory, rollinginventoryservice, SV-RIN, svrin | SV-RIN | SV | Windows Service | Rolling inventory management service |
| RezMonitorService, Rez Monitor, rezmonitorservice, SV-RMT, svrmt | SV-RMT | SV | Windows Service | Reservation monitoring and alerting service |
| ScheduledDataImportWindowsService, Scheduled Data Import Windows, scheduleddataimportwindowsservice, SV-SDI, svsdi | SV-SDI | SV | Windows Service | Takes daily external currency data feed and ingests into CRS |
| SipSynchronizationService, Sip Synchronization, sipsynchronizationservice, SV-SSS, svsss | SV-SSS | SV | Windows Service | Synxis retail studio or synxis synchronization service |
| SupersetAlertingService, Superset Alerting, supersetalertingservice, SV-SUA, svsua | SV-SUA | SV | Windows Service | Superset business intelligence alerting service |
| SupersetService, Superset, supersetservice, SV-SUS, svsus | SV-SUS | SV | Windows Service | Superset business intelligence platform service |
| TcmFtpClientService, Tcm Ftp Client, tcmftpclientservice, SV-TCM, svtcm | SV-TCM | SV | Windows Service | TCM (Trust Content Management) FTP client service |
| WpsFtpClientService, Wps Ftp Client, wpsftpclientservice, SV-WCM, svwcm | SV-WCM | SV | Windows Service | WPS (Wholesaler/Portal System) FTP client service |
| Amadeus Async Response Service, Amadeus Async Response, amadeusasyncresponseservice, GD-AAR, gdaar | GD-AAR | GD | Web Service (WCF) | This service is used by us to sync the messages |
| GdsSocketsRouterService, Gds Sockets Router, gdssocketsrouterservice, GD-ADR, gdadr | GD-ADR | GD | Windows Service | GDS sockets routing service for connection management |
| GdsSocketsWindowsService, Gds Sockets Windows, gdssocketswindowsservice, GD-ADS, gdads | GD-ADS | GD | Windows Service | GDS sockets Windows service for persistent connections |
| Amadeus DCWcfService (GDS), Amadeus DCWcf Service (GDS), amadeusdcwcfservicegds, GD-ADX, gdadx | GD-ADX | GD | Web Service (WCF) | The Amadeus GDS Direct Connects web service is a API client applications that expose and process shopping and booking functionality to the GDS channels. While the primary users of the GDSs are Travel Agents, they also expose their GDS services to OTA's as well. |
| GdsAutoEndIgnore, Gds Auto End Ignore, gdsautoendignore, GD-AEI, gdaei | GD-AEI | GD | Windows Service | This service automatically End Transacts (ET) or Ignores (IG) reservations in the GDS "booked" (pending) status. The timeout interfval is 2 hours by default but can be overriden in the GDS_Chain table. |
| GdsDCHumanReviewAlertManagerService, Gds DCHuman Review Alert Manager, gdsdchumanreviewalertmanagerservice, GD-GHR, gdghr | GD-GHR | GD | Windows Service | It flags a few records from interface_book_log so that they can be reviewed by CCD |
| GdsLoadRequestEmailService, Gds Load Request Email, gdsloadrequestemailservice, GD-GLR, gdglr | GD-GLR | GD | Windows Service | This service sends a single Gds Work Request email to the emails addresses specified when all the items in a Gds Work Request are changed from Submitted to another status (either Rejected or Loaded) in Control Center. |
| SabreDCXWCFService, Sabre DCX, sabredcxwcfservice, GD-SDX, gdsdx | GD-SDX | GD | Web Service (WCF) | Sabre Direct Connect X WCF web service |
| TravelPort DCXWCFService (GDS), Travel Port DCXWCFService (GDS), travelportdcxwcfservicegds, GD-TDX, gdtdx | GD-TDX | GD | Web Service (WCF) | this web service provides shopping and booking functionality for Travelport GDS. The GDS initaties the request and this web service responds. The web service does not initiate the communication. |
| SabreConnectionManagerService, Sabre Connection Manager, sabreconnectionmanagerservice, SV-SCM, svscm | SV-SCM | GD | Windows Service | Sabre connection pool manager service |
| ApqMigrationService, Apq Migration, apqmigrationservice, PRC-AMS, prcams | PRC-AMS | PRC | Windows Service | APQ migration service |
| ApqAutoResetService, Apq Auto Reset, apqautoresetservice, PRC-APQ, prcapq | PRC-APQ | PRC | Windows Service | This service will look for instances where the interface_msg_q table is out of sync with what is actually in local IntegProcessor worker queues. This can be seen today via the Async Processing Queue page in Cockpit, where it will show a queue with messages that have been there for many minutes or even hours and are not being worked. The support team would reset the message in the queue back to New to get them ready for processing. |
| cmnetapi, cmnet, PRC-CNA, prccna | PRC-CNA | PRC | Web Application | This sync web service process Inventory and Rate updates from PMSs. |
| PropertyConnect Network, Property Connect Network, propertyconnectnetwork, PRC-CPC, prccpc | PRC-CPC | PRC | Web Application | The Property Connect interface designed for retrieving reservations and updating rate/room availability for a particular property or set of properties. Property Connect is a public web API made up of Web Service and XML-over-HTTP messages used to accept integration messages from hotel property management systems (PMS). Message types consist of Availability, Rates, Inventory, and Reservations. The API supports multiple versions of OTA as well as some proprietary message structures. |
| ReservationDeliveryResynchService, Reservation Delivery Resynch, reservationdeliveryresynchservice, PRC-DSS, prcdss | PRC-DSS | PRC | Windows Service | This service is designed to redeliver the configured reservations in reservation batch delivery job. |
| OTA2010Av1, OTA2010 Av1, ota2010av1, PRC-HNG, prchng | PRC-HNG | PRC | Web Application | This web service receives ARI and Reservation updates from PMSs and queues the requests for processing by another service. |
| OTA2010Av2, OTA2010 Av2, ota2010av2, PRC-HTG, prchtg | PRC-HTG | PRC | Web Application | This web service receives ARI and Reservation updates from PMSs and queues the requests for processing by another service. |
| OTA2010Sync, OTA2010 Sync, ota2010sync, PRC-HTS, prchts | PRC-HTS | PRC | Web Application | This sync web service receives ARI and Reservation updates from PMSs. |
| IntegAlertManager Service, Integ Alert Manager, integalertmanagerservice, PRC-IAM, prciam | PRC-IAM | PRC | Windows Service | Alert manager Windows service |
| iceapi, ice, PRC-ICE, prcice | PRC-ICE | PRC | Web Application | This sync web service processes image meta data from ICE Portal for hotels, rooms etc. ICE Portal currently allows hotel images to be associated with room types. ICE Portal uses the VisualsRequest interface method to send images to the SynXis CR including room type image assignments. ICE Portal will be adding the ability to associate hotel images to rates, room categories, promotions and dynamic packages. |
| InterfaceMessageRouter Service, Interface Message Router, interfacemessagerouterservice, PRC-IMR, prcimr | PRC-IMR | PRC | Windows Service | Interface Message router Windows service |
| InnlinkOTA13, Innlink OTA13, innlinkota13, PRC-IOT, prciot | PRC-IOT | PRC | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service. |
| Integ Queue Manager Service, Integ Queue Manager, integqueuemanagerservice, PRC-IQM, prciqm | PRC-IQM | PRC | Windows Service | Queue manager Windows service |
| IntegReservationPoster service, Integ Reservation Poster, integreservationposterservice, PRC-IRP, prcirp | PRC-IRP | PRC | Windows Service | Reservation poster service |
| IntegProcessor Service, Integ Processor, integprocessorservice, PRC-ITP, prcitp | PRC-ITP | PRC | Windows Service | Integration processor Windows service |
| InnlinkOTA23, Innlink OTA23, innlinkota23, PRC-ITT, prcitt | PRC-ITT | PRC | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service. |
| Lanyon, lanyon, PRC-LYN, prclyn | PRC-LYN | PRC | Web Application | This web service receives Rate updates from RMSs and queues the requests for processing by another service. |
| IntegrationMessageLoggerService, Integration Message Logger, integrationmessageloggerservice, PRC-MLG, prcmlg | PRC-MLG | PRC | Windows Service | Integration message logger service |
| IntegrationMessageLoader Service, Integration Message Loader, integrationmessageloaderservice, PRC-MLR, prcmlr | PRC-MLR | PRC | Windows Service | Integration message loader service |
| OhipEventsSubscriberService, Ohip Events Subscriber, ohipeventssubscriberservice, PRC-OES, prcoes | PRC-OES | PRC | Windows Service | OHIP (Oracle Hospitality Integration Platform) events subscriber service |
| OtaInteg, Ota Integ, otainteg, PRC-OIS, prcois | PRC-OIS | PRC | Web Application | OTA integration service |
| OxiReservationService, Oxi Reservation, oxireservationservice, PRC-ORS, prcors | PRC-ORS | PRC | Windows Service | Another version of the OxiReservationService for specific customers. |
| OTA2004A, OTA2004 A, ota2004a, PRC-OTA, prcota | PRC-OTA | PRC | Web Application | This sync web service processes ARI and Reservation updates from PMSs. |
| OTA2004AIntegService, OTA2004 AInteg, ota2004aintegservice, PRC-OTI, prcoti | PRC-OTI | PRC | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service. |
| oxi (Oxi.aspx), oxioxiaspx, PRC-OXI, prcoxi | PRC-OXI | PRC | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service. |
| Oxim, oxim, PRC-OXM, prcoxm | PRC-OXM | PRC | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service via TCP for Marriott hotels |
| Oyo Service (a.k.a. OTA2003BSyncApi), Oyo Service (a.k.a. OTA2003 BSync Api), oyoserviceakaota2003bsyncapi, PRC-OYO, prcoyo | PRC-OYO | PRC | Web Application | This application is designed to accept and process the OTA_HotelRateAmountNotifRQ & OTA_HotelAvailNotifRQ delta messages that comes from Oyo hotels. It processes all messages synchronously and returns the appropriate response with success or failure. |
| Profile Sync (ProfileManager.asmx), Profile Sync (Profile Manager.asmx), profilesyncprofilemanagerasmx, PRC-PFX, prcpfx | PRC-PFX | PRC | Web Application | Profile synchronization service for managing guest and user profiles. |
| RezBillDistributionService, Rez Bill Distribution, rezbilldistributionservice, PRC-RBD, prcrbd | PRC-RBD | PRC | Windows Service | Reservation billing distribution service |
| RezBillQueueService, Rez Bill Queue, rezbillqueueservice, PRC-RBQ, prcrbq | PRC-RBQ | PRC | Windows Service | Reservation billing queue service |
| RezBillDeliveryService, Rez Bill Delivery, rezbilldeliveryservice, PRC-RBV, prcrbv | PRC-RBV | PRC | Windows Service | Reservation billing delivery service |
| RezDeliveryWS, Rez Delivery WS, rezdeliveryws, PRC-RDS, prcrds | PRC-RDS | PRC | Windows Service | Reservation delivery Windows service |
| SynxisSimulator, Synxis Simulator, synxissimulator, PRC-SIM, prcsim | PRC-SIM | PRC | Web Application | Testing tool that provides an endpoint for testing outbound messaging. |
| Salesforce Channel Activations, salesforcechannelactivations, PRC-SLF, prcslf | PRC-SLF | PRC | Web Application | Salesforce activation and integration service for channel activations. |
| TrustGeneric, Trust Generic, trustgeneric, PRC-TRG, prctrg | PRC-TRG | PRC | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service. |
| TrustOta, Trust Ota, trustota, PRC-TRO, prctro | PRC-TRO | PRC | Web Application | This web service receives ARI and Reservation updates from PMSs. Some request types are processed immediately. Some request types are queued for processing by another service. |
| OxiTrust, Oxi Trust, oxitrust, PRC-TRX, prctrx | PRC-TRX | PRC | Web Application | This web service receives ARI and Reservation updates from PMSs and queues the requests for processing by another service. |

## Search Expansion Rules

1. Exact app ID input: expand to ApplicationId + ApplicationName + Domain + ServiceType.
2. Alias input: resolve canonical app ID from alias dictionary, then expand with applicationName and description keywords.
3. Domain input: expand to domainId + domainName + tier + relatedSolutionFiles when available.
4. Compound impact/design input: preserve canonical IDs and emit domain ownership plus expansion terms.

## Downstream Packet Hints

When synxisnom is upstream of impact, deep-discover, or archon, emit:
- canonical IDs resolved
- application names and service types
- domain ownership and tier
- compact search expansion terms
- confidence and unresolved gaps
