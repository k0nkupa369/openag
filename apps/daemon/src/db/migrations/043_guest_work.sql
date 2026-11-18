CREATE TABLE guest_work_assignments (
  work_id TEXT PRIMARY KEY REFERENCES work(id),
  permission_parents_json TEXT NOT NULL
);
