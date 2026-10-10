package vn.smarttravel.identity.infrastructure.mail.service;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.infrastructure.mail.repository.AccountMailRepository;
import vn.smarttravel.identity.security.service.IssuerKeys;
import vn.smarttravel.identity.security.support.Tokens;

/** Raw account tokens are encrypted, never logged or stored as plaintext in a mail queue. */
@Service
public class AccountMail {
    private final AccountMailRepository repository;
    private final TransactionTemplate tx;
    private final JavaMailSender sender;
    private final SecretKeySpec key;
    private final String from;

    public AccountMail(AccountMailRepository repository, TransactionTemplate tx, JavaMailSender sender, Environment env,
                       @Value("${identity.mail.encryption-key:}") String encoded,
                       @Value("${identity.mail.from}") String from) {
        this.repository = repository; this.tx = tx; this.sender = sender; this.from = from;
        boolean local = IssuerKeys.local(env);
        try {
            byte[] bytes;
            if (encoded.isBlank()) {
                if (!local) throw new IllegalStateException();
                bytes = new byte[32]; new SecureRandom().nextBytes(bytes);
            } else bytes = Base64.getDecoder().decode(encoded);
            if (bytes.length != 32) throw new IllegalStateException();
            key = new SecretKeySpec(bytes, "AES");
        } catch (Exception e) { throw new IllegalStateException("A 32-byte mail encryption key is required"); }
    }

    public String digest(String request) {
        try {
            var mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getEncoded(), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(request.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException("Cannot hash request"); }
    }

    public void enqueue(UUID user, String purpose, String token) { repository.enqueue(user, encrypt(purpose + "\n" + token)); }

    private String encrypt(String text) {
        try {
            byte[] nonce = new byte[12]; new SecureRandom().nextBytes(nonce);
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, nonce));
            byte[] ciphertext = cipher.doFinal(text.getBytes(StandardCharsets.UTF_8));
            byte[] all = new byte[nonce.length + ciphertext.length];
            System.arraycopy(nonce, 0, all, 0, nonce.length); System.arraycopy(ciphertext, 0, all, nonce.length, ciphertext.length);
            return Base64.getEncoder().encodeToString(all);
        } catch (Exception e) { throw new IllegalStateException("Cannot encrypt account mail"); }
    }

    private String decrypt(String text) throws Exception {
        byte[] all = Base64.getDecoder().decode(text);
        var cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, all, 0, 12));
        return new String(cipher.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
    }

    @Scheduled(fixedDelayString = "${identity.mail.poll-ms:5000}")
    public void deliver() {
        tx.executeWithoutResult(status -> {
            for (var job : repository.lockPendingJobs()) {
                UUID jobId = (UUID) job.get("job_id");
                if (!java.util.Set.of("PENDING", "ACTIVE").contains(job.get("status"))) {
                    repository.fail(jobId);
                    continue;
                }
                try {
                    String text = decrypt((String) job.get("encrypted_message"));
                    String[] parts = text.split("\n", -1);
                    boolean valid = parts.length == 2 && repository.validToken((UUID) job.get("user_id"), parts[0], Tokens.hash(parts[1]));
                    if (!valid) {
                        repository.fail(jobId);
                        continue;
                    }
                    var message = new SimpleMailMessage();
                    message.setFrom(from); message.setTo((String) job.get("email"));
                    message.setSubject(parts[0].equals("RESET_PASSWORD") ? "SmartTravel password reset" : "SmartTravel account verification");
                    message.setText(text);
                    sender.send(message);
                    repository.sent(jobId);
                } catch (Exception e) {
                    // Provider errors can include address or credentials; do not log exception bodies.
                    repository.retry(jobId);
                }
            }
        });
    }
}
