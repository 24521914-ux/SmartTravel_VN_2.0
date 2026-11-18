package vn.smarttravel.catalog.media.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;
import vn.smarttravel.catalog.media.repository.MediaRepository;
import vn.smarttravel.catalog.shared.http.BoundedJsonClient;
import vn.smarttravel.catalog.shared.http.LimitedBodyHandler;

/** Manages quarantine upload, malware scan review, and filesystem or Cloudinary delivery. */
@Service
public class MediaService {
    private static final int MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024;
    private static final int MAX_API_JSON_BYTES = 1_000_000;

    private final MediaRepository repo;
    private final Path root;
    private final BoundedJsonClient scanner;
    private final boolean useCloudinary;
    private final String cloudName;
    private final String apiKey;
    private final String apiSecret;
    private final String cloudinaryFolder;
    private final String cloudinaryApiBase;
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient cloudinaryHttp = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    private final HttpClient cdnHttp = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    public MediaService(MediaRepository repo, String directory, String scannerUrl) {
        this(repo, directory, scannerUrl, "filesystem", "", "", "", "smarttravel", "https://api.cloudinary.com");
    }

    @Autowired
    public MediaService(
            MediaRepository repo,
            @Value("${catalog.media.root:.local/catalog-media}") String directory,
            @Value("${catalog.media.scanner-url:http://127.0.0.1:8199}") String scannerUrl,
            @Value("${catalog.media.provider:filesystem}") String provider,
            @Value("${catalog.media.cloudinary.cloud-name:}") String cloudName,
            @Value("${catalog.media.cloudinary.api-key:}") String apiKey,
            @Value("${catalog.media.cloudinary.api-secret:}") String apiSecret,
            @Value("${catalog.media.cloudinary.folder:smarttravel}") String cloudinaryFolder,
            @Value("${catalog.media.cloudinary.api-base-url:https://api.cloudinary.com}") String cloudinaryApiBase) {
        this.repo = repo;
        this.root = Path.of(directory).toAbsolutePath().normalize();
        this.scanner = new BoundedJsonClient(scannerUrl, "");
        this.useCloudinary = "cloudinary".equalsIgnoreCase(provider == null ? "" : provider.trim());
        this.cloudName = cloudName == null ? "" : cloudName.trim();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.apiSecret = apiSecret == null ? "" : apiSecret.trim();
        String normalizedFolder = cloudinaryFolder == null ? "" : cloudinaryFolder.trim().replaceAll("^/+|/+$", "");
        this.cloudinaryFolder = normalizedFolder.isEmpty() ? "smarttravel" : normalizedFolder;
        this.cloudinaryApiBase = (cloudinaryApiBase == null || cloudinaryApiBase.isBlank()
                ? "https://api.cloudinary.com" : cloudinaryApiBase.trim()).replaceAll("/+$", "");
    }

    public Object upload(byte[] bytes, String mime, UUID actor, boolean evidence) {
        if (bytes.length < 4 || bytes.length > 10 * 1024 * 1024) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Media size must be 4 bytes..10 MB");
        }
        boolean png = bytes.length >= 8 && Arrays.equals(
                Arrays.copyOf(bytes, 8), new byte[]{(byte) 137, 80, 78, 71, 13, 10, 26, 10});
        boolean jpeg = (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255;
        if (!(png && "image/png".equals(mime)) && !(jpeg && "image/jpeg".equals(mime))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "MIME signature mismatch");
        }

        UUID id = UUID.randomUUID();
        String checksum = sha256Hex(bytes);

        if (useCloudinary) {
            ensureCloudinaryConfigured();
            String folder = cloudinaryFolder + (evidence ? "/private/" : "/quarantine/") + actor;
            String publicId = id.toString();
            String type = evidence ? "authenticated" : "upload";
            String ext = png ? "png" : "jpg";
            String secureUrl = uploadToCloudinary(bytes, mime, ext, folder, publicId, type);
            String key = evidence ? "private/" + actor + "/" + id : secureUrl;
            try {
                return repo.create(id, key, checksum, mime, bytes.length, actor);
            } catch (RuntimeException failure) {
                destroyCloudinaryQuietly(folder + "/" + publicId, type);
                throw failure;
            }
        }

        String key = (evidence ? "private/" : "quarantine/") + actor + "/" + id;
        Path file = resolve(key);
        try {
            Files.createDirectories(file.getParent());
            Files.write(file, bytes, StandardOpenOption.CREATE_NEW);
            try {
                return repo.create(id, key, checksum, mime, bytes.length, actor);
            } catch (RuntimeException failure) {
                Files.deleteIfExists(file);
                throw failure;
            }
        } catch (IOException failure) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Media storage unavailable");
        }
    }

    private void ensureCloudinaryConfigured() {
        if (cloudName.isBlank() || apiKey.isBlank() || apiSecret.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Cloudinary configuration incomplete");
        }
    }

    private String uploadToCloudinary(
            byte[] bytes, String mime, String ext, String folder, String publicId, String type) {
        try {
            long timestamp = Instant.now().getEpochSecond();
            var signedParams = new TreeMap<String, String>();
            signedParams.put("folder", folder);
            signedParams.put("public_id", publicId);
            signedParams.put("timestamp", String.valueOf(timestamp));
            signedParams.put("type", type);
            String signature = signCloudinaryParams(signedParams);

            var fields = new TreeMap<String, String>(signedParams);
            fields.put("api_key", apiKey);
            fields.put("signature", signature);

            String boundary = "----SmartTravelCloudinary" + UUID.randomUUID().toString().replace("-", "");
            byte[] multipart = buildMultipartBody(boundary, fields, "upload." + ext, mime, bytes);

            HttpRequest req = HttpRequest.newBuilder(URI.create(cloudinaryApiBase + "/v1_1/" + cloudName + "/image/upload"))
                    .timeout(Duration.ofSeconds(15))
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(multipart))
                    .build();
            HttpResponse<byte[]> resp = cloudinaryHttp.send(req, new LimitedBodyHandler(MAX_API_JSON_BYTES, Duration.ofSeconds(15)));
            if (resp.statusCode() != 200) {
                throw new IllegalStateException("Unexpected Cloudinary status " + resp.statusCode());
            }
            Map<String, Object> parsed = json.readValue(resp.body(), new TypeReference<>() {});
            Object rawUrl = parsed.get("secure_url");
            if (!(rawUrl instanceof String url) || !(url.startsWith("https://") || url.startsWith("http://"))) {
                throw new IllegalStateException("Missing Cloudinary secure_url");
            }
            return url;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Media storage unavailable");
        } catch (Exception error) {
            LoggerFactory.getLogger(MediaService.class)
                    .warn("Cloudinary upload failed ({})", error.getClass().getSimpleName());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Media storage unavailable");
        }
    }

    private void destroyCloudinaryQuietly(String fullPublicId, String type) {
        try {
            long timestamp = Instant.now().getEpochSecond();
            var signedParams = new TreeMap<String, String>();
            signedParams.put("public_id", fullPublicId);
            signedParams.put("timestamp", String.valueOf(timestamp));
            signedParams.put("type", type);
            String signature = signCloudinaryParams(signedParams);

            var fields = new TreeMap<String, String>(signedParams);
            fields.put("api_key", apiKey);
            fields.put("signature", signature);

            String boundary = "----SmartTravelCloudinaryCleanup" + UUID.randomUUID().toString().replace("-", "");
            byte[] multipart = buildMultipartBody(boundary, fields, null, null, null);
            HttpRequest req = HttpRequest.newBuilder(URI.create(cloudinaryApiBase + "/v1_1/" + cloudName + "/image/destroy"))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(multipart))
                    .build();
            cloudinaryHttp.send(req, new LimitedBodyHandler(MAX_API_JSON_BYTES, Duration.ofSeconds(5)));
        } catch (Exception ignored) {
            // Best-effort orphan cleanup; never mask the originating database failure.
        }
    }

    private String signCloudinaryParams(Map<String, String> sortedParams) {
        String joined = sortedParams.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("&"));
        return digestHex("SHA-1", (joined + apiSecret).getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] buildMultipartBody(
            String boundary, Map<String, String> fields, String filename, String mime, byte[] fileBytes)
            throws IOException {
        var out = new ByteArrayOutputStream();
        for (var entry : fields.entrySet()) {
            out.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
            out.write(("Content-Disposition: form-data; name=\"" + entry.getKey() + "\"\r\n\r\n")
                    .getBytes(StandardCharsets.UTF_8));
            out.write(entry.getValue().getBytes(StandardCharsets.UTF_8));
            out.write("\r\n".getBytes(StandardCharsets.UTF_8));
        }
        if (fileBytes != null && filename != null && mime != null) {
            out.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
            out.write(("Content-Disposition: form-data; name=\"file\"; filename=\"" + filename + "\"\r\n")
                    .getBytes(StandardCharsets.UTF_8));
            out.write(("Content-Type: " + mime + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            out.write(fileBytes);
            out.write("\r\n".getBytes(StandardCharsets.UTF_8));
        }
        out.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return out.toByteArray();
    }

    private static String sha256Hex(byte[] bytes) {
        return digestHex("SHA-256", bytes);
    }

    private static String digestHex(String algorithm, byte[] input) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance(algorithm).digest(input));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("Missing digest algorithm " + algorithm, error);
        }
    }

    private Path resolve(String key) {
        Path file = root.resolve(key).normalize();
        if (!file.startsWith(root)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid media key");
        }
        return file;
    }

    public Object review(UUID id, UUID reviewer, String status, String reason) {
        if (!Set.of("APPROVED", "REJECTED").contains(status) || reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Decision and reason required");
        }
        var media = repo.get(id, false);
        if ("APPROVED".equals(status)) {
            try {
                var response = scanner.request(
                        "POST", "/scan", Map.of("object_key", media.get("object_key"), "checksum", media.get("checksum")));
                if (response == null || !Boolean.TRUE.equals(response.get("clean"))) {
                    throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Media scan rejected");
                }
            } catch (RestClientException failure) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Scanner unavailable");
            }
        }
        return repo.review(id, reviewer, status, reason);
    }

    public record PublicContent(byte[] bytes, String mimeType) {}

    public Map<String, Object> metadata(UUID id) {
        return repo.get(id, false);
    }

    public PublicContent publicContent(UUID id) {
        var media = repo.get(id, true);
        String key = media.get("object_key").toString();
        String mime = media.get("mime_type").toString();
        if (key.startsWith("https://") || key.startsWith("http://")) {
            return new PublicContent(fetchRemoteBytes(key), mime);
        }
        try {
            return new PublicContent(Files.readAllBytes(resolve(key)), mime);
        } catch (IOException error) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
    }

    private byte[] fetchRemoteBytes(String remoteUrl) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(remoteUrl))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();
            HttpResponse<byte[]> resp = cdnHttp.send(
                    req, new LimitedBodyHandler(MAX_REMOTE_IMAGE_BYTES, Duration.ofSeconds(10)));
            if (resp.statusCode() != 200) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND);
            }
            return resp.body();
        } catch (ResponseStatusException rse) {
            throw rse;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Media CDN unavailable");
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
    }

    public byte[] content(UUID id) {
        return publicContent(id).bytes();
    }
}
