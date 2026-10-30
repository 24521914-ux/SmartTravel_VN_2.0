package vn.smarttravel.catalog.media.controller;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import vn.smarttravel.catalog.media.service.MediaService;
@RestController
public class MediaController {
    private final MediaService service;public MediaController(MediaService service){this.service=service;}
    private UUID admin(Jwt jwt){var roles=jwt.getClaimAsStringList("roles");if(roles==null||!roles.contains("ADMIN"))throw new ResponseStatusException(HttpStatus.FORBIDDEN);return UUID.fromString(jwt.getSubject());}
    @PostMapping(value="/api/v1/media",consumes="multipart/form-data") @ResponseStatus(HttpStatus.CREATED) Object userUpload(@AuthenticationPrincipal Jwt jwt,@RequestParam("file") MultipartFile file)throws java.io.IOException{return service.upload(file.getBytes(),file.getContentType(),UUID.fromString(jwt.getSubject()),false);}
    @PostMapping(value="/api/v1/admin/media",consumes="multipart/form-data") @ResponseStatus(HttpStatus.CREATED) Object upload(@AuthenticationPrincipal Jwt jwt,@RequestParam("file") MultipartFile file)throws java.io.IOException{UUID actor=admin(jwt);return service.upload(file.getBytes(),file.getContentType(),actor,false);}
    @PostMapping("/api/v1/admin/media/{id}/review") @ResponseStatus(HttpStatus.ACCEPTED) Object review(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Map<String,String> body){String action=body.get("action");if(!Set.of("APPROVE","REJECT","REVOKE").contains(action==null?"":action))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid media action");service.review(id,admin(jwt),"APPROVE".equals(action)?"APPROVED":"REJECTED",body.get("reason"));return vn.smarttravel.catalog.shared.web.Representations.accepted(id,1);}
    @GetMapping("/api/v1/admin/media/{id}") Object metadata(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){admin(jwt);return service.metadata(id);}
    @GetMapping("/api/v1/media/{id}") org.springframework.http.ResponseEntity<byte[]> content(@PathVariable UUID id){var media=service.publicContent(id);return org.springframework.http.ResponseEntity.ok().contentType(org.springframework.http.MediaType.parseMediaType(media.mimeType())).header("X-Content-Type-Options","nosniff").cacheControl(org.springframework.http.CacheControl.noStore()).body(media.bytes());}
}
