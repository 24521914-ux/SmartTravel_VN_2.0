package vn.smarttravel.catalog.shared.web;
public final class VersionHeaders {
    private VersionHeaders(){}
    public static long parse(String value){if(value==null)throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.valueOf(428),"If-Match required");String text=value;if(text.startsWith("\"")&&text.endsWith("\"")&&text.length()>2)text=text.substring(1,text.length()-1);if(!text.matches("[1-9][0-9]{0,18}"))throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Strong numeric version required");try{return Long.parseLong(text);}catch(NumberFormatException e){throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Invalid version");}}
}
