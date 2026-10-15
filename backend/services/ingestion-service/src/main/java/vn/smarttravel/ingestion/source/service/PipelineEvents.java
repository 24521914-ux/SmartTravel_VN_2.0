package vn.smarttravel.ingestion.source.service;
import vn.smarttravel.ingestion.source.repository.PipelineStore;
import vn.smarttravel.ingestion.source.client.*;
import vn.smarttravel.ingestion.source.service.*;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static vn.smarttravel.ingestion.source.repository.SqlStatements.*;
import static vn.smarttravel.ingestion.shared.web.ApiValues.*;

@Service
public class PipelineEvents {
    private final PipelineStore s;
    private final PipelineService pipeline;
    public PipelineEvents(PipelineStore s,PipelineService pipeline){this.s=s;this.pipeline=pipeline;}
    private void status(Map<String,Object> event){
        require(number(event.get("schema_version"))==1,422,"UNSUPPORTED_EVENT_VERSION");
        @SuppressWarnings("unchecked")var payload=(Map<String,Object>)event.get("payload");
        UUID user=id(payload.get("user_id"));String status=Objects.toString(payload.get("status"),"");long version=number(payload.get("version"));
        require(Set.of("ACTIVE","DISABLED","DELETED").contains(status)&&version>0,422,"INVALID_USER_STATUS");
        s.lockActor(user);
        if(s.update(FINAL_REVIEW_SQL_1,id(event.get("event_id")))==0)return;
        s.update(FINAL_REVIEW_SQL_2,user,status,version);
    }
    @Transactional public void consume(Map<String,Object>event){if("identity.user.status-changed.v1".equals(event.get("event_type"))){status(event);return;}if(!"identity.user.deletion-requested.v1".equals(event.get("event_type"))){pipeline.result(event);return;}require(number(event.get("schema_version"))==1,422,"UNSUPPORTED_EVENT_VERSION");@SuppressWarnings("unchecked")var p=(Map<String,Object>)event.get("payload");UUID user=id(p.get("user_id")),request=id(p.get("deletion_request_id"));s.lockActor(user);if(s.update(INSERT_INBOX_EVENTS_1,id(event.get("event_id")))==0)return;s.update(INSERT_USER_TOMBSTONES_2,user,request);s.update(UPDATE_IMPORT_JOBS_3,user);s.update(UPDATE_MATCH_CANDIDATES_4,user);s.queryForList(PURGE_USER_AUDIT,user);s.update(DELETE_IDEMPOTENCY_RECORDS_6,user.toString());s.update(FINAL_REVIEW_SQL_3,user);s.event(request,number(event.get("aggregate_version")),"domain.user-data-deleted.v1",map("deletion_request_id",request,"service","ingestion","status","COMPLETED","artifact_handling","Operator identifiers anonymized; licensed public source data retained; tombstone retained"));}
}
