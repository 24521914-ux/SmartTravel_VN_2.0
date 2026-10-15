package vn.smarttravel.community.infrastructure.persistence.repository;
import java.util.*;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.*;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
@Repository
public class FixtureRepository {
    private final MongoTemplate mongo;
    public FixtureRepository(MongoTemplate mongo){this.mongo=mongo;}
    @Transactional public void seed(){String user="10000000-0000-0000-0000-000000000001",other="10000000-0000-0000-0000-000000000002",place="20000000-0000-0000-0000-000000000001";for(int n=1;n<=2;n++){String id="30000000-0000-0000-0000-00000000000"+n;if(mongo.exists(Query.query(Criteria.where("_id").is(id)),"reviews"))continue;Date now=new Date();mongo.insert(new Document("_id",id).append("user_id",n==1?user:other).append("place_id",place).append("rating",n==1?5:3).append("content","Synthetic licensed local fixture "+n).append("media_keys",List.of()).append("status","PENDING").append("version",1L).append("created_at",now).append("updated_at",now),"reviews");}}
}
