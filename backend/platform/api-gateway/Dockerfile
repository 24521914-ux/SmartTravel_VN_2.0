# Default target "runtime" packages a jar already built and verified in target/
# (CI, P03 gates, p02.py build). Target "source" compiles inside Docker and needs
# the named context "backend" for the Maven Wrapper (docker compose
# additional_contexts, or docker build --build-context backend=backend --target source ...).
FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
COPY --from=backend mvnw ./
COPY --from=backend .mvn .mvn
COPY pom.xml ./
COPY src src
RUN --mount=type=cache,target=/root/.m2 \
    sh mvnw -B -q -Dmaven.test.skip=true package

FROM eclipse-temurin:21-jre-alpine AS base
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
USER app
EXPOSE 8080
ENTRYPOINT ["java","-XX:MaxRAMPercentage=75","-jar","/app/app.jar"]

FROM base AS source
COPY --from=build /workspace/target/api-gateway-0.0.1-SNAPSHOT.jar /app/app.jar

FROM base AS runtime
COPY target/api-gateway-0.0.1-SNAPSHOT.jar /app/app.jar
