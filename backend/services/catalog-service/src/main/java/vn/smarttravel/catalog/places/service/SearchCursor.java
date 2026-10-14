package vn.smarttravel.catalog.places.service;
import java.util.*;
import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Component
public class SearchCursor {
    private final byte[] key;
    public SearchCursor(@Value("${catalog.cursor-key:}") String configured){if(configured.isBlank()){key=new byte[32];new java.security.SecureRandom().nextBytes(key);}else key=configured.getBytes(StandardCharsets.UTF_8);}
    private String filters(Map<String,String> input){var sorted=new TreeMap<>(input);sorted.remove("cursor");sorted.remove("afterId");return sorted.toString();}
    private String sign(String data){try{Mac hmac=Mac.getInstance("HmacSHA256");hmac.init(new SecretKeySpec(key,"HmacSHA256"));return Base64.getUrlEncoder().withoutPadding().encodeToString(hmac.doFinal(data.getBytes(StandardCharsets.UTF_8)));}catch(Exception error){throw new IllegalStateException(error);}}
    public String encode(UUID after,Map<String,String> filters){String data=after+"\n"+sign(filters(filters));return Base64.getUrlEncoder().withoutPadding().encodeToString(data.getBytes(StandardCharsets.UTF_8))+"."+sign(data);}
    public UUID decode(String token,Map<String,String> filters){try{String[] parts=token.split("\\.");if(parts.length!=2||token.length()>1024)throw new IllegalArgumentException();String data=new String(Base64.getUrlDecoder().decode(parts[0]),StandardCharsets.UTF_8);if(!java.security.MessageDigest.isEqual(sign(data).getBytes(StandardCharsets.UTF_8),parts[1].getBytes(StandardCharsets.UTF_8)))throw new IllegalArgumentException();String[] content=data.split("\n");if(content.length!=2||!content[1].equals(sign(filters(filters))))throw new IllegalArgumentException();return UUID.fromString(content[0]);}catch(IllegalArgumentException error){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid cursor for these filters");}}
}
