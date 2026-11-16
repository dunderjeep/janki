# NutriLabel

Nutrition tables and package labels worked out from your recipes, on your own computer: Canada's bilingual Nutrition Facts table, and Norway's næringsdeklarasjon (the EU format).

> Work in progress. Canada: the bilingual standard format. Norway: the tabular EU format, in Norwegian (bokmål). Other EU languages, the Canadian linear and horizontal formats, and a US format are planned.

## What it does

1. **Ingredients**: enter each one exactly as its own package prints it (serving and amounts), or copy it per 100 g from the Canadian Nutrient File. Checks flag labels that don't add up: fibre + sugars more than carbohydrate, calories that don't fit the macros, blank amounts.
2. **Products**: a recipe in grams per batch, an optional finished-batch weight for cooking loss, and a serving chosen against Health Canada's Table of Reference Amounts.
3. **The label**: per 100 g → per serving → CFIA rounding → % Daily Value. The ingredient list is sorted heaviest first, and the "Contains" line comes from the allergens. **Show the working** traces every number on the label back to its rounding step.
4. **Printing**: print the table alone, or a whole package label (names, net quantity, ingredients in English and French, allergens, storage, who made it).

The arithmetic lives in `src/lib/engine.ts`, with no database or React. It is tested against the NutriLabel CA spreadsheet it was ported from (`npm test`).

## Norway (EU format)

The same recipe and ingredients give a Norwegian label; switch with **Canada / Norge** above the label, and choose the default on the Business tab. What changes:

- **Per 100 g**, or per 100 ml when the portion is a volume and you give its weight. A per-portion column with %RI is optional.
- **Carbohydrate leaves fibre out**, and **salt** (sodium × 2.5) replaces sodium. Ingredients can be typed straight off a Norwegian package ("Norwegian / EU label" on the ingredient); they are stored the Canadian way, so one ingredient serves both labels.
- **Energy** in kJ and kcal is worked out from the nutrients with the Annex XIV factors, not added up from the ingredients' labels; the working shows both.
- **Rounding** follows the European Commission's guidance on tolerances (2012), printed with decimal commas.
- **Allergens** are printed in bold in the ingredient list: NutriLabel finds the allergen in the Norwegian name (hvetemel → **hvete**mel) or adds it in brackets (mozzarella (**melk**)). Put `*stars*` around a part to choose it yourself. Celery and lupin, which the EU lists and Canada doesn't, are included.
- The package label has the name, ingredients, an optional "Kan inneholde spor av…" line, net quantity, storage, the date line and the producer.

Sources: Regulation (EU) No 1169/2011 (Annexes I, XIII, XIV and XV), taken into Norwegian law by matinformasjonsforskriften; European Commission, *Guidance document for competent authorities for the control of compliance with EU legislation … with regard to the setting of tolerances for nutrient values declared on a label* (December 2012).

Food sold in small quantities straight from the maker to the consumer, or to local shops that sell to consumers, is exempt from the nutrition declaration (Regulation 1169/2011, Annex V, point 19), though the ingredient list and allergens still apply. Check with Mattilsynet for your case.

## Run it

Needs Node 20 or later.

```bash
npm install
npm run dev        # http://127.0.0.1:3211
```

There is no sign-in. NutriLabel listens only on `127.0.0.1`. Data is kept in `~/.nutrilabel`; set `NUTRILABEL_DATA_DIR` to move it. The database is PGlite, real Postgres compiled to WebAssembly, so there is nothing else to install.

## Inside another app

NutriLabel is also a package that a Next.js app can host:

1. Call `setNutrilabelHost({ db, userId, recipes? })` from `nutrilabel/server`.
2. Mount `nutrilabel/api` at `/api/nutrilabel/[...path]`.
3. Render `<NutriLabelApp>` from `nutrilabel/ui`.
4. Apply `migrations/*.sql`.

`recipes` is optional. If the host provides it, products can be started from the host's own recipes.

## Sources

- Rounding: CFIA, *Rounding and manner of expression for Nutrition Facts table core information* (FDR B.01.401).
- Daily Values: Health Canada, Table of Daily Values (2022).
- Reference amounts: Health Canada, Table of Reference Amounts for Food (October 2024), in `data/reference-amounts.json`.
- Food composition: Health Canada, Canadian Nutrient File, in `data/cnf.json`.
- Norway/EU: Regulation (EU) No 1169/2011 (reference intakes, energy factors, presentation), and the Commission's 2012 guidance on tolerances (rounding).

Health Canada data is used under the Open Government Licence – Canada.

NutriLabel does the arithmetic. You are responsible for what your label says; check it against the CFIA Industry Labelling Tool, or with Mattilsynet in Norway.

## Licence

Copyright © 2026 Clifford Coulter.

NutriLabel is open source under the MIT License (see `LICENSE`): use it, change it and share it, keeping the copyright notice.

The data in `data/` is Health Canada's, used under the Open Government Licence – Canada; keep its attribution.
