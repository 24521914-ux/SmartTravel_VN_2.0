package vn.smarttravel.catalog.media.service;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;
import vn.smarttravel.catalog.media.repository.MediaRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CloudinaryMediaTests {
    private static final byte[] MINIMAL_PNG = new byte[]{(byte) 137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13};

    @TempDir
    Path tempDir;

    @Test
    void uploadsSignedImageToCloudinaryStoresSecureUrlAndStreamsPublicCdnContent() throws Exception {
        var repo = mock(MediaRepository.class);
        UUID actor = UUID.randomUUID();
        var capturedMultipart = new AtomicReference<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            server.setExecutor(executor);
            String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
            String cdnUrl = baseUrl + "/cdn/smarttravel/places/demo.png";

            server.createContext("/v1_1/demo-cloud/image/upload", exchange -> {
                try {
                    String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.ISO_8859_1);
                    capturedMultipart.set(body);
                    byte[] json = ("{\"secure_url\":\"" + cdnUrl + "\",\"public_id\":\"smarttravel/quarantine/"
                            + actor + "/id\"}").getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, json.length);
                    exchange.getResponseBody().write(json);
                } catch (IOException ignored) {
                } finally {
                    exchange.close();
                }
            });

            server.createContext("/cdn/smarttravel/places/demo.png", exchange -> {
                try {
                    exchange.getResponseHeaders().add("Content-Type", "image/png");
                    exchange.sendResponseHeaders(200, MINIMAL_PNG.length);
                    exchange.getResponseBody().write(MINIMAL_PNG);
                } catch (IOException ignored) {
                } finally {
                    exchange.close();
                }
            });

            server.start();
            var service = new MediaService(
                    repo, tempDir.toString(), "http://127.0.0.1:1",
                    "cloudinary", "demo-cloud", "demo-key", "super-secret-value",
                    "smarttravel", baseUrl);

            when(repo.create(any(), eq(cdnUrl), any(), eq("image/png"), eq((long) MINIMAL_PNG.length), eq(actor)))
                    .thenAnswer(inv -> Map.<String, Object>of(
                            "media_id", inv.getArgument(0),
                            "object_key", cdnUrl,
                            "mime_type", "image/png",
                            "moderation_status", "PENDING"));

            @SuppressWarnings("unchecked")
            Map<String, Object> created = (Map<String, Object>) service.upload(MINIMAL_PNG, "image/png", actor, false);
            assertThat(created.get("object_key")).isEqualTo(cdnUrl);

            String sent = capturedMultipart.get();
            assertThat(sent).contains("name=\"api_key\"\r\n\r\ndemo-key");
            assertThat(sent).contains("name=\"folder\"\r\n\r\nsmarttravel/quarantine/" + actor);
            assertThat(sent).contains("name=\"type\"\r\n\r\nupload");
            assertThat(sent).doesNotContain("super-secret-value");

            String folderVal = extractField(sent, "folder");
            String publicIdVal = extractField(sent, "public_id");
            String timestampVal = extractField(sent, "timestamp");
            String typeVal = extractField(sent, "type");
            String signatureVal = extractField(sent, "signature");
            String payload = "folder=" + folderVal + "&public_id=" + publicIdVal + "&timestamp=" + timestampVal
                    + "&type=" + typeVal + "super-secret-value";
            String expectedSig = HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-1").digest(payload.getBytes(StandardCharsets.UTF_8)));
            assertThat(signatureVal).isEqualTo(expectedSig);

            UUID mediaId = (UUID) created.get("media_id");
            when(repo.get(mediaId, true)).thenReturn(Map.of("object_key", cdnUrl, "mime_type", "image/png"));
            var fetched = service.publicContent(mediaId);
            assertThat(fetched.mimeType()).isEqualTo("image/png");
            assertThat(fetched.bytes()).isEqualTo(MINIMAL_PNG);
            verify(repo, never()).get(mediaId, false);
        } finally {
            server.stop(0);
        }
    }

    @Test
    void missingCloudinaryCredentialsFailsClosedWithoutTouchingRepository() {
        var repo = mock(MediaRepository.class);
        var service = new MediaService(
                repo, tempDir.toString(), "http://127.0.0.1:1",
                "cloudinary", "", "", "", "smarttravel", "https://api.cloudinary.com");
        assertThatThrownBy(() -> service.upload(MINIMAL_PNG, "image/png", UUID.randomUUID(), false))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("503");
        verify(repo, never()).create(any(), any(), any(), any(), anyLong(), any());
        verifyNoInteractions(repo);
    }

    private static String extractField(String multipart, String fieldName) {
        String marker = "name=\"" + fieldName + "\"\r\n\r\n";
        int start = multipart.indexOf(marker);
        assertThat(start).isGreaterThanOrEqualTo(0);
        start += marker.length();
        int end = multipart.indexOf("\r\n", start);
        return multipart.substring(start, end);
    }
}
