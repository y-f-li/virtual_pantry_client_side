# Virtual Pantry

This is the frontend README. You can find the backend README [here](https://github.com/sopra-fs26-group-09/sopra-fs26-group-09-server/blob/main/README.md).

## Introduction

Virtual Pantry is a collaborative calorie and nutrition tracking app for households. Users can add products by barcode, name, or receipt scan to a shared pantry, then log consumption from existing items. This avoids repeatedly searching for the same food and helps households track products that are bought, stored, and consumed by different people.

## Technologies Used

- **Next.js 15** and **React 19** for the web interface, routing, and
  client-side application pages.
- **TypeScript** for type-safe frontend development.
- **Ant Design** for UI components such as forms, tables, cards, modals,
  upload controls, tags, alerts, and layout elements.
- **Recharts** for household nutrition and statistics visualizations.
- **SockJS** and **STOMP** for WebSocket-based real-time pantry updates from
  the backend.
- **Session Storage / Local Storage** for authenticated session data and
  temporary client-side workflow state, such as receipt review sessions.
- **Fetch-based API service layer** for communicating with the Spring Boot
  backend, including authenticated requests for users, households, pantry
  items, recipes, receipts, and health goals.
- **Jest** and **React Testing Library** for frontend unit and component tests.
- **Vercel** for frontend deployment through the GitHub Actions workflow.

## High-Level Components

### 1. Household and pantry management

This part covers everything related to the shared household pantry on the frontend. [`app/households/page.tsx`](app/households/page.tsx) lets users create a new household or join one with an invite code. [`app/households/[id]/page.tsx`](app/households/[id]/page.tsx) is the main pantry view: it displays the full pantry inventory, lets users consume or remove items, and shows the calorie budget summary. [`app/households/[id]/members/page.tsx`](app/households/[id]/members/page.tsx) manages household members and shows the invite code. [`app/households/[id]/stats/page.tsx`](app/households/[id]/stats/page.tsx) shows household-level consumption statistics and budget history.

Real-time pantry updates are handled by [`app/hooks/usePantryWebSocket.ts`](app/hooks/usePantryWebSocket.ts), which opens a STOMP-over-SockJS connection and refreshes the pantry view whenever the backend broadcasts a change — so all household members see the latest pantry state without manually reloading.

### 2. Product lookup and local dataset search

This part handles finding products to add to the pantry. [`app/pantry/add/manual/page.tsx`](app/pantry/add/manual/page.tsx) supports name-based product search and fully manual entry. [`app/pantry/add/scan/page.tsx`](app/pantry/add/scan/page.tsx) supports barcode lookup and image-based meal recognition. [`app/open-food-facts/page.tsx`](app/open-food-facts/page.tsx) provides a standalone product search page for looking up nutrition information without directly adding to the pantry.

[`app/components/products/ProductResultCard.tsx`](app/components/products/ProductResultCard.tsx) is the shared component used across all product lookup flows to display a product result with its name, brand, nutrition data, and quantity inputs. [`app/utils/productExport.ts`](app/utils/productExport.ts) contains helpers for converting product data into the format expected by the pantry add API.

### 3. Receipt scanning and product matching

This part implements the receipt-based pantry add flow. [`app/pantry/add/receipt/page.tsx`](app/pantry/add/receipt/page.tsx) lets users upload a receipt image, which is sent to the backend for OCR processing. After OCR, the frontend stores the extracted receipt session in local storage and navigates to the review screen.

[`app/pantry/add/receipt/review/page.tsx`](app/pantry/add/receipt/review/page.tsx) is the review step: it shows each extracted receipt line alongside candidate product matches from the local dataset. The user can inspect each item, select the right product match, edit quantities, remove incorrect entries, and confirm which items to add to the pantry. This two-step flow (upload → review) mirrors the backend's two-phase approach of OCR extraction followed by product candidate matching.

### 4. Nutrition, micronutrients, and daily intake

This part covers the personal nutrition and health goal side of the application. [`app/users/[id]/health-goal/page.tsx`](app/users/[id]/health-goal/page.tsx) lets users enter their physical stats and weight goal, then displays a recommended daily calorie target calculated by the backend (using the Mifflin-St Jeor model with age-based deficit limits). [`app/users/[id]/details/edit/page.tsx`](app/users/[id]/details/edit/page.tsx) manages the personal profile including birth date and life stage group, which the backend uses to determine micronutrient reference values. [`app/users/[id]/details/nutrition-reference/page.tsx`](app/users/[id]/details/nutrition-reference/page.tsx) displays the micronutrient reference table for the user's age and life stage alongside their actual daily intake.

Household-level calorie statistics, including consumption trends and budget tracking, are shown in [`app/households/[id]/stats/page.tsx`](app/households/[id]/stats/page.tsx) using Recharts visualizations.

### 5. Recipe recommendations

This part helps users turn pantry inventory into meal ideas. [`app/recipes/page.tsx`](app/recipes/page.tsx) requests recipe recommendations for the selected household and displays each recipe with a match score, nutrition summary, source label, available ingredients, missing ingredients, and a detail modal. Recipes returned by the backend can come from the curated local recipe catalog (`Local recipe`) or from the dynamic pantry generator (`Pantry generated`).

The frontend does not match recipe ingredients by itself. It displays the backend result, including whether each ingredient was matched to a pantry item. On the backend, each recipe ingredient has one or more keywords, and the backend compares those keywords with normalized pantry item names. For example, an ingredient such as `Eggs` can match pantry items whose names contain `egg` or `eggs`, and `Avocado` can match a pantry item whose name contains `avocado`.

For local testing, the following barcodes are useful because they can be added to the pantry and then matched by recipe recommendations:

- `20408466` — egg
- `7610632951347` — avocado

After adding these products to a household pantry, opening the recipe page should show recipes that recognize the matched ingredients, such as egg-based breakfast recipes or avocado toast/bowl recipes. This also makes it easier to verify the `Local recipe` / `Pantry generated` source labels and the missing-ingredient display.

### How the components work together

The household pantry page is the central point of the frontend. Products found through name search, barcode scan, or receipt review all feed into the same pantry add flow. Once items are in the pantry and users consume them, the real-time WebSocket hook keeps every household member's pantry view current. The consumption data drives both the household statistics page and the personal nutrition tracking pages, connecting the shared pantry to individual health goals.

## Launch & Deployment

### Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See the Deployment section below for notes on how to deploy the project on a live system.

### Prerequisites

Make sure you have the following installed:

**Frontend**
- [Node.js 22+](https://nodejs.org/) and npm

**Backend**
- [Java 17+](https://adoptium.net/)
- An [OpenAI API key](https://platform.openai.com/api-keys) (required for meal food recognition)
- An Azure Document Intelligence endpoint and API key (required for receipt scanning): set `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` and `AZURE_DOCUMENT_INTELLIGENCE_API_KEY`

### Installing

Clone both repositories:

```bash
git clone https://github.com/sopra-fs26-group-09/sopra-fs26-group-09-server.git
git clone https://github.com/sopra-fs26-group-09/sopra-fs26-group-09-client.git
```

Start the backend:

```bash
cd sopra-fs26-group-09-server
OPENAI_API_KEY=<your-key> ./gradlew bootRun
```

The server starts on **http://localhost:8080**. An in-memory H2 database is created automatically — no database installation needed. You can inspect it at:

- URL: `http://localhost:8080/h2-console`
- JDBC URL: `jdbc:h2:mem:testdb`
- User: `sa`
- Password: *(leave empty)*

Start the frontend (from the parent directory):

```bash
cd ../sopra-fs26-group-09-client
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

### Running the tests

**Frontend**

```bash
npm test                    # single run
npm run test:coverage       # with coverage report
```

**Backend**

```bash
cd ../sopra-fs26-group-09-server
./gradlew test
```

### Deployment

Every push to `main` triggers the GitHub Actions workflows automatically:

- **Frontend** is deployed to [Vercel](https://vercel.com).
- **Backend** is deployed to [Google App Engine](https://cloud.google.com/appengine).

**One-time setup**:

Frontend — add the following [repository secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions) to the client repo:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

And the following environment variable:
- `NEXT_PUBLIC_PROD_API_URL` — your backend's public URL (e.g. the App Engine URL). If not set, defaults to the hosted server URL defined in `app/utils/domain.ts`.

Backend — add the following secret to the server repo:
- `GCP_SERVICE_CREDENTIALS` (Google Cloud service account JSON)

**Build for production manually:**

```bash
# Frontend (from sopra-fs26-group-09-client)
npm run build
npm run start               # serves the build on http://localhost:3000

# Backend (from sopra-fs26-group-09-server)
./gradlew clean build
java -jar build/libs/*.jar
```

## Illustrations

Virtual Pantry is built around a shared household pantry. After authentication,
the user can create or join a household and use the household page as the main
entry point for managing food items. From there, items can be added manually,
through product lookup, by scanning a product image, or by uploading a receipt.
The pantry overview shows the current inventory and helps users keep track of
available quantities, product information, and expiry dates.

The receipt upload flow supports a more realistic shopping scenario. Instead of
directly importing every OCR result, the application first extracts receipt line
items and proposes product matches. The review screen then lets the user inspect
each extracted item, compare candidate products, correct details, remove
incorrect entries, and decide which items should be added to the pantry. This
keeps the interface transparent when OCR or product matching is uncertain.

The pantry data is reused throughout the rest of the application. Users can set
personal health goals and inspect household nutrition statistics based on stored
pantry and consumption data. The recipe page recommends meals from the current
pantry, highlights which ingredients are already available, lists missing
ingredients, and explains how well each recipe fits the household's health goals.
Recipe recommendations also indicate their source, such as the curated local
catalog or the dynamic pantry generator.

The following screenshots illustrate the main user flows:

![Household pantry overview](docs/screenshots/01-dashboard.png)

![Add item flow](docs/screenshots/02-add-item.png)

![Receipt review flow](docs/screenshots/03-receipt-review.png)

![Recipe recommendations](docs/screenshots/04-recipes.png)

![Health goal or nutrition statistics](docs/screenshots/05-stats-or-health-goal.png)

## Roadmap

New developers can contribute by adding the following features:

- **LLM diet chatbot** — A chat interface where users can ask diet and nutrition questions. Answers are personalized based on the current pantry, consumption history, and health goals.

- **Auto-generated shopping list** — Automatically build a shopping list from low-stock pantry items and missing recipe ingredients. The list can be shared across household members.

- **Weekly meal planner** — Generate a personalized weekly meal plan based on health goals and current pantry contents. The planner highlights missing ingredients and estimates daily calorie coverage for each day.

## Authors and Acknowledgment

This project was developed by Group 09 as part of the Software Praktikum (SoPra) FS26 at the University of Zurich.

### Authors

- Maxim Emelianov
- Tingting Xu
- Tingyuan Wang
- Yifu Li

### Acknowledgment

We would like to thank the SoPra teaching team and our teaching assistant for their guidance and feedback throughout the project. We also acknowledge Open Food Facts and Azure Document Intelligence for providing datasets and external services that helped support the product lookup and receipt scanning features.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
