# Overvakingskartet — strateginotat (datagrunna)
**13. juni 2026 · bygd på heile Notion-fasiten, 232 rader**

## Korrigering
Mitt fyrste notat bygde på deployert `graph.json` (62 nodar / 47 kantar, flat) — ein utdatert, tapsbringande projeksjon. Eg har no lese heile databasen: **104 nodar, 128 kantar, 26 felt.** Konklusjonen snur. **Modellen din er ikkje problemet — han er betre enn The Authoritarian Stack på fleire punkt.** Problemet er publiseringa og kjeldsetjinga av kantane.

## Kva du faktisk har bygd (og som ikkje vises på sida)
Modellen kodar alt KVEN / KVA / KORLEIS:
- **KVEN** — Organisasjon (29) + Person (14). Person-nodane fangar *svingdøra*: justisministrar, politidirektørar, riksadvokat → etat (Relasjonstype «Personplassering (svingdør)», «Utnemnd»). Det er Authoritarian-Stack-utvidinga — alt påbyrja.
- **KVA** — System (26) + Måling (45 kvantitative metrikkar: tal kamera, passeringar/døgn, personar omfatta, lagringstid). Authoritarian Stack kvantifiserer pengar; du kvantifiserer *omfang*.
- **KORLEIS** — Lovheimel (14) + Tilgang-kantane (Mekanisme, Tilgangsnivå 0–4, Praksis) + Sak (3) + Datadeling (5, kryssande grense).
- Pluss Tilsyn (3) og ein **Forsking-backlog (18) med Prioritet** — du har bygd forskingsstyringa inn i sjølve grafen.

Nodelaget er sterkt kjeldebelagt: **Organisasjon ~100 % skildring + kjelde, System ~100 % kjelde.** Det skortar ikkje her.

## Dei tre reelle gapa
1. **Publiseringa kastar vekk ~90 %.** Deployert `graph.json` er 62/47 med berre `relation`. Han droppar Skildring, Kjelde-URL, Tilgangsnivå, Mekanisme, Praksis — og *heile* Person-, Forsking-, Måling- og Sak-laga. Panelet viser «DNA-registeret → Kripos: Eig» (eitt ord) av ei rad som i Notion har skildring, kjelde *og* lovheimel. **Synken og frontend er flaskehalsen, ikkje datamodellen.**
2. **Kjeldsetjinga er opp-ned.** Nodane (kven/kva) er ~100 % kjeldebelagt, men **Tilgang-kantane — sjølve påstanden «X kan sjå Y» — er 95 % ukjeldebelagt** (4 av 75 har Kjelde-URL), og Tilgangsnivå/Praksis er fylt på berre ~20 %. I eit overvakingskart *er kanten påstanden*. Same gjeld Datadeling (PNR-EU, NATO, USA): 0 % kjelde — og det er politisk det kjælnaste laget.
3. **To nodetypar er tomme skal.** Lovheimel (0 % skildring) og Sak (0 % skildring/kjelde). Dette er nettopp KORLEIS-beviset — lova og det dokumenterte tilfellet — og dei står tomme.

## Sju grep (prioritert rekkefølgje)
1. **Fiks projeksjonen fyrst.** Skriv om `sync:notion` så `graph.json` ber *alle* felta og *alle* 232 radene, med node-rader skilde frå relasjons-rader på Frå/Til. Eitt tap-fritt grensesnitt. Dette åleine doblar kartet og fyller panelet.
2. **Render det rike panelet** (som Authoritarian Stack): Skildring + Kjelde-URL/-tittel + Tilgangsnivå + Mekanisme + Praksis + tilknytte Målingar. Dataen finst alt.
3. **Kjeldekrav på kantar.** Gjer Kjelde-URL obligatorisk på Tilgang og Datadeling. Mål: 5 % → 100 %. Gråa ut ukjeldebelagte kantar i visninga.
4. **Fyll Tilgangsnivå / Mekanisme / Praksis** på alle 75 Tilgang-kantane. Det er dette som gjer kartet til eit *argument om makt*, ikkje ei lenkjeliste.
5. **Skriv ut Lovheimel og Sak.** Kvar §: kva han heimlar, terskel, kven. Kvar sak (Brumunddal, EOS-PNR, Tinius) knytt til dei konkrete kantane han dokumenterer → bevislaget.
6. **Tøm Forsking-backlogen** etter Prioritet (Høg fyrst: Avinor-kamera, AutoPASS-bomstasjonar, kjøpesenter-CCTV). Dette er den ferdige forskingsplanen din.
7. **Innsyns-pipeline.** Behald Notion = fasit; legg til strukturert tips/innsyn-intak (GitHub issue-mal) for kameralokasjonar → redaktør → Notion. Slik skalerer kameralaget der det ikkje finst noko offentleg register (meldeplikta fall bort med GDPR-overgangen).

## Rotkart for neste runde
- **Fase 0 (no):** Tap-fri sync + rikt panel. Synleggjer det du alt har.
- **Fase 1 (forskingskjernen):** 100 % kjelde + Tilgangsnivå/Praksis på alle 128 kantar; skriv ut lover og saker.
- **Fase 2:** Tøm backlog; bygg kameralaget via innsyn; dekning- og uvisse-visning.
- **Fase 3:** Skaler Person/makt-laget (svingdør, eigarskap, finansiering) — same Tilgang-objekt, frå overvaking til makt-konsentrasjon.

---
**Prinsippet står:** kvar relasjon ein påstand, kvar påstand ei kjelde. Du har bygd huset — no manglar berre at *kantane får kjelder* og at *vindauga (frontend) faktisk viser romma*.

<sub>Grunnlag: Notion-databasen «Overvakingskartet» (104 nodar / 128 kantar, henta 13.06.2026) og deployert `data/graph.json` (62/47). Fyllingsgrad rekna over alle 232 rader.</sub>
