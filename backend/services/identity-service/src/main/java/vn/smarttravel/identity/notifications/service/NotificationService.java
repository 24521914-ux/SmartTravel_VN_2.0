package vn.smarttravel.identity.notifications.service;

import java.time.Instant;
import java.util.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.notifications.repository.NotificationRepository;
import vn.smarttravel.identity.security.service.CurrentUser;
import vn.smarttravel.identity.infrastructure.persistence.service.IdentityMutations;
import vn.smarttravel.identity.infrastructure.mail.service.AccountMail;
import vn.smarttravel.identity.shared.exception.IdentityException;
import vn.smarttravel.identity.shared.web.CursorPages;

@Service
public class NotificationService {
    private final NotificationRepository repository;
    private final CurrentUser current;
    private final IdentityMutations mutations;
    private final AccountMail secrets;
    private final CursorPages pages;
    private final TransactionTemplate tx;
    public NotificationService(NotificationRepository repository, CurrentUser current, IdentityMutations mutations,
                               AccountMail secrets, CursorPages pages, TransactionTemplate tx) {
        this.repository=repository; this.current=current; this.mutations=mutations;
        this.secrets=secrets; this.pages=pages; this.tx=tx;
    }
    public Map<String,Object> list(Jwt jwt, String cursor, int limit) {
        return tx.execute(status -> {
            UUID user=current.requireUser(jwt); String scope="notifications:"+user;
            var position=pages.decode(cursor,scope,limit);
            return pages.page(repository.list(user,(UUID)position.get("id"),(Instant)position.get("as_of"),limit),
                    "notification_id",scope,limit,position);
        });
    }
    public Map<String,Object> read(Jwt jwt, UUID id, String key) {
        return tx.execute(status -> {
            UUID user=current.requireUser(jwt);
            String hash=secrets.digest("notification-read:"+id);
            var replay=mutations.idempotent("notification-read",user.toString(),key,hash);
            if(replay!=null) return replay;
            if(repository.lock(user,id)==null) throw new IdentityException(404,"NOT_FOUND");
            var result=repository.read(user,id);
            mutations.audit(user,user,"NOTIFICATION_READ");
            mutations.remember("notification-read",user.toString(),key,hash,result,200);
            return result;
        });
    }
}
