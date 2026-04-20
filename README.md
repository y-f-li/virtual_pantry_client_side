# Virtual Pantry Calorie Counter

Check it out here: https://sopra-fs26-client-six.vercel.app/

## Menu
- [1. Tech Stack and Programming Skills Used](#1-tech-stack-and-programming-skills-used)
- [2. User Guide](#2-user-guide)
- [3. App Flow Summary](#3-app-flow-summary)
- [4. Notes on the Current Iteration](#4-notes-on-the-current-prototype)

## 1. Tech Stack and Programming Skills Used

This project is a full-stack web application prototype for tracking pantry inventory and estimating total calorie currently in the pantry and calorie consumption over time. It combines a TypeScript front end, a Java Spring Boot back end, an in-memory database, and the Open Food Facts API.

### Front End

The client is built with **TypeScript**, **React**, and **Next.js**.

What that means in practice:

- **TypeScript** is used to give the client code strong types for users, pantry items, product lookups, statistics, errors, and guest sessions. That makes the UI logic safer and easier to maintain.
- **React** is used to build the app as reusable page components and state-driven interfaces.
- **Next.js App Router** is used for page-based routing such as `/`, `/login`, `/register`, `/pantry`, `/lookup`, and `/users`.
- **Ant Design** is used for the visual UI layer: cards, tables, forms, buttons, inputs, and layout elements.
- A custom **API service layer** wraps `fetch()` and handles:
  - JSON request/response handling
  - error parsing
  - attaching the auth token automatically
  - support for `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`
- Client-side session logic is handled with:
  - `localStorage` for regular registered-user login
  - `sessionStorage` for demo mode
- The front end also includes a **guest-session cleanup boundary**, which clears the demo pantry session when the browser tab/page session ends.

Programming skills demonstrated on the client side:

- Type-safe React/Next.js application development
- form handling and validation
- state-driven UI updates
- client-side session handling
- integration with REST endpoints
- component-based website construction
- lightweight UX design for a product/demo workflow

### Back End

The server is built with **Java**, **Spring Boot**, **Spring Web**, **Spring Data JPA**, and **Hibernate**.

The back end follows a classic **controller-service-repository** structure.

#### Controllers

The controllers define the REST endpoints and route incoming HTTP requests to the right service logic.

Main controllers in this app:

- **`UserController`**
  - user registration
  - login/logout
  - user profile retrieval
  - user updates such as password changes
- **`PantryController`**
  - get pantry items
  - add pantry items
  - consume one unit of an item
  - delete an item
  - update the ideal calorie budget
  - fetch pantry statistics for a chosen date range
- **`ProductController`**
  - barcode lookup through Open Food Facts
- **`GuestSessionController`**
  - create a temporary demo session
  - clear the demo session

Programming skill shown here:

- REST API design
- HTTP method design (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`)
- authentication checks via request headers
- endpoint separation by responsibility

#### Services

The services contain the actual application logic.

- **`UserService`** handles registration, authentication, login/logout, and user updates.
- **`PantryService`** handles persistent pantry logic for registered users:
  - pantry item creation
  - consume-one logic
  - calorie statistics calculation
  - ideal daily calorie budget handling
- **`GuestSessionService`** handles the demo mode:
  - creates a temporary guest token
  - stores pantry data in memory instead of persistent database tables
  - keeps demo state isolated per session
  - clears the demo pantry when the session ends or expires
- **`OpenFoodFactsService`** is the external API integration layer:
  - looks up products by barcode
  - parses the returned JSON
  - extracts product name, brand, energy, and package quantity
  - estimates calories per package from the nutrition and quantity data

Programming skill shown here:

- business-logic design
- external API integration
- defensive parsing of real-world JSON data
- calorie estimation logic from mixed nutrition/package fields
- temporary in-memory demo session design

#### Repositories

The repositories are the persistence layer and are used by Spring Data JPA to read and write data.

Main repositories:

- **`UserRepository`**
- **`PantryItemRepository`**
- **`PantryConsumptionEventRepository`**
- **`PantrySettingsRepository`**

These repositories support the persistent part of the application for registered users.

Programming skill shown here:

- ORM-based persistence with JPA/Hibernate
- database-backed CRUD operations
- separation of persistence from business logic

### Data Model

The server defines several entities that reflect the pantry domain.

- **`User`**: account identity and authentication-related data
- **`PantryItem`**: what is currently owned in the pantry
- **`PantryConsumptionEvent`**: each `Consume 1` action is logged as its own event so calorie consumption statistics remain reliable
- **`PantrySettings`**: stores the ideal daily calorie budget

A useful design choice here is that **consumption is logged separately from pantry stock**. That means the app can both:

- show how many calories are still in the pantry now
- compute how many calories have been consumed over time

### Database and Persistence

The current server configuration uses **H2 in-memory database**.

That means:

- registered-user pantry data persists while the server is running
- the database is lightweight and easy to use for prototyping
- if the server restarts, the in-memory database resets

### Open Food Facts API Wiring

The app integrates the **Open Food Facts** public product database.

In the current prototype, the product lookup flow works like this:

1. The client sends a barcode to the server.
2. The server calls the Open Food Facts product endpoint.
3. The response JSON is parsed.
4. The app extracts:
   - barcode
   - product name
   - brand
   - calories per 100g or 100ml
   - package quantity/unit
5. The server estimates **calories per package**.
6. That enriched product information is returned to the client.
7. The client can then add that item into the pantry with a chosen quantity.

The front end also fetches a product image directly from Open Food Facts for the lookup result card when an image is available.

Programming skills demonstrated by this integration:

- working with third-party HTTP APIs
- JSON parsing and field extraction
- error handling around upstream failures
- transforming external data into app-specific DTOs

### Demo Mode Architecture

For easy testing of the features in this app, a **guest demo mode** is implemented.

Instead of forcing a new user to register immediately, the app lets them enter a disposable pantry session.

How it works:

- pressing **Guest** creates a guest session token on the server
- that token is stored in `sessionStorage`, not `localStorage`
- the guest pantry is stored in temporary server-side memory
- when the browser session ends, the client asks the server to clear that guest session
- the next guest starts with a fresh demo pantry

This is useful because the pantry flow can be demonstrated without creating an account first.

---

## 2. User Guide

### Start at the Landing Page

When you open the app, the landing page gives you two paths:

- **Guest** for a disposable demo session
- **Login / Register** for a persistent account flow

### Option A: Use the Demo Mode

Click **Guest** if you want to try the pantry without creating an account.

What happens:

- a demo session is created
- you are sent into the pantry page
- the demo pantry starts empty
- the pantry resets when the browser session ends

This is the easiest way to test the prototype quickly.

### Option B: Register or Log In

If you want the non-demo flow:

1. Click **Register** and create an account with username and password.
2. After registration, you are taken into the pantry.
3. Later you can use **Login** to return to that account.

The login page also includes **Continue in demo mode**, so if someone refreshes while experimenting and ends up on `/login`, they can go straight back into the demo flow.

### Use the Pantry Page

The pantry page is the main dashboard of the app.

What you can see there:

- **Estimated calories in your pantry now**
- **Average consumed per day**
- **Ideal calorie budget per day**

You also see a guidance callout that tells the user to:

- **Add items** to see the pantry calories change
- **Consume 1** to see the average calorie consumption change

#### Set the calorie tracking range

The pantry statistics include a date selector.

By default, the app starts counting from the **beginning of the current calendar week**. That gives the user a quick weekly view of calorie consumption.

If you change the date, the app recalculates the average calories consumed per day starting from that new date.

#### Set an ideal daily calorie budget

The pantry page also lets you enter an **Ideal kcal/day** value.

After saving it, the app compares the current average daily consumed calories against that ideal budget and shows the difference.

### Add Items to the Pantry

On the pantry page, click **Add items**.

That takes you to the product lookup page.

### Use the Product Lookup Page

The lookup page is a barcode-based product search flow powered by Open Food Facts.

What to do:

1. Enter a barcode into the barcode field.
2. Click **Lookup**.
3. Review the returned product card.
4. Choose how many units to add.
5. Click **Add to pantry**.

The lookup result card can show:

- product name
- brand
- barcode
- estimated calories per package
- product image if available from Open Food Facts

#### Demo-friendly barcode examples

If you are in demo mode, the lookup page shows example barcodes directly under the search bar. Those examples can be clicked to auto-fill the barcode and run the lookup.

Current demo examples:

- `5000168198514` — Sablés chocolat – McVitie's
- `7613404535318` — Lait UHT
- `7613404249895` — Vollkorn Complet Integrale

This makes the demo easier because a new user may not have a real product barcode ready.

### Back in the Pantry: Consume Items

Once items have been added to the pantry, they appear in the pantry table.

Each pantry row includes actions such as:

- **Consume 1**
- **Remove**

#### What `Consume 1` does

When you click **Consume 1**:

- the pantry item count goes down by one
- one consumption event is logged
- the average calories consumed per day can increase accordingly
- if the last unit is consumed, the item is no longer shown as active pantry stock

This means the app tracks both:

- what calories are still owned in the pantry
- what calories have already been consumed

### Users Directory

The `/users` area is only for **registered accounts**.

Guest demo mode does not include the users directory.

Registered users can:

- view the user list
- open a selected profile
- inspect profile details
- change their own password from their own profile page

### Exit the Demo

If you are in demo mode, the pantry and lookup pages include an **Exit demo** action.

That lets you leave the temporary session and go back to the regular flow.

---

## 3. App Flow Summary

### Demo flow

1. Open landing page
2. Click **Guest**
3. Enter a fresh temporary pantry
4. Use barcode lookup
5. Add items to pantry
6. Use **Consume 1** to log consumption
7. Session clears when the browser session ends

### Registered user flow

1. Open landing page
2. Register or log in
3. Enter pantry
4. Add items through barcode lookup
5. Track pantry calories and consumed calories
6. Set an ideal calorie budget
7. Browse user profiles if needed

---

## 4. Notes on the Current Prototype

- The current product flow is **barcode-first**.
- The current persistence layer is **H2 in-memory**, which is not yet a production database. It keeps the data in RAM, not in a permanent production database like PostgreSQL or MySQL, which means the data stored disappears when the app stops of restars. 
- Guest demo mode is intentionally temporary and isolated.
- Product calorie estimation depends on the quality of the nutrition and quantity information returned by Open Food Facts.
- This is a prototype designed to showcase the pantry flow clearly: lookup, add, track owned calories, consume, and analyze average daily consumption.
- This is built on top of a class project - software engineering lab individual project