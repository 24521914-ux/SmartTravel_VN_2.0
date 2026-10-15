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
    @PostMapping("/api/v1/admin/media") Object upload(@AuthenticationPrincipal Jwt jwt,@RequestParam MultipartFile file)throws java.io.IOException{return service.upload(file.getBytes(),file.getContentType(),admin(jwt),false);}
    @PostMapping("/api/v1/admin/media/{id}/review") @ResponseStatus(HttpStatus.ACCEPTED) Object review(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Map<String,String> body){service.review(id,admin(jwt),"APPROVE".equals(body.get("action"))?"APPROVED":"REJECTED",body.get("reason"));return vn.smarttravel.catalog.shared.web.Representations.accepted(id,1);}
    @GetMapping("/api/v1/media/{id}") byte[] content(@PathVariable UUID id){return service.content(id);}
}
