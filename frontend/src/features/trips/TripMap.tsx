import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Resource } from "../../shared/api";
import { Icon } from "../../shared/ui";
import { placeImageCandidates } from "../places/media";

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
  return placeImageCandidates(row)[0] || undefined;
}

function formatShortDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "Chưa đặt";
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours} giờ ${rem} phút` : `${hours} giờ`;
}

export interface TripMapProps {
  items: Resource[];
  legs: Resource[];
  selected: string;
  onSelect: (id: string) => void;
  dayNumber?: number;
  disabled?: boolean;
  onToggleLock?: (item: Resource) => void;
}

export function TripMap({
  items,
  legs,
  selected,
  onSelect,
  dayNumber = 1,
  disabled = false,
  onToggleLock,
}: TripMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const tileLayer = useRef<L.TileLayer | null>(null);
  const providerIdxRef = useRef(0);
  const tileLoadedRef = useRef(false);
  const tileErrorCountRef = useRef(0);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [cardDismissed, setCardDismissed] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  const attachTileProvider = (instance: L.Map, startIdx: number) => {
    const localDevelopment = ["localhost", "127.0.0.1", "[::1]"].includes(
      window.location.hostname,
    );
    const customUrl = import.meta.env.VITE_MAP_TILE_URL;
    const providers: Array<{ url: string; attribution: string; subdomains?: string }> = [];
    if (customUrl) {
      providers.push({
        url: customUrl,
        attribution:
          import.meta.env.VITE_MAP_ATTRIBUTION ||
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      });
    }
    if (localDevelopment) {
      providers.push({
        url: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png",
        attribution:
          '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      });
    }
    providers.push({
      url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      subdomains: "abcd",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    });
    providers.push({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });

    const idx = Math.max(0, Math.min(startIdx, providers.length - 1));
    providerIdxRef.current = idx;
    tileLoadedRef.current = false;
    tileErrorCountRef.current = 0;

    if (tileLayer.current) {
      tileLayer.current.remove();
      tileLayer.current = null;
    }

    const spec = providers[idx];
    const nextLayer = L.tileLayer(spec.url, {
      attribution: spec.attribution,
      maxZoom: 19,
      ...(spec.subdomains ? { subdomains: spec.subdomains } : {}),
    });

    nextLayer.on("tileload", () => {
      tileLoadedRef.current = true;
      tileErrorCountRef.current = 0;
      setTilesFailed(false);
    });

    nextLayer.on("tileerror", () => {
      tileErrorCountRef.current += 1;
      if (!tileLoadedRef.current || tileErrorCountRef.current >= 2) {
        if (providerIdxRef.current + 1 < providers.length) {
          attachTileProvider(instance, providerIdxRef.current + 1);
        } else {
          setTilesFailed(true);
        }
      }
    });

    nextLayer.addTo(instance);
    tileLayer.current = nextLayer;
  };

  useEffect(() => {
    setCardDismissed(false);
  }, [selected, items.length]);

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, {
      scrollWheelZoom: false,
      zoomControl: false,
      fadeAnimation: false,
    }).setView([16.0544, 108.2022], 6);
    map.current = instance;
    attachTileProvider(instance, 0);
    layer.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() =>
      instance.invalidateSize({ animate: false }),
    );
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      tileLayer.current?.remove();
      tileLayer.current = null;
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

    let drawnRoute = false;
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
        if (line.length > 1) {
          drawnRoute = true;
          L.polyline(line, {
            color: "#072b3b",
            weight: 3,
            dashArray: "8 8",
            opacity: 0.88,
          }).addTo(group);
        }
      }
    });

    if (!drawnRoute && points.length > 1) {
      L.polyline(
        points.map((p) => [p.lat, p.lon] as L.LatLngTuple),
        {
          color: "#072b3b",
          weight: 3,
          dashArray: "8 8",
          opacity: 0.78,
        },
      ).addTo(group);
    }

    points.forEach((point) => {
      const isSelected = selected === rowId(point.item);
      const marker = L.marker([point.lat, point.lon], {
        title: `${point.index + 1}. ${placeName(point.item)}`,
        zIndexOffset: isSelected ? 400 : 0,
        icon: L.divIcon({
          className: `tp-map-marker ${isSelected ? "is-selected" : ""}`,
          html: `<span>${point.index + 1}</span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      }).addTo(group);
      marker.bindTooltip(
        document.createTextNode(
          placeName(point.item),
        ) as unknown as HTMLElement,
        { direction: "top", offset: [0, -14] },
      );
      marker.on("click", () => {
        setCardDismissed(false);
        onSelect(rowId(point.item));
      });
    });

    const fit = () => {
      instance.invalidateSize({ animate: false });
      if (points.length === 1) {
        instance.setView([points[0].lat, points[0].lon], 15, { animate: false });
      } else if (points.length > 1) {
        instance.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon])), {
          padding: [56, 56],
          maxZoom: 15,
          animate: false,
        });
      }
    };

    fit();
    const rafId = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(rafId);
  }, [items, legs, selected]);

  const totalDistanceMeters = legs.reduce(
    (sum, leg) => sum + (leg.distance_m != null ? Number(leg.distance_m) : 0),
    0,
  );
  const hasDistance = legs.some((leg) => leg.distance_m != null);

  const activeStopIndex = items.findIndex((i) => rowId(i) === selected);
  const resolvedIndex = activeStopIndex >= 0 ? activeStopIndex : 0;
  const activeStop = items[resolvedIndex];
  const activeStopId = activeStop ? rowId(activeStop) : "";
  const activeSnapshot = activeStop ? snapshot(activeStop) : null;
  const activeCandidates = activeSnapshot ? placeImageCandidates(activeSnapshot) : [];
  const activeCandidateKey = activeCandidates.join("|");
  const activePhoto = activeCandidates[photoIndex] ?? "";

  useEffect(() => {
    setPhotoIndex(0);
  }, [activeStopId, activeCandidateKey]);
  const activeLat = activeSnapshot ? Number(activeSnapshot.latitude) : NaN;
  const activeLon = activeSnapshot ? Number(activeSnapshot.longitude) : NaN;
  const hasActiveCoords =
    activeSnapshot?.latitude != null &&
    activeSnapshot?.longitude != null &&
    Number.isFinite(activeLat) &&
    Number.isFinite(activeLon);
  const activeRating =
    activeSnapshot?.rating ?? activeSnapshot?.average_rating ?? activeSnapshot?.rating_avg;
  const ratingNumber =
    activeRating != null && activeRating !== "" && Number.isFinite(Number(activeRating))
      ? Number(activeRating)
      : null;

  const incomingLeg = activeStop
    ? legs.find((l) => String(l.to_item_id) === rowId(activeStop))
    : undefined;
  const outgoingLeg = activeStop
    ? legs.find((l) => String(l.from_item_id) === rowId(activeStop))
    : undefined;
  const refLeg = incomingLeg ?? outgoingLeg;

  return (
    <div className="tp-map-stage">
      <div
        ref={container}
        className="tp-map-canvas"
        aria-label="Bản đồ lịch trình tương tác"
      />

      {!points.length && (
        <div className="tp-map-empty">
          <div className="tp-map-empty-inner">
            <Icon name="map" size={34} />
            <strong>Chưa có tọa độ trên bản đồ</strong>
            <span>Thêm địa điểm có vị trí để xem tuyến đường và ghim thứ tự.</span>
          </div>
        </div>
      )}

      {/* Top-Left Floating Route Summary Pill */}
      <div className="tp-map-route-pill">
        <span className="tp-map-route-dash" aria-hidden="true" />
        <span>
          Tuyến Ngày {dayNumber} · {items.length} điểm dừng
          {hasDistance && totalDistanceMeters > 0
            ? ` · ${(totalDistanceMeters / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`
            : ""}
        </span>
      </div>

      {/* Top-Right Floating Custom Zoom Controls */}
      {points.length > 0 && (
        <div className="tp-map-zoom" role="group" aria-label="Điều khiển thu phóng bản đồ">
          <button
            type="button"
            aria-label="Phóng to bản đồ"
            onClick={() => map.current?.zoomIn()}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Thu nhỏ bản đồ"
            onClick={() => map.current?.zoomOut()}
          >
            −
          </button>
        </div>
      )}

      {/* Bottom-Left Subtle Tile Status / Attribution Hint */}
      {(tilesFailed || (items.length > 0 && items.length - points.length > 0)) && (
        <div className="tp-map-status-note" role="status">
          {tilesFailed ? (
            <>
              <span>Không tải được nền bản đồ. Các vị trí đã lưu vẫn hiển thị.</span>
              <button
                type="button"
                className="tp-map-retry-btn"
                onClick={() => {
                  setTilesFailed(false);
                  if (map.current) attachTileProvider(map.current, 0);
                }}
              >
                Thử lại
              </button>
            </>
          ) : (
            `${items.length - points.length} địa điểm chưa có tọa độ.`
          )}
        </div>
      )}

      {/* Bottom-Right Floating Selected Stop Detail Card */}
      {activeStop && !cardDismissed && (
        <article className="tp-map-stop-card" aria-label={`Chi tiết ${placeName(activeStop)}`}>
          <button
            type="button"
            className="tp-map-stop-close"
            aria-label="Đóng thẻ xem nhanh"
            onClick={() => setCardDismissed(true)}
          >
            <Icon name="x" size={14} />
          </button>

          {activePhoto ? (
            <div className="tp-map-stop-media">
              <img
                src={activePhoto}
                alt={placeName(activeStop)}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setPhotoIndex((curr) => curr + 1)}
              />
            </div>
          ) : (
            <div className="tp-map-stop-media tp-map-stop-placeholder">
              <Icon name="pin" size={26} />
            </div>
          )}

          <div className="tp-map-stop-body">
            <div className="tp-map-stop-title-row">
              <h4>{placeName(activeStop)}</h4>
              {ratingNumber !== null && (
                <span className="tp-map-stop-rating">
                  <Icon name="star" size={13} weight="fill" />
                  {ratingNumber.toLocaleString("vi-VN")}
                </span>
              )}
            </div>

            <div className="tp-map-stop-chips">
              <span>Điểm dừng #{resolvedIndex + 1}</span>
              <span>
                <Icon name="clock" size={12} />
                {formatShortDuration(Number(activeStop.duration_minutes ?? 120))}
              </span>
              {refLeg?.distance_m != null && (
                <span>
                  {(Number(refLeg.distance_m) / 1000).toLocaleString("vi-VN", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  km
                </span>
              )}
            </div>

            <div className="tp-map-stop-note">
              <Icon name="sparkle" size={14} />
              <p>
                {typeof activeStop.note === "string" && activeStop.note.trim()
                  ? activeStop.note
                  : typeof activeSnapshot?.address === "string" && activeSnapshot.address
                    ? activeSnapshot.address
                    : "Bấm vào điểm dừng ở cột trái để chỉnh sửa ghi chú hoặc thời lượng."}
              </p>
            </div>

            <div className="tp-map-stop-actions">
              {hasActiveCoords ? (
                <a
                  className="tp-map-btn-outline"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${activeLat},${activeLon}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="route" size={14} />
                  <span>Chỉ đường</span>
                </a>
              ) : (
                <button
                  type="button"
                  className="tp-map-btn-outline"
                  onClick={() => onSelect(rowId(activeStop))}
                >
                  <Icon name="pin" size={14} />
                  <span>Xem điểm dừng</span>
                </button>
              )}

              <button
                type="button"
                className={`tp-map-btn-solid ${activeStop.locked ? "is-locked" : ""}`}
                disabled={disabled || !onToggleLock}
                onClick={() => onToggleLock?.(activeStop)}
              >
                <Icon name={activeStop.locked ? "check" : "lock"} size={14} />
                <span>{activeStop.locked ? "Đã khóa điểm" : "Khóa điểm dừng"}</span>
              </button>
            </div>
          </div>
        </article>
      )}
    </div>
  );
}
