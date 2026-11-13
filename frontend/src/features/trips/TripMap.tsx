import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Resource } from "../../shared/api";

export const rowId = (row: Resource) =>
  String(
    row.item_id ??
      row.place_id ??
      row.leg_id ??
      row.trip_id ??
      row.day_id ??
      row.id ??
      "",
  );
export const snapshot = (item: Resource): Resource =>
  (item.snapshot ?? item) as Resource;
export const placeName = (item: Resource) =>
  String(item.place_name ?? snapshot(item).name ?? "Địa điểm đã lưu");
export function imageUrl(row: Resource): string | undefined {
  const value =
    row.thumbnail_url ??
    row.image_url ??
    row.cover_image_url ??
    row.image ??
    (Array.isArray(row.images) ? row.images[0] : undefined);
  if (typeof value === "string" && /^(https?:\/\/|\/)/.test(value))
    return value;
  if (value && typeof value === "object") return imageUrl(value as Resource);
  return undefined;
}
export function TripMap({
  items,
  legs,
  selected,
  onSelect,
}: {
  items: Resource[];
  legs: Resource[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { scrollWheelZoom: false });
    map.current = instance;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    })
      .on("tileerror", () => setTilesFailed(true))
      .addTo(instance);
    layer.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  const points = items
    .map((item, index) => {
      const data = snapshot(item);
      const lat = Number(data.latitude),
        lon = Number(data.longitude);
      return data.latitude != null &&
        data.longitude != null &&
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180
        ? { item, index, lat, lon }
        : null;
    })
    .filter((point) => point != null);
  useEffect(() => {
    const instance = map.current,
      group = layer.current;
    if (!instance || !group) return;
    group.clearLayers();
    points.forEach((point) => {
      const marker = L.marker([point.lat, point.lon], {
        title: `${point.index + 1}. ${placeName(point.item)}`,
        icon: L.divIcon({
          className: `tp-map-marker ${selected === rowId(point.item) ? "is-selected" : ""}`,
          html: `<span>${point.index + 1}</span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
      }).addTo(group);
      marker.bindTooltip(
        document.createTextNode(
          placeName(point.item),
        ) as unknown as HTMLElement,
      );
      marker.on("click", () => onSelect(rowId(point.item)));
    });
    legs.forEach((leg) => {
      const geometry = leg.geometry as {
        type?: string;
        coordinates?: number[][];
      } | null;
      if (
        geometry?.type === "LineString" &&
        Array.isArray(geometry.coordinates)
      ) {
        const line = geometry.coordinates
          .filter(
            (p) =>
              p.length >= 2 &&
              Number.isFinite(p[0]) &&
              Number.isFinite(p[1]) &&
              Math.abs(p[1]) <= 90 &&
              Math.abs(p[0]) <= 180,
          )
          .map((p) => [p[1], p[0]] as L.LatLngTuple);
        if (line.length > 1)
          L.polyline(line, { color: "#247363", weight: 4, opacity: 0.8 }).addTo(
            group,
          );
      }
    });
    if (points.length)
      instance.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon])), {
        padding: [38, 38],
        maxZoom: 14,
      });
  }, [items, legs, selected]);
  return (
    <>
      <div
        ref={container}
        className="tp-map-canvas"
        aria-label="Bản đồ lịch trình tương tác"
        style={{ display: points.length ? "block" : "none" }}
      />
      {!points.length && (
        <div className="tp-map-empty">
          Thêm địa điểm có vị trí để xem bản đồ.
        </div>
      )}
      {tilesFailed && (
        <p role="status" className="tp-hint">
          Không tải được nền bản đồ. Các vị trí đã lưu vẫn hiển thị; kiểm tra
          kết nối mạng.
        </p>
      )}
      <p className="tp-hint">
        {items.length - points.length > 0
          ? `${items.length - points.length} địa điểm chưa có tọa độ. `
          : ""}
        {legs.some((leg) => leg.geometry)
          ? "Tuyến hiển thị từ kết quả dẫn đường."
          : "Các số trên bản đồ khớp thứ tự ghé thăm. Chưa có hình tuyến đường."}
      </p>
    </>
  );
}
