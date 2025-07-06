# Boys State App: Core Data Model & API Spec

---

## A. Core Tables & Relationships

### 1. Program *(Implemented & tested)*
- `id` (PK)
- `name`
- `short_name`
- `custom_state_name` (e.g., “State”, “Commonwealth”)
- `branding` (logo, colors, etc.)
- `contact_info`
- `feature_toggles` (JSON)
- `created_at`
- `updated_at`

---

### 2. ProgramYear *(Implemented & tested)*
- `id` (PK)
- `program_id` (FK → Program)
- `year` (e.g., 2025)
- `start_date`
- `end_date`
- `status` (active, archived)
- `notes`
- `created_at`
- `updated_at`

---

### 3. GroupingType *(Implemented & tested)*
*(Flexible region/level naming per program)*
- `id` (PK)
- `program_id` (FK → Program)
- `default_name` (City, County, District, State, etc.)
- `custom_name` (Parish, Town, Borough, Commonwealth, etc.)
- `plural_name`
- `level_order` (integer: lower = higher, ex: State=1, Parish=2, Town=3)
- `is_required` (boolean)
- `status` (active, retired)
- `created_at`
- `updated_at`

---

### 4. Grouping *(Implemented & tested)*
*(Instances of each grouping type, with hierarchy)*
- `id` (PK)
- `program_id` (FK → Program)
- `grouping_type_id` (FK → GroupingType)
- `parent_grouping_id` (FK → Grouping, nullable)
- `name`
- `status` (active, retired)
- `display_order`
- `notes`
- `created_at`
- `updated_at`

---

### 5. ProgramYearGrouping *(Implemented & tested)*
*(Which groupings are active in which years)*
- `id` (PK)
- `program_year_id` (FK → ProgramYear)
- `grouping_id` (FK → Grouping)
- `status` (active, inactive)

---

### 6. Party *(Implemented & tested)*
- `id` (PK)
- `program_id` (FK → Program)
- `name`
- `abbreviation`
- `color`
- `icon`
- `status` (active, retired)
- `display_order`
- `created_at`
- `updated_at`

---

### 7. ProgramYearParty *(Implemented & tested)*
- `id` (PK)
- `program_year_id` (FK → ProgramYear)
- `party_id` (FK → Party)
- `status` (active, inactive)

---

### 8. Delegate *(Implemented & tested)*
- `id` (PK)
- `program_year_id` (FK → ProgramYear)
- `first_name`
- `last_name`
- `email`
- `phone`
- `user_id` (if linked to user account)
- `grouping_id` (lowest level, e.g., Town/City)
- `party_id` (FK to ProgramYearParty)
- `created_at`
- `updated_at`
- `status` (active, withdrawn, graduated, etc.)

---

### 9. Staff *(Implemented & tested)*
- `id` (PK)
- `program_year_id` (FK → ProgramYear)
- `first_name`
- `last_name`
- `email`
- `phone`
- `user_id` (if linked to user account)
- `role` (e.g., counselor, admin)
- `grouping_id` (optional, e.g., assigned to a Town/County)
- `created_at`
- `updated_at`

---

### 10. Parent *(Implemented & tested)*
- `id` (PK)
- `user_id` (if linked to user account)
- `first_name`
- `last_name`
- `email`
- `phone`
- `created_at`
- `updated_at`

### 11. DelegateParentLink *(Implemented & tested)*
- `id` (PK)
- `delegate_id` (FK → Delegate)
- `parent_id` (FK → Parent)
- `program_year_id` (FK → ProgramYear)
- `status` (pending, accepted, revoked)
- `created_at`

---

### 12. Position *(Implemented & tested)*
- `id` (PK)
- `program_id` (FK → Program)
- `name` (e.g., Mayor, Governor, Councilmember)
- `description`
- `status` (active, retired)
- `display_order`
- `created_at`
- `updated_at`

---

### 13. ProgramYearPosition *(Implemented & tested)*
- `id` (PK)
- `program_year_id` (FK → ProgramYear)
- `position_id` (FK → Position)
- `delegate_id` (FK → Delegate, nullable)
- `status` (active, inactive)
- `created_at`

---

### 14. Election *(Implemented & tested)*
- `id` (PK)
- `program_year_id` (FK → ProgramYear)
- `position_id` (FK → ProgramYearPosition)
- `grouping_id` (FK → Grouping)
- `status` (scheduled, ongoing, complete)
- `method` (first-past-the-post, ranked-choice, etc.)
- `start_time`
- `end_time`
- `created_at`

---

### 15. ElectionVote *(Implemented & tested)*
- `id` (PK)
- `election_id` (FK → Election)
- `voter_delegate_id` (FK → Delegate)
- `candidate_delegate_id` (FK → Delegate)
- `vote_rank` (integer, if ranked)
- `created_at`

---

## B. Core API Endpoints

(REST-style; use GraphQL if preferred)

---

### Program Management
- `GET /programs` — List all programs *(implemented & tested)*
- `POST /programs` — Create program *(implemented & tested)*
- `GET /programs/{id}` — Get program details *(implemented & tested)*
- `PUT /programs/{id}` — Update program *(implemented & tested)*
- `DELETE /programs/{id}` — Retire program *(implemented & tested)*

### Program Year Management
- `GET /programs/{id}/years` — List years for a program *(implemented & tested)*
- `POST /programs/{id}/years` — Create new program year *(implemented & tested)*
- `GET /program-years/{id}` — Get year details *(implemented & tested)*
- `PUT /program-years/{id}` — Update year *(implemented & tested)*
- `DELETE /program-years/{id}` — Archive year *(implemented & tested)*

### Grouping Types (custom naming)
- `GET /programs/{id}/grouping-types` — List grouping types *(implemented & tested)*
- `POST /programs/{id}/grouping-types` — Add grouping type *(implemented & tested)*
- `PUT /grouping-types/{id}` — Update custom/plural names *(implemented & tested)*
- `DELETE /grouping-types/{id}` — Retire type *(implemented & tested)*

### Groupings (instances: parishes, towns, etc.)
- `GET /programs/{id}/groupings` — List all groupings *(implemented & tested)*
- `POST /programs/{id}/groupings` — Add grouping *(implemented & tested)*
- `PUT /groupings/{id}` — Update grouping *(implemented & tested)*
- `DELETE /groupings/{id}` — Retire grouping *(implemented & tested)*
- `POST /program-years/{id}/groupings/activate` — Activate groupings for year *(implemented & tested)*
- `GET /program-years/{id}/groupings` — List active groupings for year *(implemented & tested)*

### Parties
- `GET /programs/{id}/parties` *(implemented & tested)*
- `POST /programs/{id}/parties` *(implemented & tested)*
- `PUT /parties/{id}` *(implemented & tested)*
- `DELETE /parties/{id}` *(implemented & tested)*
- `POST /program-years/{id}/parties/activate` *(implemented & tested)*
- `GET /program-years/{id}/parties` *(implemented & tested)*

### Delegates
- `GET /program-years/{id}/delegates` *(implemented & tested)*
- `POST /program-years/{id}/delegates` *(implemented & tested)*
- `PUT /delegates/{id}` *(implemented & tested)*
- `DELETE /delegates/{id}` *(implemented & tested)*

### Staff
- `GET /program-years/{id}/staff` *(implemented & tested)*
- `POST /program-years/{id}/staff` *(implemented & tested)*
- `PUT /staff/{id}` *(implemented & tested)*
- `DELETE /staff/{id}` *(implemented & tested)*

### Parents & Delegate Linking
- `GET /program-years/{id}/parents` *(implemented & tested)*
- `POST /program-years/{id}/parents` *(implemented & tested)*
- `PUT /parents/{id}` *(implemented & tested)*
- `DELETE /parents/{id}` *(implemented & tested)*
- `POST /delegate-parent-links` (create link) *(implemented & tested)*
- `PUT /delegate-parent-links/{id}` (update status) *(implemented & tested)*

### Positions *(Implemented & tested)*
- `GET /programs/{id}/positions` *(implemented & tested)*
- `POST /programs/{id}/positions` *(implemented & tested)*
- `PUT /positions/{id}` *(implemented & tested)*
- `DELETE /positions/{id}` *(implemented & tested)*

### Program Year Positions (instances/assignments) *(Implemented & tested)*
- `GET /program-years/{id}/positions` *(implemented & tested)*
- `POST /program-years/{id}/positions` *(implemented & tested)*
- `PUT /program-year-positions/{id}` *(implemented & tested)*
- `DELETE /program-year-positions/{id}` *(implemented & tested)*

### Elections
- `GET /program-years/{id}/elections` *(implemented & tested)*
- `POST /program-years/{id}/elections` *(implemented & tested)*
- `PUT /elections/{id}` *(implemented & tested)*
- `DELETE /elections/{id}` *(implemented & tested)*
- `POST /elections/{id}/vote` (submit vote) *(implemented & tested)*
- `GET /elections/{id}/results` *(implemented & tested)*

### Other (as needed: notifications, resources, schedule, etc.)

---

## C. Notes/Best Practices
- **All endpoints must be authenticated; enforce role-based permissions.**
- **Program data is strictly isolated per program.**
- **Deleting = retiring/archiving, not physical delete, to preserve history.**
- **API should include auditing/logging.**
- **Tables should have indices on FKs for performance.**
- **Future-proof: Can add more endpoints/tables for features like schedule, notifications, parent invites, etc.**

---

*This spec can be adapted to your preferred ORM/backend. Add schedule, resources, notification tables as your feature set grows.*

---

## D. Test Coverage Summary

Automated Jest tests cover all implemented endpoints in `src/index.ts`. The latest test run produced the following summary:

```
All files  |    70.5 |     42.9 |   92.77 |   70.63 |
```

In total, 17 test suites ran 95 tests covering the API logic and utilities.
