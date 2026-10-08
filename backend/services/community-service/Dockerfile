FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --chown=10001:10001 target/community-service-0.0.1-SNAPSHOT.jar /app/application.jar
USER 10001:10001
EXPOSE 8103
ENTRYPOINT ["java", "-jar", "/app/application.jar"]
