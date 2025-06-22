# AGENTS.md – BoysStateAppServices (Backend)

## Overview

This document specifies the agents, roles, backend modules, and integration points for the Boys State App backend API and services. The backend is responsible for all business logic, authentication, data management, integrations, and agent-based feature security. It serves as the source of truth for all other client applications and ensures strict per-program data isolation, privacy, and auditing.

---

## 1. User Role Agents (Backend responsibilities)

### 1.1. Delegate Agent

* Standard participant roles and permissions are enforced through backend APIs.
* Authentication, access control, session management, and all agent role assignments are handled here.

### 1.2. Counselor Agent

* All delegate functions plus permissions for staff-only endpoints (resource management, team/group management).

### 1.3. Staff Agent (Admin)

* All counselor functions, plus:

  * Schedule/announcement/resource management
  * User roles and onboarding
  * Parent invites
  * Branding/configuration
  * Elections management (planned)
  * Full API and data audit logs (program scope only)

### 1.4. Parent Agent (Future)

* View-only endpoints for their linked child(ren)'s info, schedule, milestones, and awards.

---

## 2. Authentication & Account Agents

### 2.1. Authentication Agent

* Handles user login, identity verification, sessions, and token refresh.
* Supports username/password and optional Discord OAuth (must be linked to program account).
* API endpoints for login/logout for all roles.

### 2.2. Account Linking Agent

* Manages linking of Discord or third-party accounts to Boys State accounts.
* Ensures secure linking/unlinking, no cross-program leaks.

### 2.3. Parent-Delegate Linking Agent

* Manages relationships between parents and delegates (many-to-many, API endpoints).

---

## 3. Software/Feature Agents (Backend)

### 3.1. Schedule Agent

* REST API for schedules, updates, and user/group schedule filtering.
* Optional Google Calendar integration (backend-managed).
* Change/event notifications.

### 3.2. Notification Agent

* Backend push/in-app notifications for targeted and global announcements.
* All notifications logged and auditable.

### 3.3. Branding/Config Agent

* Loads/scopes program-specific branding/themes/assets.
* Handles feature toggles and custom modules.

### 3.4. API Comm Agent

* Manages all backend comms, auth, session.
* Logs all API calls and errors. Retries as needed.

### 3.5. Integration Agents (Backend)

* Google Calendar: Syncs/saves events per program.
* Google Docs: Serves docs/resources via backend endpoints.
* Discord: Account linking, announcement relays via backend only.

### 3.6. Progress Tracking Agent (Planned)

* Tracks milestones/awards, achievement history, and parent notifications.

### 3.7. Election Agent (Planned)

* Secure config/voting/results endpoints, auditable and program-scoped.

### 3.8. Future Feature Agents

* Gallery, chat, surveys, voting, resource library, etc. All implemented via backend APIs.

---

## 4. Backend Agents (API Service)

### 4.1. API Service Agent

* REST API with all business logic, strict per-program isolation, full logging, and authentication.
* OpenAPI/Swagger documented endpoints with security models.

### 4.2. Event/WebSocket Agent (Planned)

* Real-time updates for clients; fallback polling.

### 4.3. Program Management Website Agent (Backend endpoints only)

* APIs for admin portal to manage programs/settings/integrations/elections/logs.

### 4.4. Delegate Registration Agent

* Registration/onboarding endpoints, parent invites, account creation, security, and auditing.

---

## 5. Data Security & Privacy

* Per-program data isolation enforced at backend.
* Sensitive info (esp. minors) – strict privacy per COPPA, FERPA, GDPR, etc.
* All access is authenticated/authorized.
* All backend comms and data access are logged (sensitive data redacted in dev logs).
* Automated tests required for all code paths and endpoints.

---

## 6. Agent Interactions

* All agents use secure, documented backend API endpoints.
* Integrations talk to 3rd parties via backend only.
* All comms, errors, and events are logged.

---

## 7. Dev Standards (Backend)

* API docs: Swagger/OpenAPI, with security and example models.
* Extensibility: New agents/features spec’d and documented before implementation.
* Error handling: All errors logged and handled gracefully.
* Security: Encrypted transit, strong auth, no cross-program sharing.
* Automated tests for all logic, error paths, edge cases, integrations, and security.

---

## 8. Future Agents/Features

* Placeholders for all planned/future modules. All must be spec’d and documented here before implementation.
