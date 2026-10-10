package vn.smarttravel.identity.internal.repository;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class UserBatchRepository {
    private final JdbcTemplate db;
    public UserBatchRepository(JdbcTemplate db) { this.db=db; }
    public Map<String,Object> find(UUID user) {
        var rows=db.queryForList("SELECT user_id,status,version FROM identity.users WHERE user_id=?",user);
        return rows.isEmpty()?null:rows.getFirst();
    }
}
