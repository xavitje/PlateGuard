# Plan: PlateGuard tussen kassa en keuken

_November 2026. Eerste kassa: Lightspeed Restaurant K-Series. Daarna MplusKASSA._

## Het idee in één alinea

De ober bestelt gewoon in de eigen kassa, op de eigen apparaten. PlateGuard leest elke
bestelling mee. Een bestelling zonder allergie merkt niemand: die gaat zoals altijd naar de
keukenprinter of het keukenscherm. Een bestelling met een allergie wordt door PlateGuard
gecontroleerd tegen de recepten. Is het bord veilig, dan krijgt de keuken een allergiebon met
"veilig, let op: noten". Is het niet veilig, dan krijgt de ober een melding en de keuken een
duidelijke "NIET SERVEREN"-bon. Ons eigen bestelscherm blijft alleen nodig voor zaken zonder
koppelbare kassa.

## Wat er al is (en blijft)

De repo heeft de bouwstenen al; dit plan voegt er alleen aan toe.

| Bouwsteen                          | Waar                                    | Wat het doet                                                                          |
| ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| Eén webhook-ingang voor elke kassa | `integrations/hooks.*`                  | Controleert de handtekening, slaat ruw op, antwoordt snel                             |
| Inbox met dubbelbescherming        | `integrations/core/inbox.repository.ts` | Hetzelfde bericht twee keer = één keer verwerkt                                       |
| Adapter per merk                   | `integrations/core/ports.ts`            | `PosAdapter` met `pullOrders`, `getOrder`, `parseWebhook`, `annotateOrder`            |
| Kassaregel wordt bord              | `modules/pos/pos.service.ts` (`ingest`) | Koppelt kassa-artikel aan gerecht, plaatst het bord op tafel en stoel, beoordeelt het |
| Allergiebon                        | `modules/print` (CloudPRNT)             | Print de bon op de keukenprinter                                                      |
| Werkend voorbeeld                  | `adapters/square`                       | Square-sandbox, met tafel/stoel uit notities                                          |

**Het verschil met nu:** vandaag zet de ober de allergie per stoel in PlateGuard, en komen alleen
de gerechten uit de kassa. In het nieuwe model komt **ook de allergie uit de kassa**. Het
contract heeft daar al een veld voor (`CanonicalOrder.seatAllergies`, capability
`order.allergens`); dat wordt nu gevuld.

## Hoe de allergie binnenkomt

### Laag 1: een allergieknop in de kassa (betrouwbaarst)

In Lightspeed K-Series heten dit _productie-instructies_: vaste keuzes zonder prijs, die de ober
bij een gerecht aantikt. Lightspeed noemt allergenen zelf als voorbeeld ("Shellfish", "Eggs",
"Peanuts"). In de API heten productie-instructies _modifiers_.

Wat de zaak doet (eenmalig, ongeveer 10 minuten, wij leveren een stappenlijst):

1. In Back Office een productie-instructiegroep **"Allergie"** maken, met de 14 EU-allergenen
   als keuzes ("Allergie: gluten", "Allergie: melk", ...) plus **"Allergie: anders (zie bon)"**.
   Meerdere keuzes toestaan.
2. Die groep aan alle gerechten hangen (of aan de categorieën).

Wat PlateGuard doet:

- Bij het koppelen haalt de adapter de groepen op (`GET /o/op/1/menu/modifiers`) en koppelt
  elke keuze aan een allergeencode. Keuzes met een herkenbare naam koppelen vanzelf (zie laag 2);
  de rest kiest de beheerder in het koppelscherm, net als bij gerechten nu.
- Bij een bestelling worden de aangetikte keuzes op een regel de allergie van **die stoel**
  (of, zonder stoel, van dat ene bord).

### Laag 2: vrije tekst herkennen (vangnet)

Obers typen ook gewoon "geen noten" of "melkallergie" in een notitie, of de zaak heeft al eigen
knoppen met andere namen. Daarom leest PlateGuard ook alle modifiers en notities van een regel
met een woordherkenner.

**Dit is al gebouwd in deze PR:** `allergiesFromText()` in
[`packages/domain/src/allergy-text.ts`](../packages/domain/src/allergy-text.ts), met tests.

- Nederlands en Engels, de 14 EU-allergenen plus noten-soorten (hazelnoot, cashew, ...).
- Een woord telt alleen naast een allergiewoord: "geen noten", "zonder ei", "notenallergie",
  "glutenvrij", "lactose intolerant", "peanut allergy". "Extra kaas", "met vis" en "Stoel 2"
  tellen niet.
- Hele woorden: "nootmuskaat" is geen noot.
- Twijfel gaat naar de kok: "Allergie kiwi" kent het niet, dus het komt als eigen tekst op de bon
  om met de hand te controleren.
- Alles wat het vindt telt als ernstig, tot een mens iets anders zegt.

Bewust níet herkend: "geen kaas" of "geen room" zonder het woord allergie. Dat zijn vaak
voorkeuren; als we die als melkallergie zien, wordt elke bon een allergiebon en let niemand er
meer op. Dit is een instelling die we later per zaak aan kunnen zetten.

### Laag 3: de gast meldt het zelf (later)

Via de QR-code op het gastmenu, gekoppeld aan de tafel. Buiten dit plan; het past op dezelfde
`seatAllergies`.

## De lastige waarheid over Lightspeed K-Series

Uit de API-documentatie (bronnen onderaan):

1. **Geen melding bij bestellingen van de ober.** De documentatie beschrijft een webhook
   ("Order Notification") alleen voor bestellingen die de koppeling zélf plaatst. Voor wat de
   ober op de iPad aanslaat staat er niets. Wel kunnen we **open rekeningen opvragen**:
   `GET /o/op/1/order/table/getCheck` (alle open rekeningen) en
   `/order/table/{tafelnummer}/getCheck`. Dat betekent **vragen in plaats van horen**: elke
   paar seconden kijken wat er nieuw is.
2. **We kunnen de keukenprinter niet onderscheppen.** De kassa print zelf naar de eigen
   printers en het eigen keukenscherm. De API heeft geen manier om een bon tegen te houden.
3. **Stoelnummers staan niet in de documentatie**, tafelnummers wel. Gangen (courses) zijn
   onduidelijk.
4. **Of aangetikte productie-instructies en notities terugkomen bij het opvragen van een open
   rekening, staat er niet expliciet.** Dit is de belangrijkste vraag voor Lightspeed.
5. Toegang via OAuth2 (scope `orders-api`, plus `offline_access`), met een demo-omgeving
   (`api.trial.lsk.lightspeed.app`). Daarvoor is een partneraccount bij Lightspeed nodig.

### Wat dat betekent voor het ontwerp: naast de keuken, niet ervoor

Omdat we de bon niet kunnen tegenhouden, zetten we PlateGuard **naast** de normale bon in plaats
van ervoor. Dat is ook veiliger: valt PlateGuard uit, dan loopt de keuken gewoon door.

- **Geen allergie:** de kassa print zoals altijd. PlateGuard doet niets zichtbaars.
- **Wel allergie:** de kassa print ook, maar de knop "Allergie: noten" staat op die bon (dat doet
  Lightspeed zelf). Dat is het signaal voor de keuken: **wacht op de PlateGuard-bon**.
  PlateGuard print binnen enkele seconden de allergiebon met het oordeel: veilig, aanpassen
  (wat weglaten) of niet serveren.
- **Niet veilig:** de ober krijgt een melding in PlateGuard (bestaande meldingen), en we schrijven
  waar dat kan een notitie terug op de rekening ("ZIE ALLERGIEBON"). Capability
  `order.annotate` bestaat al; voor Lightspeed loopt dat via `POST /o/op/1/order/local` met het
  bestaande rekeningnummer. Dit moet in de demo-omgeving bevestigd worden.

De keukenregel wordt dus: _"Staat er Allergie op de bon? Dan maak je het pas als de
PlateGuard-bon er ligt."_ Eén regel, makkelijk te trainen, en de knop zelf is de herinnering.

### Stoelen zonder stoelnummer

Lightspeed heeft geen stoel in de API. Oplossing zonder extra werk voor de ober: de allergieknop
hoort bij **het gerecht**, niet bij de stoel. PlateGuard maakt per regel met een allergieknop een
"bord met eigen allergie" en beoordeelt dat ene bord. Als de kassa wel een stoel meegeeft (zoals
bij Square via de notitie "Stoel 2"), gebruiken we die, zoals nu.

## Stappen

### Fase 0: bevestigen bij Lightspeed (voor we bouwen)

Partneraccount en demo-omgeving aanvragen, en deze vier dingen testen of navragen:

1. Komen aangetikte productie-instructies terug bij `getCheck`? Met naam en id?
2. Komt een vrije notitie per regel terug?
3. Kunnen we een regel of notitie toevoegen aan een open rekening die op de iPad begon?
4. Vuurt de Order Notification-webhook ook voor rekeningen van de ober? (Zo ja: geen polling.)

Als (1) "nee" is, werkt laag 1 niet via deze route en is de fallback de Financial API (alleen
afgesloten rekeningen, dus te laat voor de keuken). Dan wordt Lightspeed een minder goede eerste
keuze en beginnen we met MplusKASSA.

### Fase 1: allergie uit de kassa, merk-onafhankelijk

Werkt meteen ook met de Square-sandbox die er al is, dus testbaar zonder Lightspeed.

1. `CanonicalOrderLine` krijgt een veld `note` en per regel `allergies` (wat de adapter al
   herkent). De Square-adapter vult `note` uit de regelnotitie.
2. In `PosService.ingest`: per regel `allergiesFromText(...modifiers, note)` plus de gekoppelde
   allergieknoppen. Gevonden allergieën gaan naar de stoel (bestaande `saveSeat`, aangevuld, niet
   overschreven) of naar dat ene bord, vóórdat het bord beoordeeld wordt.
3. Nieuw label in het orderlogboek: `ALLERGY_FROM_POS`, zodat de beheerder ziet waar de allergie
   vandaan kwam ("uit notitie: geen noten").
4. Test met de bestaande nep-Square: een regel met notitie "notenallergie" op een notengerecht
   wordt `DO_NOT_SERVE` en geeft een bon.

### Fase 2: Lightspeed K-Series adapter

Een nieuwe map `adapters/lightspeed-k/`, op dezelfde manier als Square:

- `connect`: OAuth2 (autorisatiecode), tokens versleuteld zoals nu (`sealSecrets`).
- `listMenuItems`: artikelen, plus de productie-instructies voor het koppelscherm.
- `pullOrders`: open rekeningen via `getCheck`, alleen regels die we nog niet zagen (de bestaande
  externe id per regel doet dat al).
- Een korte poll-taak per actieve locatie, alleen tijdens openingstijden. Op Vercel kan dat niet
  in de request zelf, dus een cron (elke minuut) plus "nu verversen" vanuit het keukenscherm.
  _Dit is de grootste open vraag qua hosting; als stap 4 van fase 0 "ja" is, vervalt hij._
- `annotateOrder`: notitie terug op de rekening, als fase 0 stap 3 dat toelaat.
- Koppelscherm: het bestaande kassascherm in Beheer, met een extra blok "Allergieknoppen".

### Fase 3: MplusKASSA (kort)

MplusKASSA heeft wél webhooks (developers.mpluskassa.nl) en een tafel-API, en is groot in
Nederland. Hetzelfde adapter-patroon: webhook in, `getOrder` voor de details, bereidingsnotities
en artikelopties door dezelfde herkenner. Als Mplus de tafelwijzigingen per webhook meldt, is
het technisch eenvoudiger dan Lightspeed (geen polling). Te bevestigen met een
ontwikkelaarsaccount: welke webhook-events er zijn voor tafelbestellingen en of
bereidingsopmerkingen in de payload zitten.

## Risico's

- **Zonder knop geen controle.** Een ober die de allergie alleen mondeling doorgeeft, valt
  buiten PlateGuard. De training (en de knop op elk gerecht) is dus een deel van het product.
- **Vertraging bij polling.** Een paar seconden tot een minuut. De regel "wacht op de
  PlateGuard-bon" vangt dat op; het keukenscherm toont "allergiebon onderweg".
- **Verkeerd herkende notities.** Liever een bon te veel dan te weinig; twijfel gaat als tekst
  naar de kok. Alles wat gevonden is staat in het orderlogboek.
- **Lightspeed-partneraccount.** Doorlooptijd onbekend. Fase 1 kan zonder.

## Bronnen

- Lightspeed K-Series, modifiers: https://api-portal.lsk.lightspeed.app/guides/definitions/modifiers
- Productie-instructies: https://k-series-support.lightspeedhq.com/hc/en-us/articles/1260804656349-About-production-instructions
- Beheer productie-instructies: https://k-series-support.lightspeedhq.com/hc/en-us/articles/1260804656369-Managing-production-instructions
- API-wijzigingen en open rekeningen: https://api-docs.lsk.lightspeed.app/changes
- Authenticatie en scopes: https://api-docs.lsk.lightspeed.app/authentication
- Order Notification-webhook: https://api-docs.lsk.lightspeed.app/operation/operation-onlineordernotification
- Een andere partner over K-Series: https://storekit.com/docs/guides/integrations/pos/lightspeed-k-series
- MplusKASSA webhooks: https://developers.mpluskassa.nl/webhooks/technical-details/
