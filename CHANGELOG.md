# Changelog

Alle noemenswaardige wijzigingen aan Lijstjes, nieuwste bovenaan.
Notatie: versienummer = `package.json` / Android `versionName` (`versionCode`).

## [1.3.0] — 2026-10-11

**Oud:** 1.2.0 — `versionName "1.2"` (`versionCode 2`)
**Nieuw:** 1.3.0 — `versionName "1.3"` (`versionCode 3`)

### Registratie en account

- Open registratie: het uitnodigingssysteem is volledig verwijderd (tabellen, servertrigger en
  deep link). Iedereen kan nu zelf een account aanmaken; er is geen token meer nodig.
- E-mailbevestiging is verplicht. Na registreren toont de app het scherm `Er is een email
verzonden naar <e-mailadres>. Klik op de link in de mail om uw account te accepteren.` met de
  mogelijkheid een nieuwe verificatielink op te vragen (met 60 seconden cooldown).
- Inloggen zonder bevestiging wordt tegengehouden; de app verwijst dan naar het
  verificatiescherm in plaats van een technische fout te tonen.
- De bevestigingslink opent de app en logt direct in, waarna kort een groene bevestiging
  (`Je account is bevestigd.`) verschijnt. Wachtwoord herstellen blijft werken via dezelfde
  deep link, maar wordt niet meer verward met een bevestigingslink.
- De afdwinging gebeurt op de server: Supabase-instelling `Confirm email` staat aan en de
  toegangsregels van lijsten en items eisen een bevestigd e-mailadres (`is_email_confirmed()`),
  zodat een sessie zonder bevestiging niets kan lezen of schrijven.

### Weergave

- De inlogpagina heeft weer een `Registreren`-knop naar de registratiepagina.
- Op de registratiepagina heeft ook het veld 'Wachtwoord herhalen' nu een oogje om het
  wachtwoord te tonen of te verbergen, net als het wachtwoordveld.
- De bevestigingsdialoog bij het verwijderen van een lijst heeft knoppen van gelijke hoogte met
  kleinere tekst.
- Nieuw verificatiescherm met de instructie en de knop voor een nieuwe link.

### Kwaliteit

- Tests bijgewerkt en uitgebreid voor de nieuwe registratie-, verificatie- en deep link-logica.

### Android

- Voor het eerst een eigen **release-keystore**: de gedeelde APK is voortaan een ondertekende
  release-build in plaats van een debug-build, zodat toestellen updates kunnen installeren
  zonder de app eerst te verwijderen. De keystore ligt buiten de repository en is geback-upt.
- Versienummer opgehoogd naar 1.3.0 (`versionCode 3`).

## [1.2.0] — 2026-10-06

**Oud:** 0.1.0 — `versionName "0.1"` (`versionCode 1`)
**Nieuw:** 1.2.0 — `versionName "1.2"` (`versionCode 2`)

### Registratie en account

- Registratie op uitnodiging: alleen via een persoonlijke, eenmalige uitnodigingslink die na
  7 dagen verloopt; de controle gebeurt op de server, niet in de app.
- Deep link `com.lijstjes.app://invite?...` opent de app direct op de registratiepagina; in de
  browser te testen via `?invite=` of `#invite=`. Uitnodigingstokens verdwijnen meteen uit de
  URL en worden nergens bewaard.
- Nieuwe registratiepagina met vooringevuld e-mailadres en wachtwoord van minimaal 6 tekens, en
  nette Nederlandse meldingen bij een ongeldige of verlopen link.
- Wachtwoord herstellen is afgemaakt: de herstelmail opent de app op een pagina voor een nieuw
  wachtwoord. Bewuste beperking: zonder eigen mailserver kan de mail uitblijven; de app meldt
  dat zonder technische termen.
- Inlogpagina opgeschoond: geen registratieknop en geen losse hint over accountaanmaak meer.

### Items verwijderen

- Item verwijderen en 'Verwijder afgevinkt' werken met één knop: de eerste klik zet de knop
  oranje (armed), de tweede klik voert pas uit.
- Automatisch herstel na 5 seconden, bij ESC, bij het wisselen van tabblad en bij het wisselen
  van lijst.
- Altijd maar één knop tegelijk armed; de verwijderknop is ook zonder hover zichtbaar (touch).

### Synchronisatie

- Geen technische fouten meer in de UI: foutmeldingen worden vertaald naar leesbare Nederlandse
  tekst.
- De foutstatus is alleen nog een rode pill (`Fout bij synchroniseren`) die na 1,5 seconde
  inklapt tot een rode dot; er staat geen tekst meer onder de pill.
- Offline gaan maakt de status direct rood in plaats van te blijven hangen; terug online herstelt
  de app naar `Gesynchroniseerd`. Vastlopende verbindingen worden na 10 seconden afgebroken.

### Weergave

- Nieuw laadscherm bij het opstarten: apptitel `Lijstjes` met oranje streep en een spinner
  rechtsonder, niet scrollbaar.
- Accountmenu in vaste volgorde (`+ Nieuw lijstje`, `Account`, e-mail, `Uitloggen`); de
  accountknop is oranje zolang het menu open is.
- De blauwe tik-flits op Android is weg; de focusring blijft zichtbaar.
- De titel `Mijn Lijstjes` wordt niet meer afgeknipt (de onderkant van de 'j' blijft zichtbaar).
- Item-checkboxen zijn vierkant met afgeronde hoeken.
- De titelstreep van het laadscherm staat links uitgelijnd met de titel.

### Kwaliteit

- Automatische tests toegevoegd voor de nieuwe en gewijzigde logica.
- Versienummer opgehoogd naar 1.2.0 (`versionCode 2`).

## [0.1.0] — 2026-09-29

Eerste release na de herbouw van de app. De oude, losse versie is hiermee vervangen en de
restbestanden daarvan zijn verwijderd.

### Nieuwe basis

- App herbouwd op Vue 3 met strikte TypeScript-controle en een moderne build-stap.
- Gegevens gaan via Supabase (accounts + database); geen losse CDN-koppeling meer.
- Offline-first: wijzigingen belanden eerst in een wachtrij en worden daarna verzonden, dus
  werken zonder verbinding blijft mogelijk.
- Opslag is per gebruiker gescheiden, zodat accounts elkaars gegevens niet kunnen zien; het
  datalek uit de oude versie is opgelost.
- Lijsten en items worden één voor één toegevoegd, gewijzigd of verwijderd in plaats van alles
  in bulk te vervangen.
- Toegangsregels op de server voor lijsten en items, bovenop het filteren per eigenaar.
- Nieuwe accounts starten leeg; de oude voorbeeldlijsten zijn verdwenen.

### Lijsten en items

- Lijstoverzicht met lijstkaarten en een detailweergave met items: toevoegen, afvinken,
  verwijderen, afgevinkte items opruimen en slepen om te herordenen.
- Lijst verwijderen gebeurt vanuit het overzicht, met bevestiging door de exacte lijsttitel in
  te typen; de oude `window.confirm`-melding is weg.
- Sync-indicator met de status gesynchroniseerd / in wachtrij / fout en het tijdstip van de
  laatste geslaagde sync.

### Kwaliteit

- Datacontrole toegevoegd voor de opslag- en synchronisatielaag.

### Android

- Android-app via Capacitor; een debug-APK is gebouwd en lokaal bewaard (niet in de repository).
