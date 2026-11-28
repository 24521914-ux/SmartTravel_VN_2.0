import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoDatabase;
import org.bson.Document;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * Lightweight Java 21 single-file probe for SmartTravel Ops Monitor.
 * Reads credentials strictly from environment variables (never prints them)
 * and outputs sanitized JSON metrics to stdout.
 *
 * Modes:
 *   java -cp <mongo-jars> DbStatsProbe.java mongo
 *   java -cp <pg-jar>     DbStatsProbe.java postgres
 */
public class DbStatsProbe {

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("Usage: DbStatsProbe <mongo|postgres>");
            System.exit(2);
        }
        String mode = args[0].trim().toLowerCase(Locale.ROOT);
        if ("mongo".equals(mode)) {
            System.out.println(probeMongo());
        } else if ("postgres".equals(mode)) {
            System.out.println(probePostgres());
        } else {
            System.err.println("Unknown mode: " + mode);
            System.exit(2);
        }
    }

    private static String probeMongo() {
        String uri = System.getenv("PROBE_MONGODB_URI");
        if (uri == null || uri.isBlank()) {
            return "{\"ok\":false,\"error\":\"PROBE_MONGODB_URI is empty\"}";
        }
        long t0 = System.nanoTime();
        ConnectionString cs = new ConnectionString(uri.trim());
        String dbName = cs.getDatabase() != null && !cs.getDatabase().isBlank() ? cs.getDatabase() : "community_db";
        MongoClientSettings settings = MongoClientSettings.builder()
            .applyConnectionString(cs)
            .applyToClusterSettings(b -> b.serverSelectionTimeout(10, TimeUnit.SECONDS))
            .applyToSocketSettings(b -> b.connectTimeout(8, TimeUnit.SECONDS).readTimeout(8, TimeUnit.SECONDS))
            .build();

        try (MongoClient client = MongoClients.create(settings)) {
            MongoDatabase db = client.getDatabase(dbName);
            Document stats = db.runCommand(new Document("dbStats", 1));
            Document hello = client.getDatabase("admin").runCommand(new Document("hello", 1));

            List<Map<String, Object>> topColls = new ArrayList<>();
            for (String colName : db.listCollectionNames()) {
                long est = db.getCollection(colName).estimatedDocumentCount();
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("name", colName);
                entry.put("docs", est);
                topColls.add(entry);
            }
            topColls.sort(Comparator.comparingLong((Map<String, Object> m) -> (Long) m.get("docs")).reversed());
            if (topColls.size() > 8) {
                topColls = topColls.subList(0, 8);
            }

            double dataMb = toDouble(stats.get("dataSize")) / (1024.0 * 1024.0);
            double storageMb = toDouble(stats.get("storageSize")) / (1024.0 * 1024.0);
            double indexMb = toDouble(stats.get("indexSize")) / (1024.0 * 1024.0);
            double totalMb = stats.containsKey("totalSize")
                ? toDouble(stats.get("totalSize")) / (1024.0 * 1024.0)
                : (storageMb + indexMb);

            long latencyMs = (System.nanoTime() - t0) / 1_000_000L;
            StringBuilder sb = new StringBuilder();
            sb.append("{");
            sb.append("\"ok\":true,");
            sb.append("\"database\":").append(q(dbName)).append(",");
            sb.append("\"replicaSet\":").append(q(str(hello.get("setName")))).append(",");
            sb.append("\"primary\":").append(q(str(hello.get("primary")))).append(",");
            sb.append("\"collections\":").append(toLong(stats.get("collections"))).append(",");
            sb.append("\"objects\":").append(toLong(stats.get("objects"))).append(",");
            sb.append("\"dataSizeMb\":").append(round2(dataMb)).append(",");
            sb.append("\"storageSizeMb\":").append(round2(storageMb)).append(",");
            sb.append("\"indexSizeMb\":").append(round2(indexMb)).append(",");
            sb.append("\"totalSizeMb\":").append(round2(totalMb)).append(",");
            sb.append("\"latencyMs\":").append(latencyMs).append(",");
            sb.append("\"topCollections\":[");
            for (int i = 0; i < topColls.size(); i++) {
                if (i > 0) sb.append(",");
                Map<String, Object> c = topColls.get(i);
                sb.append("{\"name\":").append(q(str(c.get("name")))).append(",\"docs\":").append(c.get("docs")).append("}");
            }
            sb.append("]}");
            return sb.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":" + q(e.getClass().getSimpleName() + ": " + safeErr(e.getMessage())) + "}";
        }
    }

    private static String probePostgres() throws Exception {
        String svcList = System.getenv("PROBE_PG_SERVICES");
        if (svcList == null || svcList.isBlank()) {
            return "{\"ok\":false,\"databases\":[],\"error\":\"PROBE_PG_SERVICES is empty\"}";
        }
        String[] services = svcList.split(",");
        ExecutorService pool = Executors.newFixedThreadPool(Math.min(5, services.length));
        List<Future<String>> futures = new ArrayList<>();
        for (String rawSvc : services) {
            final String svc = rawSvc.trim();
            if (svc.isEmpty()) continue;
            futures.add(pool.submit((Callable<String>) () -> probeOnePostgres(svc)));
        }
        pool.shutdown();
        StringBuilder sb = new StringBuilder();
        sb.append("{\"ok\":true,\"databases\":[");
        for (int i = 0; i < futures.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append(futures.get(i).get(25, TimeUnit.SECONDS));
        }
        sb.append("]}");
        return sb.toString();
    }

    private static String probeOnePostgres(String svc) {
        String key = svc.toUpperCase(Locale.ROOT);
        String rawUrl = System.getenv("PROBE_PG_URL_" + key);
        String user = System.getenv("PROBE_PG_USER_" + key);
        String pass = System.getenv("PROBE_PG_PASSWORD_" + key);
        if (rawUrl == null || rawUrl.isBlank() || user == null || pass == null) {
            return "{\"service\":" + q(svc) + ",\"ok\":false,\"error\":\"Missing URL or credentials\"}";
        }

        // Remove Linux container CA bundle path on Windows so JDK default truststore is used with TLS.
        String jdbcUrl = sanitizeJdbcUrlForHost(rawUrl.trim());
        long t0 = System.nanoTime();
        Properties props = new Properties();
        props.setProperty("user", user);
        props.setProperty("password", pass);
        props.setProperty("connectTimeout", "10");
        props.setProperty("socketTimeout", "10");
        props.setProperty("loginTimeout", "10");

        try (Connection conn = DriverManager.getConnection(jdbcUrl, props);
             Statement st = conn.createStatement()) {
            String dbName = svc + "_db";
            long sizeBytes = 0;
            String pgVer = "";
            try (ResultSet rs = st.executeQuery("SELECT current_database(), pg_database_size(current_database()), current_setting('server_version')")) {
                if (rs.next()) {
                    dbName = rs.getString(1);
                    sizeBytes = rs.getLong(2);
                    pgVer = rs.getString(3);
                }
            }
            long tables = 0;
            long rows = 0;
            try (ResultSet rs = st.executeQuery("SELECT count(*), coalesce(sum(n_live_tup), 0) FROM pg_stat_user_tables")) {
                if (rs.next()) {
                    tables = rs.getLong(1);
                    rows = rs.getLong(2);
                }
            }
            long conns = 0;
            try (ResultSet rs = st.executeQuery("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()")) {
                if (rs.next()) conns = rs.getLong(1);
            }
            String exts = "";
            try (ResultSet rs = st.executeQuery("SELECT coalesce(string_agg(extname, ','), '') FROM pg_extension WHERE extname IN ('postgis','vector','pg_trgm','uuid-ossp')")) {
                if (rs.next()) exts = rs.getString(1);
            }
            long latencyMs = (System.nanoTime() - t0) / 1_000_000L;
            double sizeMb = sizeBytes / (1024.0 * 1024.0);
            return "{"
                + "\"service\":" + q(svc) + ","
                + "\"ok\":true,"
                + "\"database\":" + q(dbName) + ","
                + "\"pgVersion\":" + q(pgVer) + ","
                + "\"sizeMb\":" + round2(sizeMb) + ","
                + "\"tables\":" + tables + ","
                + "\"liveRows\":" + rows + ","
                + "\"connections\":" + conns + ","
                + "\"extensions\":" + q(exts) + ","
                + "\"latencyMs\":" + latencyMs
                + "}";
        } catch (Exception e) {
            return "{\"service\":" + q(svc) + ",\"ok\":false,\"error\":" + q(e.getClass().getSimpleName() + ": " + safeErr(e.getMessage())) + "}";
        }
    }

    private static String sanitizeJdbcUrlForHost(String url) {
        if (!url.contains("sslrootcert=")) {
            return url;
        }
        int idx = url.indexOf('?');
        if (idx < 0) return url;
        String base = url.substring(0, idx);
        String query = url.substring(idx + 1);
        List<String> kept = new ArrayList<>();
        for (String part : query.split("&")) {
            if (part.startsWith("sslrootcert=")) {
                String certPath = part.substring("sslrootcert=".length());
                if (Files.exists(Path.of(certPath))) {
                    kept.add(part);
                } else {
                    // Use JVM default CA truststore with pgjdbc verify-full hostname check on Windows.
                    kept.add("sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory");
                }
            } else if (!part.isEmpty()) {
                kept.add(part);
            }
        }
        return kept.isEmpty() ? base : base + "?" + String.join("&", kept);
    }

    private static double toDouble(Object o) {
        return o instanceof Number n ? n.doubleValue() : 0.0;
    }

    private static long toLong(Object o) {
        return o instanceof Number n ? n.longValue() : 0L;
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }

    private static String round2(double v) {
        return String.format(Locale.ROOT, "%.2f", v);
    }

    private static String safeErr(String msg) {
        if (msg == null) return "";
        return msg.replaceAll("(?i)(password|secret|token)=[^&\\s]+", "$1=***")
            .replaceAll("([a-zA-Z0-9+.-]+://)([^:@/\\s]+):([^@/\\s]+)@", "$1***:***@");
    }

    private static String q(String s) {
        if (s == null) return "\"\"";
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        return out.append("\"").toString();
    }
}
