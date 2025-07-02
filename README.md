# Boys State App – Backend Services

> **Disclaimer:**
>
> This project is being developed to support Boys State & Girls State programs affiliated with the American Legion, but is **not** created, funded, or officially supported by the American Legion. No endorsement or sponsorship is implied. All branding, configuration, and operational decisions are made independently by the app’s creators and participating programs.

## Overview

This repository contains the **backend REST API and core services** for Boys State App. The backend handles business logic, authentication, integrations, per-program data, and API endpoints for both the mobile app and web admin portal.

* Node.js / Python / \[replace with stack]
* REST API with Swagger/OpenAPI documentation
* Per-program data isolation and security
* Integrations: Google Calendar, Discord, etc. (planned)
* Automated tests required for all code and endpoints
* Strong privacy compliance (COPPA, FERPA, GDPR, etc.)

## Other Boys State App Repositories

* [Mobile App](https://github.com/yourorg/boysstate-mobile): Delegate- and parent-facing mobile application for schedule, notifications, and resources.
* [Web Admin Portal](https://github.com/yourorg/boysstate-admin): Administrative web portal for program management, integrations, elections, and logs.

## Quick Start

1. **Install dependencies:**

   ```bash
   npm install
   # or pip install -r requirements.txt
   ```
2. **Generate Prisma client:**

   ```bash
   npm run prisma:generate
   ```
3. **Set up environment variables:**

   * Copy [`.env.example`](./.env.example) to `.env` and provide values for `DATABASE_URL`, `JWT_SECRET`, and any other required settings.
4. **Run the service:**

   ```bash
   npm run start
   # or python app.py / your start command
   ```
5. **API documentation:**

   * Access Swagger/OpenAPI docs at `/docs` or as configured.

## Agent Specification

See [`AGENTS.md`](./AGENTS.md) for a full list of backend agents and integration points.

## Contributing

* All changes must include tests and clear documentation.
* After running tests, execute `npm run build` to update the `dist/` folder before opening a PR.
* PRs must pass CI and code review before merge.
* For mobile or admin UI, see [Mobile App](https://github.com/yourorg/boysstate-mobile) and [Web Admin Portal](https://github.com/yourorg/boysstate-admin).
