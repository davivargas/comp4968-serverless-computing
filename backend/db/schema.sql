CREATE TABLE role (
  role_id SMALLINT PRIMARY KEY,
  name    VARCHAR(30) NOT NULL UNIQUE
);
INSERT INTO role (role_id, name) VALUES (1,'MANAGER'),(2,'PAYROLL_ADMIN'),(3,'IT');

CREATE TABLE position (
  position_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       VARCHAR(100) NOT NULL,
  pay_grade   VARCHAR(30)  NOT NULL,
  is_deleted  BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX position_title_uq ON position (lower(title)) WHERE NOT is_deleted;

CREATE TABLE team (
  team_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  manager_id INT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX team_name_uq ON team (lower(name)) WHERE NOT is_deleted;
