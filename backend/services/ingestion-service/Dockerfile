# Default target "runtime" packages a jar already built and verified in target/
# (CI, P03 gates, build_service_image.py). Target "source" compiles inside Docker
# and needs the named context "backend" (docker compose additional_contexts, or
# docker build --build-context backend=backend --target source ...).
FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
COPY --from=backend mvnw ./
COPY --from=backend .mvn .mvn
COPY --from=backend contracts contracts
COPY --from=backend services services
RUN --mount=type=cache,target=/root/.m2 \
    sh mvnw -B -q -f services/pom.xml -pl ingestion-service -am -Dmaven.test.skip=true package

FROM eclipse-temurin:21-jre AS base
WORKDIR /app
USER 10001:10001
EXPOSE 8105
ENTRYPOINT ["java", "-jar", "/app/application.jar"]

FROM base AS source
COPY --from=build --chown=10001:10001 /workspace/services/ingestion-service/target/ingestion-service-0.0.1-SNAPSHOT.jar /app/application.jar

FROM base AS runtime
COPY --chown=10001:10001 target/ingestion-service-0.0.1-SNAPSHOT.jar /app/application.jar
