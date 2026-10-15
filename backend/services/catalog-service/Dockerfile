FROM eclipse-temurin:21-jre
WORKDIR /app
RUN mkdir -p /app/.local && chown 10001:10001 /app/.local
COPY --chown=10001:10001 target/catalog-service-0.0.1-SNAPSHOT.jar /app/application.jar
USER 10001:10001
EXPOSE 8102
ENTRYPOINT ["java", "-jar", "/app/application.jar"]
