FROM eclipse-temurin:21-jre
WORKDIR /app
RUN mkdir -p /app/artifacts && chown 10001:10001 /app/artifacts
ENV INTELLIGENCE_ARTIFACT_ROOT=/app/artifacts
COPY --chown=10001:10001 target/intelligence-service-0.0.1-SNAPSHOT.jar /app/application.jar
USER 10001:10001
EXPOSE 8106
ENTRYPOINT ["java", "-jar", "/app/application.jar"]
