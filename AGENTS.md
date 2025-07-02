# Boys State App: Agents Specification – Backend Services

> **Important Disclaimer:**
>
> This application is being developed to support programs affiliated with the American Legion (such as Boys State and Girls State), but it is **not** created, funded, or officially supported by the American Legion or any agent or representative thereof. No endorsement or sponsorship by the American Legion is implied. All branding, configuration, and operational decisions are made independently by the app’s creators and participating programs.

## Overview

This document describes the backend service agents supporting the Boys State App ecosystem. Backend services manage business logic, program isolation, data security, integrations, and all API operations for both mobile and web clients. Backend agents enforce privacy, robust logging, and extensibility for all Boys/Girls State programs.

---

## 1. Core Backend Agents

### 1.1. API Service Agent

**Description:** REST API backend providing all business logic and data operations.

**Responsibilities:**

* Serves schedules, users, resources, and per-program data
* Receives updates from staff/admins
* All endpoints fully documented via Swagger/OpenAPI
* Provides secure endpoints with strict per-program isolation
* Manages user authentication and authorization for all agents
* Stores all logs (API activity, errors, audits) for compliance

### 1.2. Event/WebSocket Agent (Planned)

**Description:** Provides real-time updates if required (e.g., notifications, schedule changes).

**Responsibilities:**

* Sends schedule/notification updates instantly to clients
* Handles polling fallback when WebSockets not available

### 1.3. Delegate Registration Agent

**Description:** Manages registration and onboarding for delegates.

**Responsibilities:**

* Handles registration via portal or CSV import
* Links delegates to the correct program and permissions
* Supports inviting parents during or after registration
* Ensures secure, auditable account creation and assignment

### 1.4. Program Management Website Agent

**Description:** Backend logic for the web admin portal, not directly exposed to mobile clients.

**Responsibilities:**

* Supports admin-only management for programs, users, and settings
* Handles branding, contacts, settings, and advanced resources
* Provides logs/audit access to admins for their programs
* Supports election and integration management

---

## 2. Cross-Platform/Shared Software Agents

### 2.1. Authentication Agent

**Description:** Manages user login, sessions, and identity verification.

**Responsibilities:**

* Supports username/password and optional Discord OAuth
* Handles secure sessions, token refresh, and account security
* Manages login/logout state for all clients

### 2.2. Account Linking Agent

**Description:** Securely links external (Discord/3rd-party) accounts to program accounts.

**Responsibilities:**

* Prevents hijacking or cross-program leaks
* Provides API endpoints for linking/unlinking

### 2.3. Parent-Delegate Linking Agent

**Description:** Manages many-to-many relationships between parent and delegate accounts.

**Responsibilities:**

* Allows linking/inviting parents to delegates and vice versa

---

## 3. Backend Feature/Integration Agents

### 3.1. Schedule Agent

**Description:** Provides schedules to clients; manages updates and Google Calendar sync.

**Responsibilities:**

* Fetches latest schedule from DB or Google Calendar integration
* Notifies clients of changes/events
* Supports program-, user-, and group-specific schedules

### 3.2. Notification Agent

**Description:** Manages push/in-app notification dispatch, targeting, and logs.

**Responsibilities:**

* Delivers notifications to targeted or all users
* Logs all notifications for audit

### 3.3. Branding/Config Agent

**Description:** Manages per-program branding, theming, and feature toggles.

**Responsibilities:**

* Loads and scopes branding/config/assets for programs
* Handles toggles for features/modules

### 3.4. Progress Tracking Agent (Planned)

**Description:** Tracks delegate milestones and awards; supports parent notifications.

**Responsibilities:**

* Maintains history of achievements, nominations, and appointments
* Notifies parents and delegates of milestones

### 3.5. Election Agent (Planned)

**Description:** Manages secure setup, voting, and results for all program elections.

**Responsibilities:**

* Allows staff/admins to configure elections
* Provides secure voting, ballot tallies, and results
* Ensures all actions are logged and auditable

### 3.6. Integration Agents (Planned)

**Google Calendar Agent:** Syncs events with external calendars, managed by admins.

**Google Docs Agent:** Provides access to program-linked education/resources via backend endpoints.

**Discord Agent:** Manages Discord account linking, announcement relay, and optional communication via backend only.

---

## 4. Security, Privacy, and Compliance

* **Per-program data isolation:** All data is scoped to a single program. No cross-program sharing.
* **Sensitive info:** Strict compliance with privacy standards for minors (COPPA, FERPA, GDPR, etc.).
* **Authentication:** All access must be authenticated and authorized.
* **Logging:** All backend communication, actions, and errors are logged. Sensitive data is redacted as appropriate.
  * Use the `src/logger.ts` utility for all logs instead of `console.log`.
  * Each log entry records a `programId` to keep logs isolated per program and are written to `logs/<programId>.log` in JSON lines format.
* **Branding/config:** All branding and configuration are managed and loaded per program.
* **Automated testing:** All business logic and endpoints require automated tests for core logic, error cases, and edge scenarios.

---

## 5. Agent Interactions (Backend)

* All backend agents interact via secure, documented API endpoints (Swagger/OpenAPI enforced).
* Integration agents talk to external (third-party) services only via backend—not directly from clients.
* Communication, error, and event logs are maintained for all agent interactions.

---

## 6. Development Standards (Backend)

* **API docs:** All endpoints are documented with Swagger/OpenAPI, including security models and usage examples.
* **Extensibility:** New agents/features must be spec’d here before implementation.
* **Error handling:** All errors must be logged, handled gracefully, and returned via secure APIs.
* **Security:** Data is encrypted in transit; strong authentication/authorization is enforced.
* **Testing:**
  * Automated tests for all new code/changes
  * Must verify business logic, error handling, and edge cases
  * Regression and integration tests for new APIs or dependencies
  * Code review and passing tests required before deployment
  * Security and integration tests must be included for external APIs
  **Deployment:** Prior to generating any pull requests, but after all autotests are passing, execute npm run build to ensure the dist folder is updated and ready for deployment.
* **Planned/future agents:** Placeholders for features not yet built must be maintained in this file.
