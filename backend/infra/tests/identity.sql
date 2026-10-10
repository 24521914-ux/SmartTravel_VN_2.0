-- Real storage constraints. Fixtures are transient: always ROLLBACK.
BEGIN;
INSERT INTO identity.users(user_id,email,password_hash,display_name) VALUES
 ('ffffffff-0000-4000-8000-000000000001','p01-probe@example.invalid','NOT_A_LOGIN_CREDENTIAL','Storage probe');
DO $$ BEGIN
  BEGIN
    INSERT INTO identity.users(user_id,email,password_hash,display_name) VALUES
      ('ffffffff-0000-4000-8000-000000000002','p01-probe@example.invalid','NOT_A_LOGIN_CREDENTIAL','Duplicate');
    RAISE EXCEPTION 'duplicate email accepted'; EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO identity.users(user_id,email,password_hash,display_name) VALUES
      ('ffffffff-0000-4000-8000-000000000002','UPPER@example.invalid','NOT_A_LOGIN_CREDENTIAL','Invalid');
    RAISE EXCEPTION 'noncanonical email accepted'; EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO identity.user_roles(user_id,role_code) VALUES ('ffffffff-0000-4000-8000-000000000003','USER');
    RAISE EXCEPTION 'missing user FK accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;
INSERT INTO identity.user_preferences(user_id) VALUES ('ffffffff-0000-4000-8000-000000000001');
DO $$ BEGIN
  IF (SELECT personalization_enabled FROM identity.user_preferences WHERE user_id='ffffffff-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'consent must default to false';
  END IF;
END $$;
ROLLBACK;
