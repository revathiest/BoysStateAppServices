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
* Handles onboarding of accepted applicants who are designated as delegates via the Application/Admissions Agent
* Automatically creates or updates user accounts and permissions for accepted applicants
* Sends onboarding/invitation communications (email/SMS as configured)
* Ensures access is granted only upon official acceptance


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

### 3.7. Application/Admissions Agent

**Description:**  
Manages program-defined application forms (for delegate admissions), secure public API endpoints, submission handling, and the complete admission workflow—including unauthenticated (public) access.

**Responsibilities:**
- Allows staff/admins to define, update, and publish public application forms:
  - Multiple question types, required/optional, sectioning
  - Set open/close dates, publish/unpublish, and **generate public, non-guessable application URLs** (using a UUID/token, not just programId)
- Exposes **secure public API endpoints** for applications (**no login/account required**)
  - Serves full form schema and branding, program-scoped
  - **Anti-bot protection** (e.g., CAPTCHA) and **rate limiting** enforced on all public endpoints
  - All submitted data is strictly per-program and never viewable by other applicants
- Handles submission and storage:
  - Each submission is logged with timestamp, IP, browser info (never userId)
  - File uploads are scanned for malware/abuse (if enabled)
  - Each successful submission returns a unique reference code
- Notifies staff/admins of new application submissions and status changes
- Enables staff/admins to review, accept/reject applications (acceptance triggers delegate onboarding)
- All public endpoints must be **fully documented in Swagger/OpenAPI**, including compliance, anti-abuse, and audit logging features
- All actions (public and admin) are logged/audited with programId, action, timestamp, and relevant context
- Automated tests for all public, unauthenticated flows (submission, anti-abuse, error handling, compliance)

**Security, Privacy, and Compliance:**
- All public endpoints require **CAPTCHA and rate limiting**; excess or abusive traffic is blocked and logged
- Application forms display all required privacy and non-affiliation disclaimers
- “Save Draft” (if enabled) for unauthenticated users must use client/browser storage only (never persistent backend storage)
- No persistent user data is stored unless provided as part of the application form
- Full compliance with COPPA, FERPA, GDPR for all data collection and storage
- Automated tests and API docs required for all public-facing flows

### 3.8. Application Review & User Management Agents

**Description:**  
Manages the secure, auditable review, acceptance, and rejection of delegate and staff applications by authorized program personnel. Handles user provisioning, application status, audit logging, and onboarding after acceptance.  
**Distinct endpoints, workflows, and data handling for delegate and staff applications.**

**Responsibilities:**

- Expose secure, authenticated REST API endpoints for:
  - Listing, filtering, and searching **pending delegate applications**
  - Listing, filtering, and searching **pending staff applications** (separate endpoints)
  - Fetching full application details and supporting files for each type (subject to role)
  - Approving (accepting) applications, which:
    - Creates a user account (delegate or staff), linked to application and program
    - Triggers appropriate onboarding (delegate or staff)
    - Sends notification(s) as configured (email, SMS, etc.)
    - Audits who approved, when, and any comments
  - Rejecting applications, which:
    - Marks as rejected, with optional reason and notification
    - Prevents duplicate or future login for rejected applications
    - Audits rejection action (who/when/why)
  - Bulk operations: Accept or reject multiple applications (as permitted by UI/role)
  - Export/download application data for permitted users (audited, program-scoped)

- **Role-based API security:**  
  - Only users with staff/admin roles for the current program can access or take actions on applications for their program
  - Delegate reviewers *cannot* see or review staff applications, and vice versa

- **Strict per-program data isolation:**  
  - All application data and user actions are scoped by `programId` and enforced at API and DB level

- **Audit and compliance:**
  - All review actions (approve/reject) are logged with:
    - Reviewer user ID, action type, timestamp, program ID, application ID, and action context (reason, comments)
  - Export/download and notification actions are also fully logged
  - All data exports, notifications, and account creations must meet compliance (COPPA, FERPA, GDPR, etc.)

- **Automated test coverage:**
  - All endpoints for application review, acceptance, and rejection have automated tests (logic, permissions, error cases, audit, double-accept, undo, etc.)
  - All API endpoints documented in Swagger/OpenAPI (with role requirements, error codes, and example payloads)

- **No duplicate user accounts:**  
  - Accepting an application must check for existing users and link, not duplicate

- **Future extensibility:**  
  - Planned: Background check integrations, multi-stage review, custom onboarding steps, more granular reviewer roles

**Key API Endpoints (Examples):**

- `GET   /api/programs/:programId/applications/delegate?status=pending`
- `GET   /api/programs/:programId/applications/staff?status=pending`
- `GET   /api/programs/:programId/applications/:type/:applicationId`  
  (type = delegate\|staff)
- `POST  /api/programs/:programId/applications/:type/:applicationId/accept`
- `POST  /api/programs/:programId/applications/:type/:applicationId/reject`
- `POST  /api/programs/:programId/applications/:type/bulk-action`  
  (accept/reject in bulk, role/permission-limited)

**Security, Privacy, and Compliance:**

- All review and status-change endpoints require authentication, authorization, and audit
- Exported/downloaded data is strictly program-scoped and audit-logged
- Onboarding and notification actions are triggered via secure backend processes only (never directly by client)
- Full compliance with minor privacy laws and organizational rules (COPPA, FERPA, GDPR, etc.)
- All endpoints reject cross-program or cross-role access

**Automated Testing & Documentation:**

- Automated tests for all review actions, onboarding triggers, audit logging, and permissions
- API docs (Swagger/OpenAPI) must include detailed endpoint, security, and workflow docs for all review actions and user provisioning

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
  * Dont ignore coverage without a very good reason
  **Deployment:** Prior to generating any pull requests, but after all autotests are passing, execute npm run build to ensure the dist folder is updated and ready for deployment.
* **Planned/future agents:** Placeholders for features not yet built must be maintained in this file.
