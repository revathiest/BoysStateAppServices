GET /health
POST /register
POST /login
POST /logs
GET /logs
POST /audit-logs
GET /audit-logs
GET /programs
POST /programs
GET /programs/{id}
PUT /programs/{id}
DELETE /programs/{id}
GET /api/branding-contact/{programId}
POST /api/branding-contact/{programId}
PUT /api/branding-contact/{programId}
POST /programs/{programId}/users
GET /programs/{programId}/users
POST /programs/{programId}/years
GET /programs/{programId}/years
POST /programs/{programId}/grouping-types
GET /programs/{programId}/grouping-types
PUT /grouping-types/{id}
DELETE /grouping-types/{id}
POST /programs/{programId}/groupings
GET /programs/{programId}/groupings
PUT /groupings/{id}
DELETE /groupings/{id}
POST /program-years/{id}/groupings/activate
GET /program-years/{id}/groupings
POST /programs/{programId}/parties
GET /programs/{programId}/parties
PUT /parties/{id}
DELETE /parties/{id}
POST /program-years/{id}/parties/activate
GET /program-years/{id}/parties
POST /program-years/{id}/delegates
GET /program-years/{id}/delegates
PUT /delegates/{id}
DELETE /delegates/{id}
POST /program-years/{id}/staff
GET /program-years/{id}/staff
PUT /staff/{id}
DELETE /staff/{id}
POST /programs/{programId}/positions
GET /programs/{programId}/positions
PUT /positions/{id}
DELETE /positions/{id}
POST /program-years/{id}/positions
GET /program-years/{id}/positions
PUT /program-year-positions/{id}
POST /program-years/{id}/elections
GET /program-years/{id}/elections
PUT /elections/{id}
DELETE /elections/{id}
POST /elections/{id}/vote
GET /elections/{id}/results
DELETE /elections/{id}/results
POST /program-years/{id}/parents
GET /program-years/{id}/parents
PUT /parents/{id}
DELETE /parents/{id}
POST /delegate-parent-links
PUT /delegate-parent-links/{id}
GET /program-years/{id}
PUT /program-years/{id}
DELETE /program-years/{id}
GET /user-programs/{username}
