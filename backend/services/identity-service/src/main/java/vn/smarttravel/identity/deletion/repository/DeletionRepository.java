package vn.smarttravel.identity.deletion.repository;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DeletionRepository {
    private final JdbcTemplate db;
    public DeletionRepository(JdbcTemplate db) { this.db=db; }
    public void create(UUID request, UUID user, long policy) {
        db.update("INSERT INTO identity.data_deletion_requests(deletion_request_id,user_id,policy_version,status) VALUES (?,?,?,'PROCESSING')",request,user,Long.toString(policy));
        for(String service:List.of("identity","catalog","community","trip","ingestion","intelligence"))
            db.update("INSERT INTO identity.data_deletion_acks(deletion_request_id,service_name,status) VALUES (?,?,'PENDING')",request,service);
    }
    public void eraseLocal(UUID user, UUID request) {
        db.update("DELETE FROM identity.account_mail_jobs WHERE user_id=?",user);
        db.update("DELETE FROM identity.account_tokens WHERE user_id=?",user);
        db.update("DELETE FROM identity.notifications WHERE user_id=?",user);
        db.update("DELETE FROM identity.user_preference_options WHERE user_id=?",user);
        db.update("DELETE FROM identity.user_category_preferences WHERE user_id=?",user);
        db.update("""
            UPDATE identity.user_preferences SET personalization_enabled=false,consent_version=consent_version+1,
            consent_updated_at=now(),budget_level='MID',budget_min=NULL,budget_max=NULL,companion_type=NULL,
            indoor_outdoor=NULL,version=version+1,updated_at=now() WHERE user_id=?
            """,user);
        db.update("UPDATE identity.data_deletion_acks SET status='COMPLETED',updated_at=now(),artifact_result='{\"local_data\":\"erased; auth revoked; account tombstoned in same transaction\"}'::jsonb WHERE deletion_request_id=? AND service_name='identity'",request);
    }
    public Map<String,Object> find(UUID request, boolean lock) {
        var rows=db.queryForList("SELECT * FROM identity.data_deletion_requests WHERE deletion_request_id=?"+(lock?" FOR UPDATE":""),request);
        return rows.isEmpty()?null:rows.getFirst();
    }
    public boolean claim(UUID event) {
        return db.update("INSERT INTO identity.inbox_events(consumer_name,event_id) VALUES ('identity.deletion',?) ON CONFLICT DO NOTHING",event)==1;
    }
    public boolean acknowledge(UUID request, String service, String state, long version, String result) {
        return db.update("""
            UPDATE identity.data_deletion_acks SET status=?,source_version=?,artifact_result=?::jsonb,updated_at=now()
            WHERE deletion_request_id=? AND service_name=? AND source_version<? AND status<>'COMPLETED'
            """,state,version,result,request,service,version)==1;
    }
    public String state(UUID request) {
        if(db.queryForObject("SELECT count(*) FROM identity.data_deletion_acks WHERE deletion_request_id=? AND status='COMPLETED'",Integer.class,request)==6) return "COMPLETED";
        if(db.queryForObject("SELECT EXISTS(SELECT 1 FROM identity.data_deletion_acks WHERE deletion_request_id=? AND status='FAILED')",Boolean.class,request)) return "FAILED";
        return "PROCESSING";
    }
    public void updateState(UUID request, String state) {
        db.update("""
            UPDATE identity.data_deletion_requests SET status=?,version=version+1,
            completed_at=CASE WHEN ?='COMPLETED' THEN now() ELSE NULL END,
            error_summary=CASE WHEN ?='FAILED' THEN 'DOMAIN_ACK_FAILED' ELSE NULL END WHERE deletion_request_id=?
            """,state,state,state,request);
    }
    public long tombstone(UUID user) {
        db.update("DELETE FROM identity.user_roles WHERE user_id=?",user);
        return db.queryForObject("""
            UPDATE identity.users SET email='deleted-'||user_id||'@example.invalid',display_name='Deleted user',
            password_hash='!',avatar_object_key=NULL,email_verified_at=NULL,status='DELETED',deleted_at=now(),
            version=version+1,updated_at=now() WHERE user_id=? RETURNING version
            """,Long.class,user);
    }
}
