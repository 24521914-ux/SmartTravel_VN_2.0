package vn.smarttravel.ingestion.source.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.UUID;

@Repository
public class LocalFixturesRepository {
    private final JdbcTemplate db;
    public LocalFixturesRepository(JdbcTemplate db){this.db=db;}
    public void seed(String uri){db.update("INSERT INTO ingestion.data_sources(source_id,code,name,source_type,license_terms,license_version,allow_storage,allow_training,credential_secret_ref,status,uri) VALUES (?,'p01_synthetic','SYNTHETIC P01 source','API','Original generated fixture data, CC0; no external provider was crawled','CC0-synthetic-v1',true,false,'none','ACTIVE',?) ON CONFLICT(source_id) DO NOTHING",UUID.fromString("30000000-0000-4000-8000-000000000001"),uri);}
}
