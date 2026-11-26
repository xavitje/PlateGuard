# Wat nog ontbreekt voor een pilot met een kassakoppeling

_26 november 2026. Wat klaar is staat onderaan._

## Moet, voordat een restaurant ermee werkt

1. **Inloggen bij Lightspeed met OAuth.** Nu plakt de beheerder een access token. Een echt
   restaurant moet op "Koppelen" klikken en bij Lightspeed inloggen; daarvoor zijn de client
   id en secret van onze partner-app nodig. Ook het verversen van het token hoort daarbij,
   anders stopt de koppeling na een paar uur.
2. **Automatisch ophalen bij Lightspeed.** Lightspeed stuurt geen webhooks; nu haalt PlateGuard
   de open rekeningen alleen op als iemand op "Open bestellingen ophalen" drukt. Nodig: elke
   15 tot 30 seconden tijdens de service. Vercel-crons kunnen dat niet op het gratis plan
   (alleen eens per dag). Opties: Vercel Pro (elke minuut), of het keukenscherm laat het
   ophalen gebeuren zolang het open staat.
3. **De echte velden controleren.** De Lightspeed- en Mplus-adapters volgen de voorbeelden in
   hun documentatie, maar zijn niet tegen een echt account getest. Met het demo-account
   (Lightspeed) en het Tier 1-testaccount (Mplus) controleren:
   - komen aangetikte productie-instructies (Lightspeed) en bereidingswijzen (Mplus) mee in de
     bestelling, en onder welke veldnaam;
   - waar staat het bestelnummer bij Mplus (`tableOrder.orderId` of `session.sessionId`);
   - hoe ondertekent Mplus precies (de documentatie is daar niet eenduidig over).
4. **Stoelnummers.** Lightspeed en Mplus kennen geen stoel. De oplossing in de app: de zaak
   maakt een knoppengroep "Stoel 1" t/m "Stoel 8", en de ober tikt die aan bij een gerecht.
   Zonder stoel wordt een regel overgeslagen (zie het logboek). Navragen of Lightspeed zelf
   stoelen meestuurt; zo niet, is een bord met een eigen allergie zonder stoel een volgende
   stap.
5. **Een keukenprinter in de pilotzaak** die CloudPRNT ondersteunt (Star TSP100IV of mC-Print3),
   of het PlateGuard-keukenscherm op een tablet. Zonder een van beide ziet de keuken de
   allergiebon niet.

## Moet, maar is niet technisch

- **Een installatielijst voor de zaak**: de knoppengroep "Allergie" met de 14 allergenen en de
  groep "Stoel" in de kassa zetten, en de afspraak in de keuken: _staat er Allergie op de bon,
  wacht dan op de PlateGuard-bon_.
- **Gerechten koppelen**: elk kassa-artikel aan een gerecht in PlateGuard. Bij Lightspeed en
  Mplus verschijnen artikelen pas na de eerste keer aanslaan; een artikellijst ophalen vraagt
  hun Items-API (Lightspeed) of SOAP-API (Mplus).
- **Verwerkersovereenkomst** met de pilotzaak: allergieën zijn gezondheidsgegevens.

## Kan later

- Een notitie terugschrijven op de rekening ("ZIE ALLERGIEBON") bij een bord dat niet geserveerd
  mag worden. Lightspeed lijkt dat toe te laten via een update van de rekening; Mplus niet.
- De herkenning van notities per zaak strenger of losser zetten ("geen kaas" als melk tellen).
- Square buiten de sandbox; Square is in Nederland weinig gebruikt.

## Klaar

- Allergie uit de kassa: knoppen en notities op een regel komen bij de stoel, vóór het bord
  beoordeeld wordt. Wat de bediening zelf invoerde blijft staan.
- Per kassaknop instellen welke allergie hij betekent, of "nooit een allergie".
- Webhooks-pagina met het adres, het instellen en het logboek per bericht.
- Kassa kiezen bij het koppelen: Square (test), Lightspeed K-Series, MplusKASSA.
- Lightspeed: open rekeningen ophalen, rekening opvragen, knoppen (productie-instructies)
  lezen, stoel uit een "Stoel 2"-knop.
- Mplus: ondertekende webhooks met de eventnaam achter het adres, de hele sessie als bestelling,
  afgeronde en geannuleerde sessies.
- De allergiebon naast de gewone kassabon werkte al voor kassabestellingen.
