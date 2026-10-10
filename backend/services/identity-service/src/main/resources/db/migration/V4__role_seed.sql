-- No user/password/token seed in production migrations.
INSERT INTO identity.roles(role_code,name) VALUES
 ('USER','Người dùng'), ('BUSINESS','Doanh nghiệp'), ('ADMIN','Quản trị viên');
