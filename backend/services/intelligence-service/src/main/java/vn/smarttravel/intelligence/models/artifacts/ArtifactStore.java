package vn.smarttravel.intelligence.models.artifacts;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;
import java.nio.file.*;
import java.io.IOException;
import java.time.Instant;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Content addressed immutable local object-store adapter; keys never contain user input. */
@Component
public class ArtifactStore {
    private final Path root;
    public ArtifactStore(@Value("${intelligence.artifact-root:.local/intelligence-artifacts}") String path){root=Path.of(path).toAbsolutePath().normalize();}
    public String write(String content){
        String key=hash(content)+".json";
        try {
            Files.createDirectories(root);Path file=root.resolve(key);
            if(!Files.exists(file))try{Files.writeString(file,content,StandardOpenOption.CREATE_NEW);}catch(FileAlreadyExistsException ignored){}
            require(hash(Files.readString(file)).equals(hash(content)),"ARTIFACT_COLLISION");return key;
        }catch(IOException ex){throw new IllegalStateException("Artifact storage unavailable",ex);}
    }
    public String read(String key,String checksum){
        require(key.matches("[a-f0-9]{64}\\.json"),"INVALID_ARTIFACT_KEY");
        try {String content=Files.readString(root.resolve(key));require(hash(content).equals(checksum),"CHECKSUM_MISMATCH");return content;}
        catch(IOException ex){throw new IllegalStateException("Artifact unavailable",ex);}
    }
    public int cleanup(Set<String> referenced,Instant before){
        int removed=0;
        if(!Files.exists(root))return 0;
        try(var paths=Files.list(root)){
            for(Path p:paths.toList())if(p.getFileName().toString().matches("[a-f0-9]{64}\\.json")&&!referenced.contains(p.getFileName().toString())&&Files.getLastModifiedTime(p).toInstant().isBefore(before)){Files.delete(p);removed++;}
        }catch(IOException ex){throw new IllegalStateException("Artifact cleanup failed",ex);}return removed;
    }
}
