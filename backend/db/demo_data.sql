INSERT INTO position (title, pay_grade) VALUES ('Engineering Manager','G5'),('Junior Developer','G1'),('Developer','G2'),('Senior Developer','G3'),('Staff Engineer','G4'),('DevOps Engineer','G3'),('QA Analyst','G2'),('Product Designer','G2'),('Office Administrator','G2'),('IT Manager','G5'),('Systems Administrator','G3'),('IT Support Specialist','G2'),('Payroll Manager','G5'),('Payroll Analyst','G3'),('Payroll Specialist','G2');

INSERT INTO position_wage (position_id, hourly_wage, effective_from, created_by)
SELECT p.position_id, v.w, DATE '2026-01-01', (SELECT min(employee_id) FROM employee)
FROM (VALUES ('Engineering Manager',85.00),('Junior Developer',38.00),('Developer',48.00),('Senior Developer',62.00),('Staff Engineer',75.00),('DevOps Engineer',58.00),('QA Analyst',40.00),('Product Designer',45.00),('Office Administrator',30.00),('IT Manager',80.00),('Systems Administrator',55.00),('IT Support Specialist',42.00),('Payroll Manager',75.00),('Payroll Analyst',48.00),('Payroll Specialist',40.00)) AS v(title, w) JOIN position p ON lower(p.title) = lower(v.title) AND NOT p.is_deleted;

INSERT INTO employee (cognito_sub, first_name, last_name, email, phone, street, city, province, postal_code, country, role_id, position_id, team_id, hire_date)
SELECT v.sub, v.fn, v.ln, v.em, v.ph, v.st, v.ci, v.pr, v.pc, v.co, v.role::smallint, p.position_id, t.team_id, v.hd::date
FROM (VALUES
('demo-0001','Oliver','Fraser','oliver.fraser@test.com','604-555-0101','101 Demo Street','Vancouver','BC','V6B 1A1','CA',1,'Engineering Manager',NULL,DATE '2021-03-04'),
('demo-0002','Ravi','Brown','ravi.brown@test.com','604-555-0102','102 Demo Street','Vancouver','BC','V6B 1A2','CA',1,'Engineering Manager',NULL,DATE '2021-03-04'),
('demo-0003','Alina','Khan','alina.khan@test.com','604-555-0103','103 Demo Street','Vancouver','BC','V6B 1A3','CA',1,'Engineering Manager',NULL,DATE '2021-03-04'),
('demo-0004','Mei','Ross','mei.ross@test.com','604-555-0104','104 Demo Street','Vancouver','BC','V6B 1A4','CA',1,'IT Manager',NULL,DATE '2021-03-04'),
('demo-0005','Jack','Murphy','jack.murphy@test.com','604-555-0105','105 Demo Street','Vancouver','BC','V6B 1A5','CA',1,'Payroll Manager',NULL,DATE '2021-03-04')
) AS v(sub, fn, ln, em, ph, st, ci, pr, pc, co, role, pos, team, hd)
JOIN position p ON lower(p.title) = lower(v.pos) AND NOT p.is_deleted
LEFT JOIN team t ON lower(t.name) = lower(v.team) AND NOT t.is_deleted;

INSERT INTO team (name, manager_id)
SELECT v.name, e.employee_id FROM (VALUES ('Platform Engineering','oliver.fraser@test.com'),('Product Development','ravi.brown@test.com'),('Quality & Design','alina.khan@test.com'),('IT Support','mei.ross@test.com'),('Payroll Team','jack.murphy@test.com')) AS v(name, em) JOIN employee e ON e.email = v.em;

INSERT INTO employee (cognito_sub, first_name, last_name, email, phone, street, city, province, postal_code, country, role_id, position_id, team_id, hire_date)
SELECT v.sub, v.fn, v.ln, v.em, v.ph, v.st, v.ci, v.pr, v.pc, v.co, v.role::smallint, p.position_id, t.team_id, v.hd::date
FROM (VALUES
('demo-0006','Sam','Silva','sam.silva@test.com','604-555-0106','106 Demo Street','Vancouver','BC','V6B 1A6','CA',NULL,'Junior Developer','Platform Engineering',DATE '2025-07-27'),
('demo-0007','Rhys','Dunn','rhys.dunn@test.com','604-555-0107','107 Demo Street','Vancouver','BC','V6B 1A7','CA',NULL,'Junior Developer','Platform Engineering',DATE '2025-06-15'),
('demo-0008','Kai','Ito','kai.ito@test.com','604-555-0108','108 Demo Street','Vancouver','BC','V6B 1A8','CA',NULL,'Developer','Platform Engineering',DATE '2020-03-02'),
('demo-0009','Liam','Tremblay','liam.tremblay@test.com','604-555-0109','109 Demo Street','Vancouver','BC','V6B 1A9','CA',NULL,'Developer','Platform Engineering',DATE '2025-01-31'),
('demo-0010','Yuki','Hall','yuki.hall@test.com','604-555-0110','110 Demo Street','Vancouver','BC','V6B 1A0','CA',NULL,'Developer','Platform Engineering',DATE '2025-09-28'),
('demo-0011','Chloe','Martin','chloe.martin@test.com','604-555-0111','111 Demo Street','Vancouver','BC','V6B 1A1','CA',NULL,'Senior Developer','Platform Engineering',DATE '2025-08-19'),
('demo-0012','Ethan','Dubois','ethan.dubois@test.com','604-555-0112','112 Demo Street','Vancouver','BC','V6B 1A2','CA',NULL,'Senior Developer','Platform Engineering',DATE '2025-08-07'),
('demo-0013','Priya','Kaur','priya.kaur@test.com','604-555-0113','113 Demo Street','Vancouver','BC','V6B 1A3','CA',NULL,'Staff Engineer','Platform Engineering',DATE '2025-07-05'),
('demo-0014','Theo','Bell','theo.bell@test.com','604-555-0114','114 Demo Street','Vancouver','BC','V6B 1A4','CA',NULL,'DevOps Engineer','Platform Engineering',DATE '2025-09-01'),
('demo-0015','Dev','Reid','dev.reid@test.com','604-555-0115','115 Demo Street','Vancouver','BC','V6B 1A5','CA',NULL,'DevOps Engineer','Platform Engineering',DATE '2025-02-25'),
('demo-0016','Tara','Moore','tara.moore@test.com','604-555-0116','116 Demo Street','Vancouver','BC','V6B 1A6','CA',NULL,'Junior Developer','Product Development',DATE '2026-03-02'),
('demo-0017','Ivy','Kim','ivy.kim@test.com','604-555-0117','117 Demo Street','Vancouver','BC','V6B 1A7','CA',NULL,'Junior Developer','Product Development',DATE '2025-05-26'),
('demo-0018','Owen','Walker','owen.walker@test.com','604-555-0118','118 Demo Street','Vancouver','BC','V6B 1A8','CA',NULL,'Developer','Product Development',DATE '2025-01-19'),
('demo-0019','Ruby','Clarke','ruby.clarke@test.com','604-555-0119','119 Demo Street','Vancouver','BC','V6B 1A9','CA',NULL,'Developer','Product Development',DATE '2025-01-06'),
('demo-0020','Omar','Haddad','omar.haddad@test.com','604-555-0120','120 Demo Street','Vancouver','BC','V6B 1A0','CA',NULL,'Developer','Product Development',DATE '2025-03-27'),
('demo-0021','Leila','Sharma','leila.sharma@test.com','604-555-0121','121 Demo Street','Vancouver','BC','V6B 1A1','CA',NULL,'Developer','Product Development',DATE '2025-03-30'),
('demo-0022','Isla','Mori','isla.mori@test.com','604-555-0122','122 Demo Street','Vancouver','BC','V6B 1A2','CA',NULL,'Senior Developer','Product Development',DATE '2025-03-11'),
('demo-0023','Finn','Pike','finn.pike@test.com','604-555-0123','123 Demo Street','Vancouver','BC','V6B 1A3','CA',NULL,'Senior Developer','Product Development',DATE '2025-02-13'),
('demo-0024','Hana','Park','hana.park@test.com','604-555-0124','124 Demo Street','Vancouver','BC','V6B 1A4','CA',NULL,'Senior Developer','Product Development',DATE '2025-09-05'),
('demo-0025','Emma','Costa','emma.costa@test.com','604-555-0125','125 Demo Street','Vancouver','BC','V6B 1A5','CA',NULL,'Staff Engineer','Product Development',DATE '2025-07-15'),
('demo-0026','Amir','Shah','amir.shah@test.com','604-555-0126','126 Demo Street','Vancouver','BC','V6B 1A6','CA',NULL,'Product Designer','Product Development',DATE '2025-03-20'),
('demo-0027','Nina','Lam','nina.lam@test.com','604-555-0127','127 Demo Street','Vancouver','BC','V6B 1A7','CA',NULL,'QA Analyst','Quality & Design',DATE '2026-07-13'),
('demo-0028','Cora','Diaz','cora.diaz@test.com','604-555-0128','128 Demo Street','Vancouver','BC','V6B 1A8','CA',NULL,'QA Analyst','Quality & Design',DATE '2025-04-27'),
('demo-0029','Mateo','Gill','mateo.gill@test.com','604-555-0129','129 Demo Street','Vancouver','BC','V6B 1A9','CA',NULL,'QA Analyst','Quality & Design',DATE '2025-07-22'),
('demo-0030','Anya','Hart','anya.hart@test.com','604-555-0130','130 Demo Street','Vancouver','BC','V6B 1A0','CA',NULL,'Product Designer','Quality & Design',DATE '2025-06-17'),
('demo-0031','Sofia','Chen','sofia.chen@test.com','604-555-0131','131 Demo Street','Vancouver','BC','V6B 1A1','CA',NULL,'Product Designer','Quality & Design',DATE '2025-05-09'),
('demo-0032','Jonas','Vega','jonas.vega@test.com','604-555-0132','132 Demo Street','Vancouver','BC','V6B 1A2','CA',NULL,'Office Administrator','Quality & Design',DATE '2025-04-22'),
('demo-0033','Ben','Ng','ben.ng@test.com','604-555-0133','133 Demo Street','Vancouver','BC','V6B 1A3','CA',3,'Systems Administrator','IT Support',DATE '2025-08-08'),
('demo-0034','Noah','Wilson','noah.wilson@test.com','604-555-0134','134 Demo Street','Vancouver','BC','V6B 1A4','CA',3,'Systems Administrator','IT Support',DATE '2025-06-21'),
('demo-0035','Lena','Cruz','lena.cruz@test.com','604-555-0135','135 Demo Street','Vancouver','BC','V6B 1A5','CA',3,'IT Support Specialist','IT Support',DATE '2025-02-22'),
('demo-0036','Aiden','Nguyen','aiden.nguyen@test.com','604-555-0136','136 Demo Street','Vancouver','BC','V6B 1A6','CA',3,'IT Support Specialist','IT Support',DATE '2025-02-21'),
('demo-0037','Grace','Wong','grace.wong@test.com','604-555-0137','137 Demo Street','Vancouver','BC','V6B 1A7','CA',2,'Payroll Analyst','Payroll Team',DATE '2025-09-29'),
('demo-0038','Lucas','Roy','lucas.roy@test.com','604-555-0138','138 Demo Street','Vancouver','BC','V6B 1A8','CA',2,'Payroll Specialist','Payroll Team',DATE '2025-03-27'),
('demo-0039','Maya','Singh','maya.singh@test.com','604-555-0139','139 Demo Street','Vancouver','BC','V6B 1A9','CA',2,'Payroll Specialist','Payroll Team',DATE '2025-05-13')
) AS v(sub, fn, ln, em, ph, st, ci, pr, pc, co, role, pos, team, hd)
JOIN position p ON lower(p.title) = lower(v.pos) AND NOT p.is_deleted
LEFT JOIN team t ON lower(t.name) = lower(v.team) AND NOT t.is_deleted;

INSERT INTO project (project_code, name, created_by)
SELECT v.code, v.name, e.employee_id FROM (VALUES (1001,'Customer Portal','ravi.brown@test.com'),(1002,'Mobile App','ravi.brown@test.com'),(1003,'Payments API','oliver.fraser@test.com'),(1004,'Internal Tools','oliver.fraser@test.com'),(1005,'Infrastructure & Reliability','oliver.fraser@test.com'),(1006,'IT Service Desk','mei.ross@test.com'),(1007,'Payroll Operations','jack.murphy@test.com')) AS v(code, name, em) JOIN employee e ON e.email = v.em;

INSERT INTO project_assignment (project_id, employee_id, assigned_by)
SELECT pr.project_id, e.employee_id, m.employee_id FROM (VALUES
('sam.silva@test.com',1005,'oliver.fraser@test.com'),
('sam.silva@test.com',1004,'oliver.fraser@test.com'),
('rhys.dunn@test.com',1005,'oliver.fraser@test.com'),
('rhys.dunn@test.com',1003,'oliver.fraser@test.com'),
('kai.ito@test.com',1003,'oliver.fraser@test.com'),
('liam.tremblay@test.com',1005,'oliver.fraser@test.com'),
('liam.tremblay@test.com',1003,'oliver.fraser@test.com'),
('yuki.hall@test.com',1004,'oliver.fraser@test.com'),
('chloe.martin@test.com',1005,'oliver.fraser@test.com'),
('chloe.martin@test.com',1003,'oliver.fraser@test.com'),
('ethan.dubois@test.com',1003,'oliver.fraser@test.com'),
('ethan.dubois@test.com',1004,'oliver.fraser@test.com'),
('priya.kaur@test.com',1005,'oliver.fraser@test.com'),
('priya.kaur@test.com',1003,'oliver.fraser@test.com'),
('theo.bell@test.com',1005,'oliver.fraser@test.com'),
('theo.bell@test.com',1004,'oliver.fraser@test.com'),
('dev.reid@test.com',1005,'oliver.fraser@test.com'),
('tara.moore@test.com',1001,'ravi.brown@test.com'),
('tara.moore@test.com',1002,'ravi.brown@test.com'),
('ivy.kim@test.com',1003,'ravi.brown@test.com'),
('ivy.kim@test.com',1002,'ravi.brown@test.com'),
('owen.walker@test.com',1003,'ravi.brown@test.com'),
('ruby.clarke@test.com',1001,'ravi.brown@test.com'),
('ruby.clarke@test.com',1002,'ravi.brown@test.com'),
('omar.haddad@test.com',1001,'ravi.brown@test.com'),
('leila.sharma@test.com',1003,'ravi.brown@test.com'),
('isla.mori@test.com',1001,'ravi.brown@test.com'),
('isla.mori@test.com',1003,'ravi.brown@test.com'),
('finn.pike@test.com',1001,'ravi.brown@test.com'),
('finn.pike@test.com',1003,'ravi.brown@test.com'),
('hana.park@test.com',1003,'ravi.brown@test.com'),
('hana.park@test.com',1001,'ravi.brown@test.com'),
('emma.costa@test.com',1001,'ravi.brown@test.com'),
('emma.costa@test.com',1002,'ravi.brown@test.com'),
('amir.shah@test.com',1003,'ravi.brown@test.com'),
('nina.lam@test.com',1002,'alina.khan@test.com'),
('nina.lam@test.com',1001,'alina.khan@test.com'),
('cora.diaz@test.com',1001,'alina.khan@test.com'),
('cora.diaz@test.com',1004,'alina.khan@test.com'),
('mateo.gill@test.com',1001,'alina.khan@test.com'),
('mateo.gill@test.com',1004,'alina.khan@test.com'),
('anya.hart@test.com',1004,'alina.khan@test.com'),
('anya.hart@test.com',1002,'alina.khan@test.com'),
('sofia.chen@test.com',1002,'alina.khan@test.com'),
('sofia.chen@test.com',1001,'alina.khan@test.com'),
('jonas.vega@test.com',1004,'alina.khan@test.com'),
('jonas.vega@test.com',1001,'alina.khan@test.com'),
('ben.ng@test.com',1004,'mei.ross@test.com'),
('ben.ng@test.com',1005,'mei.ross@test.com'),
('noah.wilson@test.com',1004,'mei.ross@test.com'),
('lena.cruz@test.com',1005,'mei.ross@test.com'),
('lena.cruz@test.com',1004,'mei.ross@test.com'),
('aiden.nguyen@test.com',1004,'mei.ross@test.com'),
('aiden.nguyen@test.com',1006,'mei.ross@test.com'),
('grace.wong@test.com',1007,'jack.murphy@test.com'),
('lucas.roy@test.com',1007,'jack.murphy@test.com'),
('lucas.roy@test.com',1004,'jack.murphy@test.com'),
('maya.singh@test.com',1004,'jack.murphy@test.com'),
('maya.singh@test.com',1007,'jack.murphy@test.com')
) AS v(em, code, mem) JOIN employee e ON e.email = v.em JOIN project pr ON pr.project_code = v.code JOIN employee m ON m.email = v.mem;

INSERT INTO direct_deposit (employee_id, institution_no, transit_no, account_no, account_last4)
SELECT e.employee_id, v.inst, v.transit, 'DEMO-PLACEHOLDER-NOT-ENCRYPTED', v.last4 FROM (VALUES
('oliver.fraser@test.com','002','89404','1198'),
('ravi.brown@test.com','010','69215','2884'),
('alina.khan@test.com','006','75227','0192'),
('mei.ross@test.com','004','31695','1774'),
('jack.murphy@test.com','001','30233','0003'),
('sam.silva@test.com','002','91994','2139'),
('rhys.dunn@test.com','001','66706','8596'),
('kai.ito@test.com','002','53500','0609'),
('liam.tremblay@test.com','001','83211','9356'),
('yuki.hall@test.com','001','11954','8377'),
('chloe.martin@test.com','010','47171','5230'),
('ethan.dubois@test.com','002','77428','8343'),
('priya.kaur@test.com','002','79529','4482'),
('theo.bell@test.com','010','87377','8918'),
('dev.reid@test.com','004','87142','1064'),
('tara.moore@test.com','002','51691','9942'),
('ivy.kim@test.com','006','73536','7708'),
('owen.walker@test.com','010','74902','3000'),
('ruby.clarke@test.com','002','82200','7290'),
('omar.haddad@test.com','004','86260','1333'),
('leila.sharma@test.com','003','18778','7083'),
('isla.mori@test.com','010','35904','2389'),
('finn.pike@test.com','002','10864','0477'),
('hana.park@test.com','001','90018','6167'),
('emma.costa@test.com','002','62841','6472'),
('amir.shah@test.com','001','13154','7127'),
('nina.lam@test.com','004','53664','9414'),
('cora.diaz@test.com','002','79592','4225'),
('mateo.gill@test.com','002','16528','8857'),
('anya.hart@test.com','006','90217','2611'),
('sofia.chen@test.com','003','27318','1490'),
('jonas.vega@test.com','004','63974','5095'),
('ben.ng@test.com','002','91553','9189'),
('noah.wilson@test.com','004','12699','7820'),
('lena.cruz@test.com','006','53025','6618'),
('aiden.nguyen@test.com','001','97291','9806'),
('grace.wong@test.com','002','93033','4035'),
('lucas.roy@test.com','010','83739','2382'),
('maya.singh@test.com','010','19765','5368')
) AS v(em, inst, transit, last4) JOIN employee e ON e.email = v.em;
