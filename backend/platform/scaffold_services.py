"""Create six independent P00 Spring Boot skeletons without domain code.
Refuses to replace existing source. JDBC/Flyway only for relational services;
Community uses Spring Data MongoDB, no JPA or SQL migrations.
"""
from pathlib import Path

BACKEND=Path(__file__).resolve().parents[1]
SERVICES=['identity','catalog','community','trip','ingestion','intelligence']
ROOT=BACKEND/'services'

def save(path,content):
    if path.exists(): raise FileExistsError(f'Refusing to overwrite {path}')
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(content,encoding='utf-8')

save(ROOT/'pom.xml', '''<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
<modelVersion>4.0.0</modelVersion>
<parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>3.5.13</version><relativePath/></parent>
<groupId>vn.smarttravel</groupId><artifactId>services</artifactId><version>0.0.1-SNAPSHOT</version><packaging>pom</packaging>
<properties><java.version>21</java.version></properties>
<modules>''' + ''.join(f'<module>{s}-service</module>' for s in SERVICES) + '''</modules>
</project>
''')
security=(BACKEND/'platform/p00-template/src/main/java/vn/smarttravel/platform/SecurityConfiguration.java').read_text(encoding='utf-8')
for index,s in enumerate(SERVICES):
    dest=ROOT/f'{s}-service'
    deps=['spring-boot-starter-web','spring-boot-starter-actuator','spring-boot-starter-oauth2-resource-server']
    deps.append('spring-boot-starter-data-mongodb' if s=='community' else 'spring-boot-starter-jdbc')
    xml=''.join(f'<dependency><groupId>org.springframework.boot</groupId><artifactId>{d}</artifactId></dependency>' for d in deps)
    if s!='community': xml+='''<dependency><groupId>org.flywaydb</groupId><artifactId>flyway-core</artifactId></dependency><dependency><groupId>org.flywaydb</groupId><artifactId>flyway-database-postgresql</artifactId></dependency><dependency><groupId>org.postgresql</groupId><artifactId>postgresql</artifactId><scope>runtime</scope></dependency>'''
    xml+='''<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency>'''
    save(dest/'pom.xml',f'''<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
<modelVersion>4.0.0</modelVersion><parent><groupId>vn.smarttravel</groupId><artifactId>services</artifactId><version>0.0.1-SNAPSHOT</version><relativePath>../pom.xml</relativePath></parent>
<artifactId>{s}-service</artifactId><dependencies>{xml}</dependencies>
<build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build>
</project>
''')
    base=dest/f'src/main/java/vn/smarttravel/{s}'
    save(base/'ServiceApplication.java',f'''package vn.smarttravel.{s};
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
@SpringBootApplication
public class ServiceApplication {{
    public static void main(String[] args) {{ SpringApplication.run(ServiceApplication.class, args); }}
}}
''')
    save(base/'SecurityConfiguration.java',security.replace('package vn.smarttravel.platform;',f'package vn.smarttravel.{s};'))
    config=f'''spring.application.name={s}-service
server.port=${{PORT:{8101+index}}}
management.endpoints.web.exposure.include=health,info
management.endpoint.health.show-details=never
management.endpoint.health.probes.enabled=true
security.jwt.jwk-set-uri=${{JWT_JWKS_URI}}
security.jwt.issuer=${{JWT_ISSUER}}
security.jwt.audience=${{JWT_AUDIENCE:{s}}}
logging.pattern.level=%5p [correlation=%X{{correlationId}}]
'''
    if s=='community': config+='spring.data.mongodb.uri=${MONGODB_URI}\nspring.data.mongodb.auto-index-creation=false\n'
    else:
        config+='spring.datasource.url=${DB_URL}\nspring.datasource.username=${DB_USER}\nspring.datasource.password=${DB_PASSWORD}\nspring.flyway.enabled=true\n'
        save(dest/'src/main/resources/db/migration/V1__platform_probe.sql','-- P00 platform-only migration. Domain migration starts in P01.\nCREATE TABLE platform_probe (probe_id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);\n')
    save(dest/'src/main/resources/application.properties',config)
    for test in ['SecurityConfigurationTests.java','JwksIntegrationTests.java']:
        content=(BACKEND/'platform/p00-template/src/test/java/vn/smarttravel/platform'/test).read_text(encoding='utf-8')
        save(dest/f'src/test/java/vn/smarttravel/{s}'/test,content.replace('package vn.smarttravel.platform;',f'package vn.smarttravel.{s};'))
    save(dest/'Dockerfile',f'''FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --chown=10001:10001 target/{s}-service-0.0.1-SNAPSHOT.jar /app/application.jar
USER 10001:10001
EXPOSE {8101+index}
ENTRYPOINT ["java", "-jar", "/app/application.jar"]
''')
    save(dest/'.dockerignore',f'**\n!Dockerfile\n!target/\n!target/{s}-service-0.0.1-SNAPSHOT.jar\n')
    save(dest/'README.md',f'''# {s.title()} — P00 skeleton

Owner: {"N1" if s in ['identity','catalog','ingestion'] else "N2"}; reviewer: người còn lại. Chưa có API/domain implementation.

Build từ root repo: `./backend/mvnw -f backend/services/pom.xml -pl {s}-service -am verify`.
Cách chạy DB riêng/JWKS/stub xem `backend/platform/README.md` và `backend/contracts/README.md`.
Audience `{s}`, cổng mặc định {8101+index}. Health không cần JWT; route khác cần JWT.
Không phụ thuộc runtime năm service khác. Không thêm JPA/AI/Redis nếu chưa có use case.
P00 migration probe không thay thế domain migration/collections/index của P01.
''')
print('Created six independent Java 21/Boot 3.5.13 service skeletons.')
