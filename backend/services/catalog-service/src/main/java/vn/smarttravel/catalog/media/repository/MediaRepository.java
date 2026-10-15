package vn.smarttravel.catalog.media.repository;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Repository
public class MediaRepository {
    private final JdbcTemplate db;public MediaRepository(JdbcTemplate db){this.db=db;}
    @Transactional public Map<String,Object> create(UUID id,String key,String checksum,String mime,long size,UUID actor){vn.smarttravel.catalog.infrastructure.persistence.repository.UserMutationFence.acquire(db,actor);db.update("INSERT INTO catalog.media_assets(media_id,object_key,checksum,mime_type,byte_size,created_by) VALUES(?,?,?,?,?,?)",id,key,checksum,mime,size,actor);return get(id,false);}
    public Map<String,Object> get(UUID id,boolean publicOnly){var rows=db.queryForList("SELECT * FROM catalog.media_assets WHERE media_id=?"+(publicOnly?" AND moderation_status='APPROVED' AND object_key NOT LIKE 'private/%'":""),id);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND);return rows.getFirst();}
    @Transactional public Map<String,Object> review(UUID id,UUID reviewer,String status,String reason){vn.smarttravel.catalog.infrastructure.persistence.repository.UserMutationFence.acquire(db,reviewer);if(!Set.of("APPROVED","REJECTED").contains(status)||reason==null||reason.isBlank())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Decision and reason required");get(id,false);db.update("UPDATE catalog.media_assets SET moderation_status=? WHERE media_id=?",status,id);db.update("INSERT INTO catalog.audit_logs(audit_id,actor_id,actor_type,entity_type,entity_id,action,new_value) VALUES(?,?,'USER','media',?,?,jsonb_build_object('status',?::text,'reason',?::text))",UUID.randomUUID(),reviewer,id.toString(),"MEDIA_REVIEWED",status,reason);return get(id,false);}
}
