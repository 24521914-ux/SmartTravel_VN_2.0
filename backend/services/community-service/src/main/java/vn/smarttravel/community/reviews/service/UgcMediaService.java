package vn.smarttravel.community.reviews.service;
import java.util.*;
import java.nio.file.*;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import vn.smarttravel.community.reviews.repository.ReviewMediaRepository;
@Service
public class UgcMediaService {
    private final ReviewMediaRepository repository;private final Path root;private final vn.smarttravel.community.shared.http.BoundedJsonClient scanner;
    public UgcMediaService(ReviewMediaRepository repository,@Value("${community.media.root:.local/community-media}")String directory,@Value("${community.media.scanner-url:http://127.0.0.1:8199}")String scannerUrl){this.repository=repository;root=Path.of(directory).toAbsolutePath().normalize();scanner=new vn.smarttravel.community.shared.http.BoundedJsonClient(scannerUrl,"");}
    public String stage(String review,String owner,byte[] bytes,String mime){boolean png=bytes.length>=8&&Arrays.equals(Arrays.copyOf(bytes,8),new byte[]{(byte)137,80,78,71,13,10,26,10});boolean jpeg=bytes.length>=4&&(bytes[0]&255)==255&&(bytes[1]&255)==216&&(bytes[2]&255)==255;if(bytes.length>10*1024*1024||!(png&&"image/png".equals(mime)||jpeg&&"image/jpeg".equals(mime)))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid media MIME/size");String key="quarantine/"+UUID.fromString(owner)+"/"+UUID.randomUUID();Path file=root.resolve(key).normalize();try{String checksum=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));Files.createDirectories(file.getParent());Files.write(file,bytes,StandardOpenOption.CREATE_NEW);try{repository.stage(review,owner,key,checksum,mime,bytes.length);}catch(RuntimeException e){Files.deleteIfExists(file);throw e;}return key;}catch(java.io.IOException|java.security.NoSuchAlgorithmException e){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Media storage unavailable");}}
    public void scan(String owner,String key){var row=repository.get(owner,key);try{var result=scanner.request("POST","/scan",Map.of("object_key",key,"checksum",row.get("checksum")));boolean approved=result!=null&&Boolean.TRUE.equals(result.get("clean"));repository.decision(owner,key,approved);if(!approved)throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Media scan rejected");}catch(org.springframework.web.client.RestClientException e){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Scanner unavailable");}}
    public byte[] approved(String owner,String key){var row=repository.get(owner,key);if(!"APPROVED".equals(row.get("status")))throw new ResponseStatusException(HttpStatus.NOT_FOUND);Path file=root.resolve(key).normalize();if(!file.startsWith(root))throw new ResponseStatusException(HttpStatus.NOT_FOUND);try{return Files.readAllBytes(file);}catch(java.io.IOException e){throw new ResponseStatusException(HttpStatus.NOT_FOUND);}}
}
