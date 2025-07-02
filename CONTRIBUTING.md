# Contributing to Boys State App – Backend Services

Thank you for your interest in contributing to the Boys State App backend! Whether you’re fixing bugs, adding endpoints, improving security, or enhancing integrations, your help is valuable.

---

## Disclaimer

> **This backend is being developed to support Boys State & Girls State programs affiliated with the American Legion, but is not created, funded, or officially supported by the American Legion. No endorsement is implied.**

---

## Getting Started

1. **Fork the repository** and clone to your local machine.
2. **Install dependencies:**

   ```bash
   npm install
   # or pip install -r requirements.txt (if Python)
   ```
3. **Set up prerequisites:**

   * Ensure Node.js/Python version matches `.nvmrc`, `pyproject.toml`, or docs.
   * Ensure database and environment are configured.
4. **Set up environment variables:**

   * Copy [`.env.example`](./.env.example) to `.env` and fill in values such as `DATABASE_URL` and `JWT_SECRET`.
5. **Run the backend:**

   ```bash
   npm run start
   # or python app.py (adjust as needed)
   ```

---

## Code Standards

* Use meaningful commit messages and detailed PR descriptions.
* All business logic, error handling, and integrations must be covered by automated tests.
* Place tests in `__tests__/` or the `tests/` directory as appropriate.
* Document all new endpoints in the OpenAPI/Swagger spec.
* Do **not** commit secrets, credentials, or production config.

---

## Submitting Changes

1. Create a feature branch:
   `git checkout -b feature/my-new-backend-feature`
2. Make changes, update tests and documentation.
3. Run all tests and lints:

   ```bash
   npm test
   npm run lint
   # or relevant test commands
   ```
4. After tests pass, run `npm run build` to regenerate the `dist/` folder.
4. Update the Swagger/OpenAPI docs as needed.
5. Submit a PR referencing any related issues or cross-repo features.
6. Collaborate on code review; be ready for feedback/changes.

---

## Testing

* All business logic and endpoints must have automated test coverage.
* Security, data isolation, and privacy tests are required.
* Use `npm test`/`pytest`/etc. as per the codebase.

---

## Cross-Repo Coordination

* For mobile UI/API usage, coordinate with [Mobile App](https://github.com/yourorg/boysstate-mobile).
* For admin portal changes, see [Web Admin Portal](https://github.com/yourorg/boysstate-admin).
* Discuss major features or breaking changes across all impacted repos.

---

## Questions?

Open an issue, check the docs, or contact a maintainer.
