package vn.smarttravel.identity.shared.web;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Component;
import vn.smarttravel.identity.infrastructure.mail.service.AccountMail;
import vn.smarttravel.identity.shared.exception.IdentityException;

/** Signed keyset cursor is bound to operation/owner, limit and a stable creation cutoff. */
@Component
public class CursorPages {
    private final AccountMail secrets;
    public CursorPages(AccountMail secrets) { this.secrets=secrets; }
    public Map<String,Object> decode(String cursor, String scope, int limit) {
        if(limit<1 || limit>100) throw new IdentityException(400,"INVALID_LIMIT");
        if(cursor==null) return new HashMap<>(Map.of("id",new UUID(0,0),"as_of",Instant.now()));
        try {
            if(cursor.length()>1024) throw new IllegalArgumentException();
            String raw=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8);
            String[] p=raw.split("\\|",-1);
            String body=String.join("|",Arrays.copyOf(p,4));
            if(p.length!=5 || !p[0].equals(scope) || Integer.parseInt(p[1])!=limit ||
                    !MessageDigest.isEqual(p[4].getBytes(StandardCharsets.UTF_8),secrets.digest("cursor:"+body).getBytes(StandardCharsets.UTF_8))) throw new IllegalArgumentException();
            Instant cutoff=Instant.parse(p[2]);
            if(cutoff.isAfter(Instant.now().plusSeconds(1)) || cutoff.isBefore(Instant.now().minusSeconds(86400))) throw new IllegalArgumentException();
            return new HashMap<>(Map.of("id",UUID.fromString(p[3]),"as_of",cutoff));
        } catch(Exception e) { throw new IdentityException(400,"INVALID_CURSOR"); }
    }
    public Map<String,Object> page(List<Map<String,Object>> rows, String idField, String scope, int limit, Map<String,Object> position) {
        var items=new ArrayList<>(rows); String next=null;
        if(items.size()>limit) {
            items.removeLast();
            String raw=scope+"|"+limit+"|"+position.get("as_of")+"|"+items.getLast().get(idField);
            next=Base64.getUrlEncoder().withoutPadding().encodeToString((raw+"|"+secrets.digest("cursor:"+raw)).getBytes(StandardCharsets.UTF_8));
        }
        var result=new LinkedHashMap<String,Object>(); result.put("items",items); result.put("next_cursor",next);
        result.put("as_of",position.get("as_of").toString()); result.put("watermark",1L);
        return result;
    }
}
