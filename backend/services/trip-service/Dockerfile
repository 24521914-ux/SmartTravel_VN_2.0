FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --chown=10001:10001 target/trip-service-0.0.1-SNAPSHOT.jar /app/application.jar
USER 10001:10001
EXPOSE 8104
ENTRYPOINT ["java", "-jar", "/app/application.jar"]
