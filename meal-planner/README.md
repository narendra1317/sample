# Vantillu (వంటిల్లు) – weekly Andhra kitchen planner

A single-file web app for planning a week of Andhra-style home cooking and building the grocery list from your pantry. It is written for shopping in Aberdeen: each item is marked for the Asian grocer, the supermarket, or either one.

Open `index.html` in any browser, or serve the repo with GitHub Pages and add it to your phone's home screen.

## What it does

- **Today**: the day's breakfast, lunch and dinner with ingredient pictures, short cooking steps and a *Mark as cooked* button that takes the ingredients out of the pantry. A side panel lists items that are close to their best-before.
- **Week**: a Mon–Sun menu grid. **Auto-plan** fills empty slots in the usual Andhra pattern (tiffin; pappu + kura + annam; pulusu/kura + annam/chapati). It favours dishes your pantry already covers and uses up items that need eating first.
- **Shop**: your own list. Nothing is added unless you choose it. Tap **+ Add groceries** to pick from the illustrated grocery grid, or use **+ List** on any pantry tile. Below the list, *Suggested for your meals* shows what your planned meals need beyond your pantry, rounded up to real pack sizes. Tap **Add** for the ones you want or **Not needed** for the rest. Change pack counts with −/+, tick items off as you shop, then *Put in pantry* at home. The list is grouped by shop with a rough £ estimate, and *Copy list* gives plain text for WhatsApp or Notes.
- **Pantry**: 55 groceries with Telugu names and pictures. Use +/− to set quantities, and set the tadka-box staples to stocked, low or out. These levels are for your own reference and never add anything to the list.
- **Dishes**: 45 Andhra recipes. Tap vegetables to find the dishes that combine them, or build your own dish from grocery tiles.

Data is saved in the browser's local storage. When opened as a Claude artifact, it also syncs across your devices.
