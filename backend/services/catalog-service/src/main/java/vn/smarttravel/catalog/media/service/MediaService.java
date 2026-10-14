package vn.smarttravel.catalog.media.service;
import java.util.*;
import java.nio.file.*;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import vn.smarttravel.catalog.media.repository.MediaRepository;
@Service
public class MediaService {
    private final MediaRepository repo;private final Path root;private final vn.smarttravel.catalog.shared.http.BoundedJsonClient scanner;
    public MediaService(MediaRepository repo,@Value("${catalog.media.root:.local/catalog-media}") String directory,@Value("${catalog.media.scanner-url:http://127.0.0.1:8199}") String scannerUrl){this.repo=repo;root=Path.of(directory).toAbsolutePath().normalize();scanner=new vn.smarttravel.catalog.shared.http.BoundedJsonClient(scannerUrl,"");}
    public Object upload(byte[] bytes,String mime,UUID actor,boolean evidence){
        if(bytes.length<4||bytes.length>10*1024*1024)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Media size must be 4 bytes..10 MB");
        boolean png=bytes.length>=8&&Arrays.equals(Arrays.copyOf(bytes,8),new byte[]{(byte)137,80,78,71,13,10,26,10});boolean jpeg=(bytes[0]&255)==255&&(bytes[1]&255)==216&&(bytes[2]&255)==255;
        if(!(png&&"image/png".equals(mime))&&!(jpeg&&"image/jpeg".equals(mime)))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"MIME signature mismatch");
        UUID id=UUID.randomUUID();String key=(evidence?"private/":"quarantine/")+actor+"/"+id;Path file=resolve(key);try{String checksum=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));Files.createDirectories(file.getParent());Files.write(file,bytes,StandardOpenOption.CREATE_NEW);try{return repo.create(id,key,checksum,mime,bytes.length,actor);}catch(RuntimeException failure){Files.deleteIfExists(file);throw failure;}}catch(java.io.IOException|java.security.NoSuchAlgorithmException failure){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Media storage unavailable");}
    }
    private Path resolve(String key){Path file=root.resolve(key).normalize();if(!file.startsWith(root))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid media key");return file;}
    public Object review(UUID id,UUID reviewer,String status,String reason){var media=repo.get(id,false);if("APPROVED".equals(status)){try{var response=scanner.request("POST","/scan",Map.of("object_key",media.get("object_key"),"checksum",media.get("checksum")));if(response==null||!Boolean.TRUE.equals(response.get("clean")))throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Media scan rejected");}catch(org.springframework.web.client.RestClientException failure){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Scanner unavailable");}}return repo.review(id,reviewer,status,reason);}
    public byte[] content(UUID id){var media=repo.get(id,true);try{return Files.readAllBytes(resolve(media.get("object_key").toString()));}catch(java.io.IOException error){throw new ResponseStatusException(HttpStatus.NOT_FOUND);}}
}
