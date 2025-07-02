# Boys State App – Backend Services

> **Disclaimer:**
>
> This project is being developed to support Boys State & Girls State programs affiliated with the American Legion, but is **not** created, funded, or officially supported by the American Legion. No endorsement or sponsorship is implied. All branding, configuration, and operational decisions are made independently by the app’s creators and participating programs.

## Overview

This repository contains the **backend REST API and core services** for Boys State App. The backend handles business logic, authentication, integrations, per-program data, and API endpoints for both the mobile app and web admin portal.

* Node.js with TypeScript
* REST API with Swagger/OpenAPI documentation
* Per-program data isolation and security
* Integrations: Google Calendar, Discord, etc. (planned)
* Automated tests required for all code and endpoints
* Strong privacy compliance (COPPA, FERPA, GDPR, etc.)

## Other Boys State App Repositories

* [Mobile App](https://github.com/BoysStateApp/mobile): Delegate- and parent-facing mobile application for schedule, notifications, and resources.
* [Web Admin Portal](https://github.com/BoysStateApp/admin-portal): Administrative web portal for program management, integrations, elections, and logs.

## Quick Start

1. **Install dependencies:**

   ```bash
   npm install
   ```
2. **Generate Prisma client:**

   ```bash
   npm run prisma:generate
   ```
3. **Set up environment variables:**

   * Create a `.env` file and configure database, API, and authentication settings.
4. **Build the project:**

   ```bash
   npm run build
   ```
5. **Run the service:**

   ```bash
   npm run start
   ```
6. **API documentation:**

   * Access Swagger/OpenAPI docs at `/docs` or as configured.
   * Download the raw Swagger spec at `/docs/swagger.json`.

## Agent Specification

See [`AGENTS.md`](./AGENTS.md) for a full list of backend agents and integration points.

## Contributing

* All changes must include tests and clear documentation.
* After running tests, execute `npm run build` to update the `dist/` folder before opening a PR.
* PRs must pass CI and code review before merge.
* For mobile or admin UI, see [Mobile App](https://github.com/BoysStateApp/mobile) and [Web Admin Portal](https://github.com/BoysStateApp/admin-portal).
