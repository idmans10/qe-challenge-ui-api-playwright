# QE Challenge: UI and API Automation with Playwright

A compact test automation framework that covers two independent public demo systems with a single toolchain:

- **UI:** [SauceDemo](https://www.saucedemo.com), an e-commerce demo (login, cart, checkout).
- **API:** [Restful-Booker](https://restful-booker.herokuapp.com/apidoc/index.html), a hotel booking REST API.

## Contents

- [Project Overview](#project-overview)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Architecture](#architecture)
- [Test Coverage](#test-coverage)
- [Test Data Strategy](#test-data-strategy)
- [Getting Started](#getting-started)
- [CI/CD](#cicd)
- [Diagnosing Failures](#diagnosing-failures)
- [Engineering Decisions](#engineering-decisions)
- [Scope and Trade-offs](#scope-and-trade-offs)
- [Known Limitations and Risks](#known-limitations-and-risks)

## Project Overview

The goal is to show how a small, maintainable framework can be structured, not to test either product exhaustively. The challenge requirements and where they are met:

| Requirement | Implementation |
|---|---|
| UI tests for SauceDemo | 3 tests in [`tests/ui/`](tests/ui) |
| API tests for Restful-Booker | 3 tests in [`tests/api/`](tests/api) |
| Page Object Model | [`src/ui/pages/`](src/ui/pages) |
| Data created dynamically through the API | Bookings are created with `POST /booking` per test and cleaned up afterwards |
| At least 3 UI and 3 API tests | 3 + 3, runnable together or per suite |
| GitHub Actions workflow | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| README with decisions, priorities and exclusions | This document |

## Technology Stack

| Tool | Responsibility |
|---|---|
| Node.js 22 (LTS) | Runtime, pinned in [`.nvmrc`](.nvmrc) and enforced through `engines` + `engine-strict` |
| npm + `package-lock.json` | Reproducible installs (`npm ci`), exact versions, public registry only ([`.npmrc`](.npmrc)) |
| Playwright Test 1.64 | Test runner, browser automation (Chromium) and HTTP client (`APIRequestContext`) |
| ESLint + `eslint-plugin-playwright` | Static checks that reject `waitForTimeout`, `test.only`, skipped tests, `force` clicks and conditionals in tests |
| GitHub Actions | CI with independent API and UI jobs |

No other runtime dependencies are used: no data-generation library, no assertion library beyond Playwright's `expect`, no `dotenv` (Node's built-in `process.loadEnvFile` reads `.env`).

## Repository Structure

```
.
├── .github/workflows/ci.yml     # CI: independent api and ui jobs
├── playwright.config.js         # two projects: api, ui-chromium
├── eslint.config.js
├── .env.example                 # public demo configuration, all optional
├── src/
│   ├── config/env.js            # environment variables with public defaults
│   ├── api/
│   │   ├── clients/             # AuthClient, BookingClient
│   │   └── factories/           # BookingFactory
│   ├── ui/
│   │   ├── pages/               # LoginPage, InventoryPage, CartPage, CheckoutPage
│   │   ├── factories/           # CustomerFactory
│   │   ├── data/users.js        # public SauceDemo account used by the tests
│   │   └── money.js             # "$29.99" -> 2999 cents
│   └── fixtures/                # api.fixtures.js, ui.fixtures.js
└── tests/
    ├── api/booking.spec.js      # API-01..03
    └── ui/                      # login, cart, checkout (UI-01..03)
```

## Architecture

Each practice below is here because it solves a specific problem in this codebase. Only the Factory is a classic (creational) design pattern; the others are testing practices or Playwright features.

### Page Object Model (UI)

**Problem:** locators and page interactions repeated across tests break in many places when the UI changes.

Each page class ([`LoginPage`](src/ui/pages/LoginPage.js), [`InventoryPage`](src/ui/pages/InventoryPage.js), [`CartPage`](src/ui/pages/CartPage.js), [`CheckoutPage`](src/ui/pages/CheckoutPage.js)) owns its locators and exposes intention-revealing actions (`login`, `addToCart`, `fillCustomer`, `finish`) plus locators and read methods for assertions.

- Locators use the stable `data-test` attributes (configured as Playwright's `testIdAttribute`) and accessible roles.
- Products are located **by name**, never by position, so catalog order does not matter.
- Page objects contain no assertions, no waits and no forced clicks; Playwright's auto-waiting and web-first assertions in the tests handle synchronisation.

### API Client pattern

**Problem:** URLs, HTTP methods, headers and authentication scattered across tests.

[`BookingClient`](src/api/clients/BookingClient.js) exposes `create`, `get`, `update` and `delete`; [`AuthClient`](src/api/clients/AuthClient.js) obtains a token from `POST /auth`.

- Clients return the raw `APIResponse`. They make no assertions and never retry, so tests decide what a correct response is and negative scenarios can be added later without changing the clients.
- The token is sent with the documented `Cookie: token=<token>` header and is kept in a private field so it cannot leak through logging or serialisation.
- `AuthClient` treats a missing token as an explicit error, because Restful-Booker answers bad credentials with HTTP 200 and `{"reason":"Bad credentials"}`.

### Factory pattern

**Problem:** hand-written payloads duplicated in tests, and fixed data that collides when tests run in parallel or repeatedly.

[`BookingFactory`](src/api/factories/BookingFactory.js) and [`CustomerFactory`](src/ui/factories/CustomerFactory.js) build complete, valid objects:

- A unique marker per object (random by default), embedded in names.
- Field overrides (`bookingdates` is merged field by field).
- Reproducibility: passing a fixed `id` (and, for bookings, `referenceDate`) returns the same object.
- Valid dates: `YYYY-MM-DD` in UTC, checkout always after checkin.
- Pure functions: no HTTP and no shared state.

### Dependency injection through Playwright fixtures

**Problem:** every test building its own clients, pages, tokens and cleanup code.

Tests declare what they need and Playwright provides it:

| Fixture | Provides |
|---|---|
| `bookingClient` | Unauthenticated client, used for `POST` and `GET` |
| `authToken` | One token per test, also used by cleanup |
| `authorizedBookingClient` | Client that sends the token, used for `PUT` and `DELETE` |
| `bookingCleanup` | Registry of bookings to remove after the test |
| `booking` | A precondition booking already created and registered |
| `loginPage`, `inventoryPage`, `cartPage`, `checkoutPage` | Page objects bound to the test's page |
| `loggedInInventoryPage` | `standard_user` signed in, inventory displayed |

All fixtures are **test-scoped**.

### Setup / teardown lifecycle

**Problem:** tests that leave data behind, or that create data they cannot remove.

1. `bookingCleanup` depends on `authToken`. If authentication fails, the test stops with `fixture: cleanup authentication failed before creating test data` **before any booking is created**.
2. Every booking ID returned by `POST /booking` is registered immediately, whatever the HTTP status, before any functional assertion can abort the test. If a response exposes no ID, the test receives a `cleanup-limitation` annotation.
3. Teardown runs whether the test passed or failed. It processes every registered booking, attaches a `cleanup-report`, and fails the test with an explicit `fixture: booking cleanup failed …` message instead of hiding cleanup problems.

See [Booking ownership protection](#booking-ownership-protection) for how teardown decides whether it may delete a booking.

### Arrange–Act–Assert

Every test separates its phases so the intent and the behaviour under test are obvious at a glance:

- **UI tests:** comments mark the phases (`// Arrange`, `// Act`, `// Assert`).
- **API tests:** each phase is a `test.step()` block (`Arrange: …`, `Act: …`, `Assert: …`) that attaches its JSON evidence, so the phases also appear in the HTML report (see [Reports and artifacts](#reports-and-artifacts)).

Precondition setup that is not the subject of the test lives in fixtures.

## Test Coverage

The suite verifies a small set of critical paths. It does not claim complete coverage of either product.

| ID | Objective | Main validations | Data strategy |
|---|---|---|---|
| API-01 | Create a booking | `POST /booking` returns 200 and a positive `bookingid`; the returned booking equals the payload; `GET` returns the same data; the booking is registered for cleanup | Payload from `BookingFactory`; removed in teardown |
| API-02 | Update a booking | Every field of the new payload differs from the original; authenticated `PUT` returns 200 with the new data; `GET` confirms that the change persisted | Precondition booking from the `booking` fixture; ownership checked before `PUT` |
| API-03 | Delete a booking | Authenticated `DELETE` returns 201 (the documented status); `GET` then returns 404 | Precondition booking; ownership checked before `DELETE`; teardown sees 404 and sends no second `DELETE` |
| UI-01 | Successful login | URL is `/inventory.html`; title "Products"; catalog visible and not empty; no error message | Public `standard_user` account |
| UI-02 | Add two products to the cart | Cart badge shows 2; the cart contains exactly the two products; names and prices match the catalog | Products chosen by name; prices read from the catalog at runtime |
| UI-03 | Complete checkout | Overview lists both products with catalog prices; subtotal = sum of prices; tax > 0 and < subtotal; total = subtotal + tax (in integer cents); order confirmation shown | Products chosen by name; customer from `CustomerFactory` |

Money is compared in integer cents ([`src/ui/money.js`](src/ui/money.js)). Because the displayed subtotal is already a whole number of cents, `total = subtotal + tax` holds exactly for the rounded values on screen, so no tolerance is needed. The tax rate is not asserted, because no requirement defines it.

## Test Data Strategy

Restful-Booker and SauceDemo are **unrelated systems**; no data flows between them.

### API: created per test, cleaned up afterwards

Each API test creates its own bookings through `POST /booking` using `BookingFactory`. No booking IDs are hardcoded and no test depends on data created by another test. Bookings are removed in teardown unless the test already deleted them.

### UI: public demo data plus generated checkout data

SauceDemo has no public API to create users or products. The tests use its preexisting public demo account (`standard_user`) and catalog products, selected by name. Only the checkout form data (first name, last name, postal code) is generated, by `CustomerFactory`. Each test runs in a fresh browser context, so sessions and the cart (kept in `localStorage`) are never shared between tests.

### Booking ownership protection

Restful-Booker is shared and public, periodically resets its data, and can reuse booking IDs. A booking ID alone therefore does not prove that a booking is ours.

- `bookingCleanup` stores, for each ID, every payload the test sent for it (the creation payload and any `PUT` payload). Each payload carries a unique factory marker.
- Before any `PUT` or `DELETE` (in the tests and in teardown), the fixture issues a `GET` and requires the stored booking to equal one of those payloads exactly.

| `GET` result | Action |
|---|---|
| 404 | Already absent; no `DELETE` is sent |
| 200, matches one of our payloads | `DELETE`, then a `GET` that must return 404 |
| 200, does not match | `fixture: ownership mismatch`; nothing is deleted. Only the names of the differing fields are reported, not foreign data |

**Limitations:**

- This reduces, but does not remove, the risk of deleting someone else's booking. The API has no conditional delete, so another client can replace the booking between our `GET` and our `DELETE`.
- If the server resets during a test and the ID is reused, the original booking is already gone, and the mismatch is reported as a cleanup failure rather than silently ignored.

## Getting Started

### Prerequisites

- macOS or Linux with a POSIX shell. The suites have been run locally on macOS and on Ubuntu 24.04 in GitHub Actions (see [CI Results](#ci-results)). The npm scripts set `PLAYWRIGHT_BROWSERS_PATH=0` inline, so Windows would need WSL or Git Bash; Windows has not been tested.
- Node.js 22. With [nvm](https://github.com/nvm-sh/nvm), run `nvm use` in the project root; `npm ci` refuses other major versions.
- Network access to `www.saucedemo.com` and `restful-booker.herokuapp.com`.

### Install

```bash
nvm use
npm ci
npm run browsers:install
```

`browsers:install` downloads Playwright's Chromium into `node_modules/` (`PLAYWRIGHT_BROWSERS_PATH=0`) instead of a shared user cache. `npm ci` removes it together with `node_modules`, so run it again after every `npm ci`. The API suite does not need a browser.

### Configuration (optional)

Every setting has a working default. To override one, copy the example file and edit it:

```bash
cp .env.example .env
```

| Variable | Default |
|---|---|
| `UI_BASE_URL` | `https://www.saucedemo.com` |
| `API_BASE_URL` | `https://restful-booker.herokuapp.com` |
| `SAUCE_PASSWORD` | Public demo password shown on the SauceDemo login page |
| `BOOKER_USERNAME`, `BOOKER_PASSWORD` | Public demo admin documented by Restful-Booker |

All values in `.env.example` are public demo values. `.env` is git-ignored and must never contain real credentials.

### Run

| Command | Purpose |
|---|---|
| `npm test` | Both suites |
| `npm run test:ui` | UI suite only (`ui-chromium` project, headless) |
| `npm run test:api` | API suite only (`api` project, no browser) |
| `npm run test:list` | List tests without running them |
| `npm run lint` | ESLint |
| `npm run report` | Open the last HTML report (`playwright-report/`) |

Run the test commands through npm so that `PLAYWRIGHT_BROWSERS_PATH=0` is applied. Extra Playwright arguments go after `--`, for example `npm run test:ui -- tests/ui/cart.spec.js`.

### Reports and artifacts

| Output | Location | When |
|---|---|---|
| HTML report | `playwright-report/` | Every run |
| Failure screenshots and traces (UI only) | `test-results/` | Only when a UI test fails |
| JUnit XML | `test-results/junit.xml` | Only in CI (`CI` is set) |
| API steps and JSON evidence, `cleanup-report` | Attached to each API test in the HTML report | Every run |

In the HTML report, each API test is split into `test.step()` blocks (Arrange / Act / Assert). Each step carries JSON evidence, attached before the assertions that use it:

- the payloads sent;
- method, status, path and body of every `/booking` response. A booking body is attached only when it carries the test's own factory marker (`firstname`/`lastname`). Otherwise it is redacted (`identityVerified: false`), so data from a reused ID is never recorded. Non-JSON bodies are kept only for the contract's static texts (`404 Not Found`, `201 Created`); any other non-JSON body is redacted. Bodies over 10,000 characters are cut and flagged `truncated`;
- for updates, a comparison of the expected and the persisted data.

Fixture teardown attaches the `cleanup-report` under "After Hooks". Evidence never includes tokens, passwords or HTTP headers; `/auth` responses and any path outside `/booking` are refused. API traces are disabled for the same reason: they would capture authentication headers.

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on pushes to `main`, pull requests targeting `main`, and manual dispatch (`workflow_dispatch`). The `GITHUB_TOKEN` is read-only (`contents: read`), and a newer push cancels an in-flight run for the same ref.

Two jobs run in parallel on `ubuntu-24.04`. They have no `needs` dependency, so a failure in one does not stop the other.

| Job | Steps | Artifact |
|---|---|---|
| `api` | checkout → Node from `.nvmrc` (npm cache) → `npm ci` → `npm run test:api` | `playwright-api-report` |
| `ui` | checkout → Node from `.nvmrc` (npm cache) → `npm ci` → `npm run browsers:install -- --with-deps` → `npm run test:ui` | `playwright-ui-report` |

- Only the `ui` job installs Chromium and its system libraries.
- In CI, Playwright runs with `retries: 0`, `forbidOnly: true`, 2 workers, a 30 s timeout per test, a 10-minute global timeout, and `list`, `html`, `junit` and `github` (inline annotations) reporters.
- A failing test fails its job; there is no `continue-on-error`.

**Artifacts.** Each artifact contains `playwright-report/` and `test-results/`. It is uploaded even when tests fail, kept for 7 days, and never includes `node_modules` or browser binaries. To inspect one:

1. Open the workflow run in the **Actions** tab and download the artifact from **Artifacts**.
2. Extract it.
3. Open the HTML report with `npm run report -- <extracted>/playwright-report`, or load `test-results/junit.xml` into any JUnit viewer.

### CI Results

Verified run on `main` after the API observability changes were merged: [run 39906428788](https://github.com/idmans10/qe-challenge-ui-api-playwright/actions/runs/39906428788).

| Item | Result |
|---|---|
| Branch / commit | `main` / `6d7c4b8` |
| Workflow conclusion | Success |
| `api` job: API tests (Restful-Booker) | 3 passed (API-01, API-02, API-03) |
| `ui` job: UI tests (SauceDemo, Chromium) | 3 passed (UI-01, UI-02, UI-03) |
| Artifacts | `playwright-api-report`, `playwright-ui-report` |

This records that run on that commit only. It is not a guarantee of future stability, because both suites depend on public services (see [Known Limitations and Risks](#known-limitations-and-risks)).

Historical reference: the first run of the workflow ([run 39894580038](https://github.com/idmans10/qe-challenge-ui-api-playwright/actions/runs/39894580038), commit `03387af`) also succeeded with 3 API and 3 UI tests. Before it, the workflow had been validated statically (YAML structure, script names, Node and lockfile consistency) and simulated from a clean copy of the repository.

## Diagnosing Failures

Failures are reported with prefixes and context so they can be classified quickly:

| Category | Typical signal |
|---|---|
| Product | A functional assertion fails against a reachable, healthy service, e.g. a wrong total or data not persisted |
| Automation | A locator times out or a page object no longer matches the UI, while the feature works manually |
| Data / fixtures | An error starting with `fixture:`: setup, authentication for cleanup, ownership mismatch, cleanup failure |
| Environment | Network errors, HTTP 5xx or unexpected 418/503 from a public service, site unavailable. Investigate before calling it a product defect |
| Requirement / definition | Behaviour that differs from common conventions but matches the documentation, e.g. `DELETE` returning 201 |

## Engineering Decisions

| Decision | Reason |
|---|---|
| Playwright for UI and API | One runner, one assertion library, one reporting pipeline and one fixture system for both suites. Auto-waiting and web-first assertions remove the need for manual waits |
| JavaScript (ES modules) | Playwright's native language, with no build or transpile step to keep green. JSDoc annotates the main contracts. TypeScript would add type safety, at the cost of more tooling than this scope needs |
| `APIRequestContext` | Built into Playwright, so no extra HTTP library. It shares `baseURL`, timeouts and reporting with the rest of the suite, and each test gets an isolated context |
| Separate page objects and API clients | They model different interfaces: a rendered UI versus an HTTP contract. Keeping them apart keeps each layer small and lets both suites evolve independently |
| Dynamic test data | Tests must stay independent under parallel and repeated runs and on a shared public server. Fixed IDs or payloads would collide or depend on state created elsewhere |
| Test-scoped fixtures | Each test gets its own token, clients, browser context and cleanup registry, so there is no shared mutable state and no ordering dependency. The cost (one extra `/auth` call per API test) is small |
| No automatic retries | Retries turn intermittent failures into green builds and hide real defects or environment problems. A failure is reported once, with evidence, and then investigated |
| Independent suites | The systems are unrelated, so a SauceDemo outage must not block API feedback and vice versa. Separate Playwright projects (`testMatch`) and separate CI jobs make that explicit |

## Scope and Trade-offs

**Prioritised:**

- Reliable critical paths (login, cart, checkout; create, update, delete) with meaningful assertions on data and persistence, not just status codes.
- Test independence and data hygiene: no hardcoded IDs, cleanup on failure, ownership checks.
- Diagnosability: explicit fixture errors, sanitised attachments, traces and screenshots on UI failure.
- A setup that is easy to reproduce: pinned Node and dependency versions, `npm ci`, no global installs.

**Deliberately excluded:**

| Exclusion | Reason |
|---|---|
| Multiple browsers (Firefox, WebKit, mobile) | Adds runtime and CI cost without changing what this challenge demonstrates. Adding a project to `playwright.config.js` is straightforward |
| Performance and load testing | Needs a different tool and a controlled environment; load against shared public demos would be inappropriate |
| Advanced contract testing (schema validation, consumer-driven contracts) | Tests assert the fields they rely on. A schema or contract layer is better justified once there are API consumers to protect |
| Extensive negative scenarios (invalid login, unauthorised `PUT`, `PATCH`, validation errors) | The mandatory scope came first. The clients already return raw responses, so these can be added without design changes |
| Artificial integration between SauceDemo and Restful-Booker | The systems are unrelated; linking them would create a fake dependency |
| Extra patterns (Screenplay, builders, generic resource managers, custom wrappers) | No demonstrated need at this size; each would add indirection without removing duplication |

## Known Limitations and Risks

- **External services.** Both systems are public demos outside our control. Outages, latency or behaviour changes cause failures that are environmental, not product defects.
- **Restful-Booker resets.** Data is reset periodically and IDs are reused. Ownership checks prevent deleting bookings that do not match our payloads, but the race between `GET` and `DELETE` remains (see [Booking ownership protection](#booking-ownership-protection)). Each API test also adds one or two extra `GET` requests.
- **Unrecoverable creations.** If `POST /booking` creates a booking but the response does not expose its ID, that booking cannot be cleaned up; the test is annotated with `cleanup-limitation`.
- **SauceDemo demo data.** The tests rely on the public `standard_user` account, on the names of specific catalog products, and on UI texts such as "Products" or "Thank you for your order!". The site's menu includes a "dynamic catalog" option, so catalog changes would surface as automation failures that name the missing product.
- **Documented behaviour versus REST conventions.** Restful-Booker answers bad credentials on `/auth` with HTTP 200 and a `reason`, `DELETE` with 201 instead of 204, and a missing booking with a plain-text 404. The tests follow the documented or observed behaviour and do not parse non-JSON error bodies.
- **Credentials in UI traces.** Traces of failed UI tests include the SauceDemo password typed into the login form. It is a public demo value, but the CI artifacts should be treated accordingly.
- **Evidence so far.** Execution evidence comes from two sources:
  - Local runs on macOS (Intel) with Node 22: repeated runs of both suites with `--repeat-each` and several workers, each test run individually and in reverse order, and simulated failure scenarios for the cleanup logic.
  - Successful GitHub Actions runs on Ubuntu 24.04, including the first run of the workflow (commit `03387af`) and the run on commit `6d7c4b8` after the observability merge (see [CI Results](#ci-results)).

  This is a limited sample. Results against live public services can vary over time.
