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

CREATE TABLE employee (
  employee_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cognito_sub VARCHAR(64)  NOT NULL UNIQUE,
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  phone       VARCHAR(16),
  street      VARCHAR(200),
  city        VARCHAR(100),
  province    VARCHAR(2),
  postal_code VARCHAR(10),
  country     VARCHAR(2),
  role_id     SMALLINT REFERENCES role(role_id),
  position_id INT NOT NULL REFERENCES position(position_id),
  team_id     INT REFERENCES team(team_id),
  status      VARCHAR(12) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DEACTIVATED')),
  hire_date   DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE team ADD CONSTRAINT team_manager_fk FOREIGN KEY (manager_id) REFERENCES employee(employee_id);
CREATE INDEX employee_team_idx ON employee(team_id);
CREATE INDEX employee_position_idx ON employee(position_id);

CREATE TABLE position_wage (
  wage_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  position_id    INT NOT NULL REFERENCES position(position_id),
  hourly_wage    NUMERIC(10,2) NOT NULL CHECK (hourly_wage >= 0),
  effective_from DATE NOT NULL,
  created_by     INT NOT NULL REFERENCES employee(employee_id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (position_id, effective_from)
);

CREATE TABLE direct_deposit (
  employee_id    INT PRIMARY KEY REFERENCES employee(employee_id),
  institution_no CHAR(3) NOT NULL,
  transit_no     CHAR(5) NOT NULL,
  account_no     TEXT NOT NULL,
  account_last4  CHAR(4) NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE project (
  project_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_code INT NOT NULL UNIQUE,
  name         VARCHAR(200) NOT NULL,
  status       VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED')),
  is_deleted   BOOLEAN NOT NULL DEFAULT false,
  created_by   INT NOT NULL REFERENCES employee(employee_id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
