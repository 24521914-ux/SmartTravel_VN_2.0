package vn.smarttravel.catalog.media.service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import vn.smarttravel.catalog.media.repository.MediaRepository;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MediaContentTests {
    @TempDir Path root;
    @Test void contentRequiresPublicRepositoryPolicyAndPreservesMime() throws Exception {
        var repo=mock(MediaRepository.class); UUID id=UUID.randomUUID();
        Files.createDirectories(root.resolve("quarantine")); Files.write(root.resolve("quarantine/approved"),new byte[]{1,2,3,4});
        when(repo.get(id,true)).thenReturn(Map.of("object_key","quarantine/approved","mime_type","image/jpeg"));
        var result=new MediaService(repo,root.toString(),"http://127.0.0.1:1").publicContent(id);
        assertThat(result.mimeType()).isEqualTo("image/jpeg"); assertThat(result.bytes()).containsExactly(1,2,3,4);
        verify(repo).get(id,true); verify(repo,never()).get(id,false);
    }
    @Test void hiddenOrPrivateMediaIsNeverReadFromDisk() {
        var repo=mock(MediaRepository.class); UUID id=UUID.randomUUID();
        when(repo.get(id,true)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        assertThatThrownBy(()->new MediaService(repo,root.toString(),"http://127.0.0.1:1").publicContent(id)).isInstanceOf(ResponseStatusException.class);
        verify(repo,never()).get(id,false);
    }
    @Test void invalidMimeCannotCreateMediaAndInvalidReviewCannotCallScanner() {
        var repo=mock(MediaRepository.class); var service=new MediaService(repo,root.toString(),"http://127.0.0.1:1");
        assertThatThrownBy(()->service.upload(new byte[]{1,2,3,4},"image/png",UUID.randomUUID(),false)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->service.review(UUID.randomUUID(),UUID.randomUUID(),"APPROVED"," ")).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(repo);
    }
}
