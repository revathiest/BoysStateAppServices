# Boys State App: Core Data Model & API Spec

---

## A. Core Tables & Relationships

### 1. Program *(Implemented)*
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

### 2. ProgramYear *(Implemented)*
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

### 3. GroupingType *(Implemented)*
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

### 4. Grouping *(Implemented)*
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

### 5. ProgramYearGrouping *(Implemented)*
*(Which groupings are active in which years)*
- `id` (PK)
- `program_year_id` (FK → ProgramYear)
- `grouping_id` (FK → Grouping)
- `status` (active, inactive)

---

### 6. Party *(Implemented)*
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

### 7. ProgramYearParty *(Implemented)*
- `id` (PK)
- `program_year_id` (FK → ProgramYear)
- `party_id` (FK → Party)
- `status` (active, inactive)

---

### 8. Delegate *(Implemented)*
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

### 9. Staff *(Implemented)*
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

### 10. Parent *(Implemented)*
- `id` (PK)
- `user_id` (if linked to user account)
- `first_name`
- `last_name`
- `email`
- `phone`
- `created_at`
- `updated_at`

### 11. DelegateParentLink *(Implemented)*
- `id` (PK)
- `delegate_id` (FK → Delegate)
- `parent_id` (FK → Parent)
- `program_year_id` (FK → ProgramYear)
- `status` (pending, accepted, revoked)
- `created_at`

---

### 12. Position *(Not Implemented)*
- `id` (PK)
- `program_id` (FK → Program)
- `name` (e.g., Mayor, Governor, Councilmember)
- `description`
- `is_elected` (boolean)
- `grouping_type_id` (FK to GroupingType)
- `status` (active, retired)
- `display_order`
- `created_at`
- `updated_at`

---

### 13. ProgramYearPosition *(Not Implemented)*
- `id` (PK)
- `program_year_id` (FK → ProgramYear)
- `position_id` (FK → Position)
- `grouping_id` (FK → Grouping, instance this is attached to, e.g., Mayor of Covington Town)
- `assigned_delegate_id` (FK → Delegate, nullable, when filled)
- `assigned_by_staff_id` (FK → Staff, for appointed)
- `is_elected` (copied for audit)
- `status` (open, filled, archived)
- `notes`
- `created_at`
- `updated_at`

---

### 14. Election (if needed) *(Not Implemented)*
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

### 15. ElectionVote *(Not Implemented)*
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
- `GET /programs` — List all programs *(implemented)*
- `POST /programs` — Create program *(implemented)*
- `GET /programs/{id}` — Get program details *(implemented)*
- `PUT /programs/{id}` — Update program *(implemented)*
- `DELETE /programs/{id}` — Retire program *(implemented)*

### Program Year Management
- `GET /programs/{id}/years` — List years for a program *(implemented)*
- `POST /programs/{id}/years` — Create new program year *(implemented)*
- `GET /program-years/{id}` — Get year details *(implemented)*
- `PUT /program-years/{id}` — Update year *(implemented)*
- `DELETE /program-years/{id}` — Archive year *(implemented)*

### Grouping Types (custom naming)
- `GET /programs/{id}/grouping-types` — List grouping types *(implemented)*
- `POST /programs/{id}/grouping-types` — Add grouping type *(implemented)*
- `PUT /grouping-types/{id}` — Update custom/plural names *(implemented)*
- `DELETE /grouping-types/{id}` — Retire type *(implemented)*

### Groupings (instances: parishes, towns, etc.)
- `GET /programs/{id}/groupings` — List all groupings *(implemented)*
- `POST /programs/{id}/groupings` — Add grouping *(implemented)*
- `PUT /groupings/{id}` — Update grouping *(implemented)*
- `DELETE /groupings/{id}` — Retire grouping *(implemented)*
- `POST /program-years/{id}/groupings/activate` — Activate groupings for year *(implemented)*
- `GET /program-years/{id}/groupings` — List active groupings for year *(implemented)*

### Parties
- `GET /programs/{id}/parties` *(implemented)*
- `POST /programs/{id}/parties` *(implemented)*
- `PUT /parties/{id}` *(implemented)*
- `DELETE /parties/{id}` *(implemented)*
- `POST /program-years/{id}/parties/activate` *(implemented)*
- `GET /program-years/{id}/parties` *(implemented)*

### Delegates
- `GET /program-years/{id}/delegates` *(implemented)*
- `POST /program-years/{id}/delegates` *(implemented)*
- `PUT /delegates/{id}` *(implemented)*
- `DELETE /delegates/{id}` *(implemented)*

### Staff
- `GET /program-years/{id}/staff` *(implemented)*
- `POST /program-years/{id}/staff` *(implemented)*
- `PUT /staff/{id}` *(implemented)*
- `DELETE /staff/{id}` *(implemented)*

### Parents & Delegate Linking
- `GET /program-years/{id}/parents` *(implemented)*
- `POST /program-years/{id}/parents` *(implemented)*
- `PUT /parents/{id}` *(implemented)*
- `DELETE /parents/{id}` *(implemented)*
- `POST /delegate-parent-links` (create link) *(implemented)*
- `PUT /delegate-parent-links/{id}` (update status) *(implemented)*

### Positions
- `GET /programs/{id}/positions` *(not implemented)*
- `POST /programs/{id}/positions` *(not implemented)*
- `PUT /positions/{id}` *(not implemented)*
- `DELETE /positions/{id}` *(not implemented)*

### Program Year Positions (instances/assignments)
- `GET /program-years/{id}/positions` *(not implemented)*
- `POST /program-years/{id}/positions` *(not implemented)*
- `PUT /program-year-positions/{id}` *(not implemented)*
- `DELETE /program-year-positions/{id}` *(not implemented)*

### Elections (if implemented)
- `GET /program-years/{id}/elections` *(not implemented)*
- `POST /program-years/{id}/elections` *(not implemented)*
- `PUT /elections/{id}` *(not implemented)*
- `DELETE /elections/{id}` *(not implemented)*
- `POST /elections/{id}/vote` (submit vote) *(not implemented)*
- `GET /elections/{id}/results` *(not implemented)*

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
