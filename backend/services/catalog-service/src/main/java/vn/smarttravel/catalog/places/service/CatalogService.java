package vn.smarttravel.catalog.places.service;
import java.util.*;
import org.springframework.stereotype.Service;
import vn.smarttravel.catalog.places.repository.CatalogRepository;
@Service
public class CatalogService {
    private final CatalogRepository repository;
    private final SearchCursor cursors;
    private final vn.smarttravel.catalog.taxonomy.repository.TaxonomyRepository taxonomy;
    public CatalogService(CatalogRepository repository,SearchCursor cursors,vn.smarttravel.catalog.taxonomy.repository.TaxonomyRepository taxonomy){this.repository=repository;this.cursors=cursors;this.taxonomy=taxonomy;}
    public Object create(Map<String,Object> body,UUID actor){return repository.create(body,actor);}
    public Object update(UUID id,long version,Map<String,Object> body,UUID actor){return repository.update(id,version,body,actor);}
    public Map<String,Object> place(UUID id,boolean publicOnly){return repository.place(id,publicOnly);}
    public Object search(Map<String,String> query){var filters=new LinkedHashMap<>(query);if(filters.containsKey("afterId"))throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Use cursor pagination");if(filters.containsKey("cursor"))filters.put("afterId",cursors.decode(filters.get("cursor"),query).toString());int limit=Integer.parseInt(filters.getOrDefault("limit","20"));var rows=repository.search(filters);var items=rows.size()>limit?rows.subList(0,limit):rows;String next=rows.size()>limit?cursors.encode((UUID)items.getLast().get("place_id"),query):null;var result=new LinkedHashMap<String,Object>();result.put("items",items.stream().map(vn.smarttravel.catalog.shared.web.Representations::place).toList());result.put("next_cursor",next);result.put("as_of",java.time.Instant.now().toString());result.put("watermark",items.stream().mapToLong(row->((Number)row.get("version")).longValue()).max().orElse(1));return result;}
    public Object taxonomy(String kind){return repository.taxonomy(kind);}
    public boolean rating(UUID event,Map<String,Object> payload){return repository.rating(event,payload);}
    public Object adminSearch(Map<String,String> query){return vn.smarttravel.catalog.shared.web.Representations.page(repository.adminList().stream().map(vn.smarttravel.catalog.shared.web.Representations::place).toList());}
    public Object candidates(Map<String,Object> body){return Map.of("items",repository.candidates(body).stream().map(vn.smarttravel.catalog.shared.web.Representations::place).toList(),"missing_ids",List.of());}
    public Object publicTaxonomy(String kind){return vn.smarttravel.catalog.shared.web.Representations.page(taxonomy.list(kind).stream().filter(row->kind.equals("destinations")?"PUBLISHED".equals(row.get("status")):kind.equals("geographic-units")?"ACTIVE".equals(row.get("status")):Boolean.TRUE.equals(row.get("active"))).map(row->vn.smarttravel.catalog.shared.web.Representations.taxonomy(kind,row)).toList());}
}
