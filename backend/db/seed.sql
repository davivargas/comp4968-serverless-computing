WITH p AS (INSERT INTO position (title, pay_grade) VALUES ('IT Administrator', 'G1') RETURNING position_id),
     e AS (INSERT INTO employee (cognito_sub, first_name, last_name, email, role_id, position_id, hire_date)
           SELECT 'REPLACE-WITH-COGNITO-SUB', 'First', 'Admin', 'admin@example.com', 3, p.position_id, CURRENT_DATE FROM p
           RETURNING employee_id, position_id)
INSERT INTO position_wage (position_id, hourly_wage, effective_from, created_by)
SELECT position_id, 40.00, DATE '2000-01-01', employee_id FROM e;
