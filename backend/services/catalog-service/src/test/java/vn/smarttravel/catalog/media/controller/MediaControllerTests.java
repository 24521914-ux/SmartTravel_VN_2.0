package vn.smarttravel.catalog.media.controller;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import vn.smarttravel.catalog.media.service.MediaService;
import vn.smarttravel.catalog.security.config.SecurityConfiguration;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(MediaController.class)
@Import(SecurityConfiguration.class)
class MediaControllerTests {
    @Autowired MockMvc mvc;
    @MockitoBean MediaService service;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean vn.smarttravel.catalog.infrastructure.events.service.EventService events;

    @Test void approvedPublicImageIsAnonymousAndKeepsMime() throws Exception {
        UUID id=UUID.randomUUID(); byte[] bytes={1,2,3,4};
        when(service.publicContent(id)).thenReturn(new MediaService.PublicContent(bytes,"image/png"));
        mvc.perform(get("/api/v1/media/"+id)).andExpect(status().isOk())
            .andExpect(content().contentType("image/png")).andExpect(content().bytes(bytes))
            .andExpect(header().string("X-Content-Type-Options","nosniff"));
    }
    @Test void privateOrPendingImageRemainsUnavailable() throws Exception {
        UUID id=UUID.randomUUID();
        when(service.publicContent(id)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        mvc.perform(get("/api/v1/media/"+id)).andExpect(status().isNotFound());
    }
    @Test void uploadReviewAndMetadataRequireAuthentication() throws Exception {
        UUID id=UUID.randomUUID();
        mvc.perform(get("/api/v1/admin/media/"+id)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/admin/media/"+id+"/review").contentType("application/json").content("{\"action\":\"APPROVE\",\"reason\":\"checked\"}")).andExpect(status().isUnauthorized());
        mvc.perform(multipart("/api/v1/admin/media").file("file",new byte[]{1,2,3,4})).andExpect(status().isUnauthorized());
        mvc.perform(multipart("/api/v1/media").file("file",new byte[]{1,2,3,4})).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
}
