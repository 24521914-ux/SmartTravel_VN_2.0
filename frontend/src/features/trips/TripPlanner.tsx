import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Icon, RoundedSelect } from "../../shared/ui";
import {
  ApiError,
  type TravelClient,
  type Resource,
  type Page,
} from "../../shared/api";
import { placeImageCandidates } from "../places/media";
import { hydratePlaceWithOpenData, hydratePlacesWithOpenData, loadOpenDataPlaces } from "../places/osmCatalog";
import { cachedFirstPlacesPage, cachedTaxonomy, getCachedMergedCatalog } from "../places/catalogCache";
import { consumeMyTripsPrefetch } from "./tripPrefetch";
import { TripDestinations } from "./TripDestinations";
import { TripMap, rowId, snapshot, placeName } from "./TripMap";
import "./trip-planner.css";

function PlacePhoto({
  place,
  className,
  showEmptyFallback,
}: {
  place: Resource;
  className?: string;
  showEmptyFallback?: boolean;
}) {
  const candidates = placeImageCandidates(place);
  const key = candidates.join("|");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [key]);

  const src = candidates[index] ?? "";
  if (!src) {
    if (!showEmptyFallback) return null;
    return (
      <div className="tp-stop-thumb tp-stop-thumb-empty" aria-hidden="true">
        <Icon name="pin" size={16} />
      </div>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setIndex((curr) => curr + 1)}
    />
  );
}

export interface TripPlannerProps {
  travel: TravelClient;
  busy?: boolean;
  suggestedPlace?: Resource | null;
}

type Sync = "idle" | "editing" | "saving" | "saved" | "failed" | "conflict";
type Operation = {
  key?: string;
  editorId?: string;
  confirmed?: boolean;
  result?: Resource;
  path: string;
  body?: unknown;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  after?: (result: Resource) => Promise<void>;
};

const dateLabel = (date: unknown) =>
  String(date ?? "")
    .split("-")
    .reverse()
    .join("/");

const shortDayPillDate = (date: unknown) => {
  const raw = String(date ?? "");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return dateLabel(raw);
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return `${weekdays[parsed.getDay()]} · ${match[3]}/${match[2]}`;
};

const dayEyebrowDate = (date: unknown) => {
  const raw = String(date ?? "");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return dateLabel(raw);
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const weekdays = [
    "CHỦ NHẬT",
    "THỨ HAI",
    "THỨ BA",
    "THỨ TƯ",
    "THỨ NĂM",
    "THỨ SÁU",
    "THỨ BẢY",
  ];
  return `${weekdays[parsed.getDay()]}, ${Number(match[3])} THÁNG ${Number(match[2])}`;
};

const dateRangeCompact = (start: unknown, end: unknown) => {
  const s = String(start ?? "").split("-");
  const e = String(end ?? "").split("-");
  if (s.length === 3 && e.length === 3) {
    return `${s[2]}/${s[1]} – ${e[2]}/${e[1]}`;
  }
  return `${dateLabel(start)} – ${dateLabel(end)}`;
};

const tripDurationDays = (start: unknown, end: unknown) => {
  const s = Date.parse(String(start ?? ""));
  const e = Date.parse(String(end ?? ""));
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 1;
  return Math.round((e - s) / 86400000) + 1;
};

const formatDurationShort = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 phút";
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}g ${rem}p` : `${hours} giờ`;
};

const computeStopTimes = (items: Resource[], legs: Resource[]) => {
  let cursorMinutes = 8 * 60;
  return items.map((item, idx) => {
    const hh = String(Math.floor(cursorMinutes / 60) % 24).padStart(2, "0");
    const mm = String(cursorMinutes % 60).padStart(2, "0");
    const visit = Number(item.duration_minutes ?? 120);
    const nextItem = items[idx + 1];
    const leg = nextItem
      ? legs.find(
          (row) =>
            String(row.from_item_id) === rowId(item) &&
            String(row.to_item_id) === rowId(nextItem),
        )
      : undefined;
    const travelMins =
      leg?.duration_seconds != null
        ? Math.ceil(Number(leg.duration_seconds) / 60)
        : 20;
    cursorMinutes += (Number.isFinite(visit) ? visit : 120) + travelMins;
    return `${hh}:${mm}`;
  });
};

const states: Record<string, string> = {
  DRAFT: "Nháp",
  PLANNED: "Đã lên kế hoạch",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

const modes: Record<string, string> = {
  DRIVE: "Ô tô",
  WALK: "Đi bộ",
  BICYCLE: "Xe đạp",
  SELF_MANAGED: "Tự di chuyển",
};

const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409 || error.status === 412)
      return "Nội dung đã thay đổi ở nơi khác. Tải phiên bản mới để đối chiếu trước khi lưu.";
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.";
    if (error.status === 503 || error.status === 502 || error.status === 504)
      return "Dịch vụ tạm thời chưa phản hồi. Nội dung bạn nhập vẫn được giữ; hãy thử lại.";
    if (error.status === 404)
      return "Không tìm thấy dữ liệu này. Tải lại lịch trình để cập nhật.";
    if (error.body.message === "ITEM_LOCKED")
      return "Mở khóa địa điểm trước khi chỉnh sửa hoặc đổi thứ tự.";
    if (error.status === 422)
      return "Thay đổi chưa phù hợp với lịch trình. Kiểm tra khoảng ngày và các địa điểm đang khóa.";
    if (error.status === 400)
      return "Kiểm tra lại thông tin đã nhập rồi thử lưu lại.";
  }
  return "Chưa kết nối được với hệ thống. Kiểm tra mạng rồi thử lại; nội dung đang nhập vẫn được giữ.";
}

function ItemEditor({
  item,
  onSave,
  onDirty,
  disabled,
}: {
  item: Resource;
  onSave: (body: Resource) => void;
  onDirty: () => void;
  disabled: boolean;
}) {
  const [note, setNote] = useState(String(item.note ?? "")),
    [duration, setDuration] = useState(String(item.duration_minutes ?? 120));
  const touched = useRef<Set<string>>(new Set());
  const dirty = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    latest = useRef({ note, duration }),
    callback = useRef(onSave);
  latest.current = { note, duration };
  callback.current = onSave;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!dirty.current) {
      setNote(String(item.note ?? ""));
      setDuration(String(item.duration_minutes ?? 120));
    }
  }, [item]);
  function save() {
    if (timer.current) clearTimeout(timer.current);
    if (!dirty.current) return;
    const value = Number(latest.current.duration);
    if (
      latest.current.duration === "" ||
      !Number.isInteger(value) ||
      value < 0 ||
      !latest.current.note.trim()
    )
      return;
    const body: Resource = {};
    if (touched.current.has("note")) body.note = latest.current.note;
    if (touched.current.has("duration")) body.duration_minutes = value;
    dirty.current = false;
    touched.current.clear();
    callback.current(body);
  }
  function edited(field: string) {
    touched.current.add(field);
    dirty.current = true;
    onDirty();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 900);
  }
  return (
    <div className="tp-item-fields">
      <label>
        Thời gian ghé thăm
        <span className="tp-duration">
          <input
            aria-label={`Thời lượng ${placeName(item)}`}
            type="number"
            min="0"
            step="1"
            value={duration}
            disabled={disabled || Boolean(item.locked)}
            onChange={(e) => {
              setDuration(e.target.value);
              latest.current.duration = e.target.value;
              edited("duration");
            }}
            onBlur={save}
          />{" "}
          phút
        </span>
      </label>
      <label>
        Ghi chú
        <textarea
          aria-label={`Ghi chú ${placeName(item)}`}
          maxLength={1024}
          rows={2}
          value={note}
          disabled={disabled || Boolean(item.locked)}
          placeholder="Bạn muốn làm gì ở đây?"
          onChange={(e) => {
            setNote(e.target.value);
            latest.current.note = e.target.value;
            edited("note");
          }}
          onBlur={save}
        />
      </label>
      {duration !== "" &&
      Number.isInteger(Number(duration)) &&
      Number(duration) >= 0 ? null : (
        <small role="alert">Nhập số phút nguyên từ 0 trở lên.</small>
      )}
      {!note.trim() && (
        <small role="alert">Thêm ghi chú ngắn trước khi lưu.</small>
      )}
    </div>
  );
}

export function TripPlanner({
  travel,
  busy = false,
  suggestedPlace,
}: TripPlannerProps) {
  const [trips, setTrips] = useState<Resource[]>([]),
    [trip, setTrip] = useState<Resource | null>(null),
    [days, setDays] = useState<Resource[]>([]),
    [day, setDay] = useState<Resource | null>(null);
  const [items, setItems] = useState<Resource[]>([]),
    [legs, setLegs] = useState<Resource[]>([]),
    [places, setPlaces] = useState<Resource[]>([]),
    [openDataPlaces, setOpenDataPlaces] = useState<Resource[]>([]),
    [categories, setCategories] = useState<Resource[]>([]),
    [destinations, setDestinations] = useState<Resource[]>([]);
  const [tripDestinations, setTripDestinations] = useState<Resource[]>([]);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [destination, setDestination] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [finding, setFinding] = useState(false),
    [placeError, setPlaceError] = useState("");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [sync, setSync] = useState<Sync>("idle"),
    [newTrip, setNewTrip] = useState(false),
    [settings, setSettings] = useState(false),
    [addingDay, setAddingDay] = useState(false);
  const [selectedItem, setSelectedItem] = useState(""),
    [leftMode, setLeftMode] = useState<"timeline" | "explore">("timeline"),
    [mobileView, setMobileView] = useState<"timeline" | "explore" | "map">("timeline"),
    [dragged, setDragged] = useState(-1),
    [notice, setNotice] = useState(""),
    [editorGeneration, setEditorGeneration] = useState(0);
  const tripRef = useRef<Resource | null>(null),
    dayRef = useRef(""),
    request = useRef(0),
    searchRequest = useRef(0),
    failed = useRef<Operation | null>(null),
    mutationLock = useRef(false),
    queued = useRef<Operation[]>([]);
  const dirtyEditors = useRef(new Set<string>());
  const loadedDestKey = useRef("");
  const isFirstPlaceFetch = useRef(true);
  const disabled =
      busy ||
      loading ||
      ["editing", "saving", "failed", "conflict"].includes(sync),
    tripId = trip ? rowId(trip) : "",
    dayId = day ? rowId(day) : "",
    base = `/trips/${tripId}`,
    dayBase = `${base}/days/${dayId}`;

  function remember(id: string, selectedDay = "") {
    try {
      sessionStorage.setItem(
        "smarttravel-planner-selection",
        JSON.stringify({ tripId: id, dayId: selectedDay }),
      );
    } catch {
      /* Storage unavailable. */
    }
  }

  function applyTrip(value: Resource) {
    tripRef.current = value;
    setTrip(value);
    setTrips((old) =>
      old.map((row) => (rowId(row) === rowId(value) ? value : row)),
    );
  }

  async function refreshTrip(id: string) {
    const value = await travel.read<Resource>("trip", `/trips/${id}`);
    if (rowId(tripRef.current ?? {}) === id) applyTrip(value);
    return value;
  }

  async function loadDay(
    id: string,
    selected: Resource,
    generation = request.current,
    preloaded?: { items: Resource[]; legs: Resource[] } | null,
  ) {
    const selectedId = rowId(selected);
    dayRef.current = selectedId;
    setDay(selected);
    setItems([]);
    setLegs([]);
    setSelectedItem("");
    remember(id, selectedId);
    if (preloaded) {
      if (generation !== request.current || dayRef.current !== selectedId) return;
      setItems(preloaded.items);
      setLegs(preloaded.legs);
      setSelectedItem(preloaded.items.length ? rowId(preloaded.items[0]) : "");
      return;
    }
    const [rows, segments] = await Promise.all([
      travel.readAll("trip", `/trips/${id}/days/${selectedId}/items`),
      travel.readAll("trip", `/trips/${id}/days/${selectedId}/travel-legs`),
    ]);
    if (generation !== request.current || dayRef.current !== selectedId) return;
    setItems(rows.items);
    setLegs(segments.items);
    setSelectedItem(rows.items.length ? rowId(rows.items[0]) : "");
  }

  async function openTrip(
    value: Resource,
    preferredDay = "",
    options?: {
      skipTripRefetch?: boolean;
      preloadedDays?: Resource[];
      preloadedDestinations?: Resource[];
      preloadedDayId?: string;
      preloadedDayData?: { items: Resource[]; legs: Resource[] } | null;
    },
  ) {
    const generation = ++request.current;
    setLoading(true);
    setError("");
    setSync("idle");
    dirtyEditors.current.clear();
    failed.current = null;
    applyTrip(value);
    setDays([]);
    setDay(null);
    dayRef.current = "";
    setItems([]);
    setLegs([]);
    setSettings(false);
    remember(rowId(value));
    try {
      const id = rowId(value);
      const destKey = `${id}:${String(value.version ?? '')}`;
      loadedDestKey.current = destKey;

      const destPromise = options?.preloadedDestinations
        ? Promise.resolve({ items: options.preloadedDestinations })
        : travel.readAll("trip", `/trips/${id}/destinations`).catch(() => null);
      void destPromise.then((destRows) => {
        if (generation !== request.current) return;
        if (destRows) setTripDestinations(destRows.items);
      });

      const [detail, rows] = await Promise.all([
        options?.skipTripRefetch
          ? Promise.resolve(value)
          : travel.read<Resource>("trip", `/trips/${id}`),
        options?.preloadedDays
          ? Promise.resolve({ items: options.preloadedDays })
          : travel.readAll("trip", `/trips/${id}/days`),
      ]);
      if (generation !== request.current) return;
      loadedDestKey.current = `${id}:${String(detail.version ?? '')}`;
      applyTrip(detail);
      setDays(rows.items);
      const selected =
        rows.items.find((row) => rowId(row) === preferredDay) ?? rows.items[0];
      if (selected) {
        const preloaded =
          options?.preloadedDayData && options.preloadedDayId === rowId(selected)
            ? options.preloadedDayData
            : undefined;
        await loadDay(id, selected, generation, preloaded);
      }
    } catch (cause) {
      if (generation === request.current) setError(errorMessage(cause));
    } finally {
      if (generation === request.current) setLoading(false);
    }
  }

  async function chooseDay(value: Resource) {
    setLoading(true);
    setError("");
    try {
      await loadDay(tripId, value);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function loadTrips() {
    setLoading(true);
    setError("");
    try {
      let remembered: { tripId?: string; dayId?: string } = {};
      try {
        remembered = JSON.parse(
          sessionStorage.getItem("smarttravel-planner-selection") ?? "{}",
        );
      } catch {
        /* No selection. */
      }

      const rememberedTripId = remembered.tripId && !suggestedPlace ? remembered.tripId : "";
      const rememberedDayId = remembered.dayId && rememberedTripId ? remembered.dayId : "";

      // Speculatively fetch remembered trip's days, destinations, items, and legs in parallel with /me/trips
      const tripsPromise = consumeMyTripsPrefetch(travel);
      const optDaysPromise = rememberedTripId
        ? travel.readAll("trip", `/trips/${rememberedTripId}/days`).catch(() => null)
        : Promise.resolve(null);
      const optDestsPromise = rememberedTripId
        ? travel.readAll("trip", `/trips/${rememberedTripId}/destinations`).catch(() => null)
        : Promise.resolve(null);
      const optItemsPromise =
        rememberedTripId && rememberedDayId
          ? travel.readAll("trip", `/trips/${rememberedTripId}/days/${rememberedDayId}/items`).catch(() => null)
          : Promise.resolve(null);
      const optLegsPromise =
        rememberedTripId && rememberedDayId
          ? travel.readAll("trip", `/trips/${rememberedTripId}/days/${rememberedDayId}/travel-legs`).catch(() => null)
          : Promise.resolve(null);

      const data = await tripsPromise;
      setTrips(data.items);
      const selected =
        data.items.find((row) => rowId(row) === remembered.tripId) ?? data.items[0];
      if (selected) {
        const selectedId = rowId(selected);
        if (rememberedTripId && selectedId === rememberedTripId) {
          const [optDays, optDests, optItems, optLegs] = await Promise.all([
            optDaysPromise,
            optDestsPromise,
            optItemsPromise,
            optLegsPromise,
          ]);
          await openTrip(selected, remembered.dayId, {
            skipTripRefetch: true,
            preloadedDays: optDays?.items,
            preloadedDestinations: optDests?.items,
            preloadedDayId: rememberedDayId,
            preloadedDayData:
              optItems && optLegs
                ? { items: optItems.items, legs: optLegs.items }
                : null,
          });
        } else {
          await openTrip(selected, remembered.dayId, { skipTripRefetch: true });
        }
      } else if (!data.items.length) {
        setNewTrip(true);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void loadTrips();
    void loadOpenDataPlaces()
      .then((rows) => {
        if (active && rows.length) setOpenDataPlaces(rows);
      })
      .catch(() => {});
    void cachedTaxonomy(travel, "categories")
      .then((items) => {
        if (active) setCategories(items);
      })
      .catch(() => {});
    void cachedTaxonomy(travel, "destinations")
      .then((items) => {
        if (active) setDestinations(items);
      })
      .catch(() => {});
    return () => {
      active = false;
      request.current++;
    };
  }, [travel]);

  const hydratedItems = useMemo(() => {
    if (!openDataPlaces.length) return items;
    return items.map((item) => {
      const snap = snapshot(item);
      const hydratedSnap = hydratePlaceWithOpenData(
        {
          ...snap,
          name: snap.name ?? item.place_name,
          place_id: snap.place_id ?? item.place_id,
        },
        openDataPlaces,
      );
      return hydratedSnap === snap ? item : { ...item, snapshot: hydratedSnap };
    });
  }, [items, openDataPlaces]);

  const hydratedPlaces = useMemo(
    () => hydratePlacesWithOpenData(places, openDataPlaces),
    [places, openDataPlaces],
  );

  useEffect(() => {
    let active = true;
    if (!tripId) {
      setTripDestinations([]);
      return;
    }
    const key = `${tripId}:${String(trip?.version ?? '')}`;
    if (loadedDestKey.current === key) {
      return;
    }
    setTripDestinations([]);
    void travel
      .readAll("trip", `${base}/destinations`)
      .then((data) => {
        if (active) {
          loadedDestKey.current = key;
          setTripDestinations(data.items);
        }
      })
      .catch(() => {
        if (active)
          setNotice(
            "Chưa tải được điểm đến của chuyến đi. Mở cài đặt để thử lại.",
          );
      });
    return () => {
      active = false;
    };
  }, [travel, tripId, trip?.version]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (["editing", "saving", "failed", "conflict"].includes(sync)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sync]);

  useEffect(() => {
    if (suggestedPlace) {
      setLeftMode("explore");
      setMobileView("explore");
    }
  }, [suggestedPlace]);

  useEffect(() => {
    if (!items.length) {
      if (selectedItem) setSelectedItem("");
      return;
    }
    if (!items.some((item) => rowId(item) === selectedItem)) {
      setSelectedItem(rowId(items[0]));
    }
  }, [items, selectedItem]);

  async function findPlaces(next?: string) {
    const generation = ++searchRequest.current;
    setFinding(true);
    setPlaceError("");
    try {
      const isDefaultUnfiltered = !next && !query.trim() && !category && !destination;
      if (isDefaultUnfiltered) {
        const cached = getCachedMergedCatalog(travel);
        if (cached) {
          if (generation !== searchRequest.current) return;
          const head = cached.places.slice(0, 12);
          const rows =
            suggestedPlace &&
            !head.some((row) => rowId(row) === rowId(suggestedPlace))
              ? [suggestedPlace, ...head]
              : head;
          setPlaces(rows);
          setCursor(null);
          return;
        }
      }

      const params = new URLSearchParams({ limit: "12" });
      if (query.trim()) params.set("q", query.trim());
      if (category) params.set("categoryId", category);
      if (destination) params.set("destinationId", destination);
      if (next) params.set("cursor", next);
      const data = isDefaultUnfiltered
        ? await cachedFirstPlacesPage(travel, 12)
        : await travel.read<Page>("catalog", `/places?${params}`);
      if (generation !== searchRequest.current) return;
      const rows =
        suggestedPlace &&
        !next &&
        !query &&
        !category &&
        !destination &&
        !data.items.some((row) => rowId(row) === rowId(suggestedPlace))
          ? [suggestedPlace, ...data.items]
          : data.items;
      setPlaces((old) => (next ? [...old, ...rows] : rows));
      setCursor(data.next_cursor ?? null);
    } catch (cause) {
      if (generation === searchRequest.current)
        setPlaceError(errorMessage(cause));
    } finally {
      if (generation === searchRequest.current) setFinding(false);
    }
  }

  useEffect(() => {
    if (isFirstPlaceFetch.current && !query.trim() && !category && !destination) {
      isFirstPlaceFetch.current = false;
      void findPlaces();
      return () => {
        searchRequest.current++;
      };
    }
    const timer = setTimeout(() => void findPlaces(), 300);
    return () => {
      clearTimeout(timer);
      searchRequest.current++;
    };
  }, [query, category, destination, travel, suggestedPlace]);

  useEffect(() => {
    if (!tripId || !dayId || !legs.some((leg) => leg.status === "PENDING"))
      return;
    let active = true;
    const timer = setInterval(() => {
      void travel
        .readAll("trip", `${dayBase}/travel-legs`)
        .then((data) => {
          if (active) setLegs(data.items);
        })
        .catch(() => {
          if (active)
            setNotice(
              "Lịch trình đã lưu. Chưa cập nhật được kết quả dẫn đường; kiểm tra kết nối.",
            );
        });
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tripId, dayId, legs, travel]);

  async function mutate(operation: Operation) {
    operation.key ??= crypto.randomUUID();
    if (mutationLock.current) {
      queued.current.push(operation);
      return;
    }
    mutationLock.current = true;
    setSync("saving");
    setError("");
    failed.current = null;
    const current = tripRef.current,
      id = current ? rowId(current) : "";
    try {
      const result = operation.confirmed
        ? operation.result!
        : await travel.mutate<Resource>(
            "trip",
            operation.path,
            operation.body,
            operation.method ?? "PATCH",
            current ? Number(current.version) : undefined,
            operation.key,
          );
      operation.confirmed = true;
      operation.result = result;
      if (
        id &&
        !(operation.method === "DELETE" && operation.path === `/trips/${id}`) &&
        operation.path !== "/me/trips"
      ) {
        await refreshTrip(id);
        const data = await travel.readAll("trip", `/trips/${id}/days`);
        setDays(data.items);
        const selected = data.items.find(
          (row) => rowId(row) === dayRef.current,
        );
        if (selected) {
          const [rows, segments] = await Promise.all([
            travel.readAll(
              "trip",
              `/trips/${id}/days/${rowId(selected)}/items`,
            ),
            travel.readAll(
              "trip",
              `/trips/${id}/days/${rowId(selected)}/travel-legs`,
            ),
          ]);
          setDay(selected);
          setItems(rows.items);
          setLegs(segments.items);
          remember(id, rowId(selected));
        } else {
          setDay(null);
          dayRef.current = "";
          setItems([]);
          setLegs([]);
        }
      }
      if (operation.after) await operation.after(result);
      if (operation.editorId) dirtyEditors.current.delete(operation.editorId);
      setSync(dirtyEditors.current.size ? "editing" : "saved");
    } catch (cause) {
      failed.current = operation;
      setSync(
        cause instanceof ApiError &&
          (cause.status === 409 || cause.status === 412)
          ? "conflict"
          : "failed",
      );
      setError(errorMessage(cause));
    } finally {
      mutationLock.current = false;
      if (!failed.current && queued.current.length)
        void mutate(queued.current.shift()!);
    }
  }

  async function reloadConflict() {
    if (!tripId) return;
    setLoading(true);
    try {
      await refreshTrip(tripId);
      if (failed.current) failed.current.key = crypto.randomUUID();
      setSync("failed");
      setError(
        "Đã lấy phiên bản mới. Nội dung bạn nhập được giữ lại. Kiểm tra rồi chọn Thử lưu lại để áp dụng thay đổi của bạn.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  function itemChange(item: Resource, body: Resource) {
    const editorId = rowId(item);
    void mutate({
      editorId,
      path: `${dayBase}/items/${editorId}`,
      body,
    });
  }

  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= items.length || disabled)
      return;
    if (
      items
        .slice(Math.min(from, to), Math.max(from, to) + 1)
        .some((item) => item.locked)
    ) {
      setNotice("Mở khóa địa điểm trước khi thay đổi vị trí của đoạn này.");
      return;
    }
    const next = [...items];
    next.splice(to, 0, next.splice(from, 1)[0]);
    void mutate({
      path: `${dayBase}/items/order`,
      body: { item_ids: next.map(rowId) },
      method: "PUT",
    });
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      start = String(form.get("start_date")),
      end = String(form.get("end_date")),
      initialDestination = String(form.get("destination") ?? "");
    if (end < start) {
      setError("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
      return;
    }
    void mutate({
      path: "/me/trips",
      method: "POST",
      body: {
        name: String(form.get("name")).trim(),
        start_date: start,
        end_date: end,
        budget: Number(form.get("budget") || 0),
        currency: form.get("currency"),
        timezone: "Asia/Ho_Chi_Minh",
      },
      after: async (result) => {
        setTrips((old) => [
          result,
          ...old.filter((row) => rowId(row) !== rowId(result)),
        ]);
        setNewTrip(false);
        await openTrip(result);
        if (initialDestination) {
          setSync("saving");
          const createdId = rowId(result);
          const existing = await travel.readAll(
            "trip",
            `/trips/${createdId}/destinations`,
          );
          if (
            !existing.items.some(
              (segment) =>
                String(segment.destination_id) === initialDestination &&
                segment.start_date === start &&
                segment.end_date === end,
            )
          ) {
            const latestTrip = await travel.read<Resource>(
              "trip",
              `/trips/${createdId}`,
            );
            await travel.mutate(
              "trip",
              `/trips/${createdId}/destinations`,
              {
                destination_id: initialDestination,
                start_date: start,
                end_date: end,
              },
              "POST",
              Number(latestTrip.version),
            );
          }
          await refreshTrip(createdId);
        }
      },
    });
  }

  function editTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate({
      path: base,
      body: {
        name: String(form.get("name")).trim(),
        start_date: form.get("start_date"),
        end_date: form.get("end_date"),
        budget: Number(form.get("budget") || 0),
      },
      after: async () => {
        setSettings(false);
      },
    });
  }

  const status =
    sync === "editing"
      ? "Chưa lưu…"
      : sync === "saving"
        ? "Đang lưu…"
        : sync === "saved"
          ? "Đã lưu"
          : sync === "failed"
            ? "Lưu lỗi"
            : sync === "conflict"
              ? "Có bản mới"
              : "Tự động lưu";

  const activeDayIndex = Math.max(
    0,
    days.findIndex((value) => rowId(value) === dayId),
  );
  const totalDayMinutes = items.reduce(
    (total, item) => total + Number(item.duration_minutes ?? 0),
    0,
  );
  const stopTimes = computeStopTimes(items, legs);

  function openPlaceExplorer() {
    setLeftMode("explore");
    setMobileView("explore");
    setTimeout(() => {
      document
        .querySelector<HTMLInputElement>(".tp-explore input[type=search]")
        ?.focus();
    }, 40);
  }

  return (
    <div className="tp-planner">
      <h1 className="tp-sr-only">Chuyến đi</h1>
      <div className="tp-shell">
        <div className="tp-studio-frame">
          {/* 1. UNIFIED TOP STUDIO HEADER BAR */}
          <header className="tp-command-bar">
            <div className="tp-command-left">
              <div className="tp-brand-pill">
                <span className="tp-brand-mark" aria-hidden="true">
                  <Icon name="route" size={16} />
                </span>
                <strong>Lịch trình</strong>
              </div>

              {!!trips.length && (
                <nav className="tp-trip-picker" aria-label="Chọn chuyến đi">
                  <div className="tp-field tp-picker-field">
                    <label htmlFor="tp-trip-selector" className="tp-sr-only">
                      Chuyến đi
                    </label>
                    <RoundedSelect
                      id="tp-trip-selector"
                      label="Chọn chuyến đi"
                      compact
                      disabled={disabled}
                      value={tripId}
                      placeholder="Chọn chuyến đi của bạn"
                      onChange={(selectedId) => {
                        const value = trips.find(
                          (row) => rowId(row) === selectedId,
                        );
                        if (value) void openTrip(value);
                      }}
                      options={[
                        { value: "", label: "Chọn chuyến đi của bạn" },
                        ...trips.map((row) => ({
                          value: rowId(row),
                          label: String(row.name),
                        })),
                      ]}
                    />
                  </div>
                </nav>
              )}

              {trip && !newTrip && (
                <div className="tp-header-chips">
                  <span className="tp-date-pill">
                    <Icon name="calendar" size={13} />
                    <span>
                      {dateRangeCompact(trip.start_date, trip.end_date)} ·{" "}
                      {tripDurationDays(trip.start_date, trip.end_date)} ngày
                    </span>
                  </span>
                  <span className="tp-state-chip">
                    {states[String(trip.state)] ?? String(trip.state)}
                  </span>
                </div>
              )}
            </div>

            <div className="tp-command-right">
              {trip && !newTrip && (
                <>
                  <span
                    data-testid="trip-save-status"
                    className={`tp-sync tp-sync-${sync}`}
                    role="status"
                  >
                    {sync === "saved" ? "✓ " : ""}
                    {status}
                  </span>
                  <button
                    type="button"
                    className={`tp-ghost-btn ${leftMode === "explore" ? "is-active" : ""}`}
                    disabled={disabled}
                    onClick={() => {
                      const next = leftMode === "explore" ? "timeline" : "explore";
                      setLeftMode(next);
                      setMobileView(next);
                    }}
                  >
                    <Icon name={leftMode === "explore" ? "arrowLeft" : "plus"} size={15} />
                    <span>
                      {leftMode === "explore" ? "Về lịch trình" : "Thêm địa điểm"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="tp-ghost-btn"
                    disabled={disabled}
                    onClick={() => setSettings(!settings)}
                    aria-expanded={settings}
                  >
                    <Icon name="filter" size={15} />
                    <span>Cài đặt chuyến đi</span>
                  </button>
                </>
              )}
              <button
                type="button"
                className="tp-primary"
                disabled={disabled}
                onClick={() => {
                  setNewTrip(true);
                  setError("");
                }}
              >
                + Chuyến đi mới
              </button>
            </div>
          </header>

          {/* CONTEXT BANNERS, ERROR ALERTS & DRAWERS */}
          {suggestedPlace && (
            <div className="tp-banner">
              <Icon name="pin" size={15} />
              <span>
                Chọn ngày bên dưới để thêm{" "}
                <strong>{String(suggestedPlace.name)}</strong> vào hành trình.
              </span>
            </div>
          )}

          {error && (
            <div className="tp-alert" role="alert">
              <strong>
                {sync === "conflict"
                  ? "Chuyến đi đã được cập nhật ở nơi khác."
                  : "Chưa hoàn tất thao tác."}
              </strong>
              <p>{error}</p>
              {sync === "conflict" ? (
                <button
                  type="button"
                  onClick={() => void reloadConflict()}
                  disabled={loading}
                >
                  Tải phiên bản mới
                </button>
              ) : failed.current ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    if (failed.current) void mutate(failed.current);
                  }}
                >
                  Thử lưu lại
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    trip ? void openTrip(trip, dayId) : void loadTrips()
                  }
                >
                  Thử tải lại
                </button>
              )}
              {failed.current && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Bỏ thay đổi chưa lưu và tải lại lịch trình mới nhất?",
                      )
                    ) {
                      failed.current = null;
                      queued.current = [];
                      setEditorGeneration((value) => value + 1);
                      if (trip) void openTrip(trip, dayId);
                      else {
                        setSync("idle");
                        setError("");
                      }
                    }
                  }}
                >
                  Bỏ thay đổi, tải lại
                </button>
              )}
            </div>
          )}

          {notice && (
            <div className="tp-banner" role="status">
              <span>{notice}</span>
              <button
                type="button"
                aria-label="Đóng thông báo"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}

          {newTrip && (
            <section className="tp-create" aria-label="Tạo chuyến đi mới">
              <div className="tp-section-heading">
                <div>
                  <span className="tp-eyebrow">MỘT KHỞI ĐẦU MỚI</span>
                  <h3>Tạo chuyến đi mới</h3>
                  <p>
                    Đặt tên, chọn khoảng ngày. Bạn sẽ thêm từng ngày tham quan sau.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNewTrip(false)}
                  disabled={sync === "saving"}
                  aria-label="Đóng tạo chuyến đi"
                >
                  ×
                </button>
              </div>
              <form onSubmit={create} className="tp-form">
                <label>
                  Tên chuyến đi
                  <input
                    name="name"
                    required
                    maxLength={200}
                    placeholder="Ví dụ: Một tuần khám phá miền Trung"
                  />
                </label>
                <label>
                  Ngày bắt đầu
                  <input
                    name="start_date"
                    type="date"
                    required
                    defaultValue={today()}
                  />
                </label>
                <label>
                  Ngày kết thúc
                  <input
                    name="end_date"
                    type="date"
                    required
                    defaultValue={today()}
                  />
                </label>
                <label>
                  Ngân sách dự kiến
                  <input
                    name="budget"
                    type="number"
                    min="0"
                    placeholder="Không bắt buộc · mặc định 0"
                  />
                </label>
                <div className="tp-field">
                  <label htmlFor="tp-new-destination">
                    Điểm đến ban đầu (không bắt buộc)
                  </label>
                  <RoundedSelect
                    id="tp-new-destination"
                    name="destination"
                    label="Điểm đến ban đầu (không bắt buộc)"
                    defaultValue=""
                    placeholder="Chọn sau"
                    options={[
                      { value: "", label: "Chọn sau" },
                      ...destinations.map((destination) => ({
                        value: String(
                          destination.destination_id ?? destination.id,
                        ),
                        label: String(destination.name),
                      })),
                    ]}
                  />
                </div>
                <div className="tp-field">
                  <label htmlFor="tp-new-currency">Tiền tệ</label>
                  <RoundedSelect
                    id="tp-new-currency"
                    name="currency"
                    label="Tiền tệ"
                    defaultValue="VND"
                    options={[{ value: "VND", label: "VND — Việt Nam đồng" }]}
                  />
                </div>
                <button
                  type="submit"
                  className="tp-primary"
                  disabled={sync === "saving" || busy}
                >
                  Tạo chuyến đi
                </button>
              </form>
            </section>
          )}

          {settings && trip && !newTrip && (
            <section className="tp-settings" aria-label="Cài đặt chuyến đi">
              <div className="tp-section-heading">
                <h3>Cài đặt chuyến đi</h3>
                <button
                  type="button"
                  aria-label="Đóng cài đặt"
                  onClick={() => setSettings(false)}
                >
                  ×
                </button>
              </div>
              <form key={tripId} onSubmit={editTrip} className="tp-form">
                <label>
                  Tên chuyến đi
                  <input
                    name="name"
                    defaultValue={String(trip.name)}
                    required
                  />
                </label>
                <label>
                  Ngày bắt đầu
                  <input
                    type="date"
                    name="start_date"
                    defaultValue={String(trip.start_date)}
                    required
                  />
                </label>
                <label>
                  Ngày kết thúc
                  <input
                    type="date"
                    name="end_date"
                    defaultValue={String(trip.end_date)}
                    required
                  />
                </label>
                <label>
                  Ngân sách
                  <input
                    name="budget"
                    type="number"
                    min="0"
                    defaultValue={Number(trip.budget ?? 0)}
                  />
                </label>
                <button type="submit" className="tp-primary" disabled={disabled}>
                  Áp dụng thay đổi
                </button>
              </form>
              <div className="tp-field tp-settings-state">
                <label htmlFor="tp-trip-state">Trạng thái chuyến đi</label>
                <RoundedSelect
                  id="tp-trip-state"
                  label="Trạng thái chuyến đi"
                  value={String(trip.state)}
                  disabled={disabled}
                  onChange={(stateValue) =>
                    void mutate({
                      path: `${base}/state`,
                      method: "PUT",
                      body: { state: stateValue },
                    })
                  }
                  options={Object.entries(states).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </div>
              <details>
                <summary>Điểm đến & di chuyển liên tỉnh</summary>
                <p className="tp-hint">
                  Các điểm đến và chặng liên tỉnh được quản lý riêng với tuyến
                  tham quan trong ngày.
                </p>
                <TripDestinations
                  travel={travel}
                  trip={trip}
                  busy={disabled}
                  onChanged={() => refreshTrip(tripId)}
                />
                <IntercityTransfers
                  travel={travel}
                  trip={trip}
                  disabled={disabled}
                  mutate={mutate}
                />
              </details>
              <button
                type="button"
                className="tp-danger"
                disabled={disabled}
                onClick={() => {
                  if (
                    window.confirm(
                      `Xóa toàn bộ chuyến đi “${String(trip.name)}”? Các ngày và lịch trình sẽ bị xóa.`,
                    )
                  )
                    void mutate({
                      path: base,
                      method: "DELETE",
                      after: async () => {
                        tripRef.current = null;
                        setTrip(null);
                        setDays([]);
                        setItems([]);
                        remember("");
                        await loadTrips();
                      },
                    });
                }}
              >
                Xóa chuyến đi
              </button>
            </section>
          )}

          {loading && (
            <p role="status" className="tp-loading">
              Đang tải lịch trình…
            </p>
          )}

          {/* 2. SPLIT WORKSPACE (LEFT TIMELINE/PICKER · RIGHT FULL-BLEED MAP) */}
          {trip && !newTrip && (
            <>
              <div className="tp-mobile-tabs" aria-label="Khu vực lập lịch trình">
                {(
                  [
                    ["timeline", "Lịch trình"],
                    ["explore", "Thêm địa điểm"],
                    ["map", "Bản đồ"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    aria-pressed={mobileView === value}
                    key={value}
                    onClick={() => {
                      setMobileView(value);
                      if (value !== "map") setLeftMode(value);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className={`tp-workspace tp-view-${mobileView}`}>
                {/* LEFT COLUMN: TIMELINE OR PLACE EXPLORER */}
                <div className="tp-left-pane">
                  {leftMode === "timeline" ? (
                    <section
                      className="tp-timeline"
                      aria-label="Lịch trình theo ngày"
                    >
                      {/* Rounded Day Pill Tabs */}
                      <div className="tp-days" aria-label="Ngày tham quan">
                        <div
                          role="tablist"
                          aria-label="Danh sách ngày trong lịch trình"
                        >
                          {days.map((value, index) => (
                            <button
                              type="button"
                              role="tab"
                              aria-label={`Ngày ${index + 1} · ${dateLabel(value.date)}`}
                              aria-selected={rowId(value) === dayId}
                              key={rowId(value)}
                              disabled={disabled}
                              onClick={() => void chooseDay(value)}
                            >
                              <strong>Ngày {index + 1}</strong>
                              <small>{shortDayPillDate(value.date)}</small>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="tp-day-add-btn"
                          disabled={disabled}
                          onClick={() => setAddingDay(!addingDay)}
                          aria-expanded={addingDay}
                        >
                          + Thêm ngày
                        </button>
                      </div>

                      {(addingDay || !days.length) && (
                        <form
                          className="tp-add-day"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const date = String(
                              new FormData(e.currentTarget).get("date"),
                            );
                            void mutate({
                              path: `${base}/days`,
                              method: "POST",
                              body: { date },
                              after: async (result) => {
                                setAddingDay(false);
                                await loadDay(tripId, result);
                              },
                            });
                          }}
                        >
                          <div>
                            <strong>
                              {days.length
                                ? "Thêm một ngày tham quan"
                                : "Bắt đầu bằng một ngày tham quan"}
                            </strong>
                            <p>Chọn ngày nằm trong khoảng chuyến đi.</p>
                          </div>
                          <label>
                            Ngày tham quan
                            <input
                              name="date"
                              type="date"
                              min={String(trip.start_date)}
                              max={String(trip.end_date)}
                              defaultValue={String(trip.start_date)}
                              required
                            />
                          </label>
                          <button
                            type="submit"
                            className="tp-primary"
                            disabled={disabled}
                          >
                            Thêm ngày
                          </button>
                        </form>
                      )}

                      {/* Day Header: Terracotta Eyebrow + Trip Title + Summary Chips */}
                      <div className="tp-day-header">
                        <div className="tp-day-header-top">
                          <div>
                            <span className="tp-day-eyebrow">
                              {day
                                ? `NGÀY ${activeDayIndex + 1} · ${dayEyebrowDate(day.date)}`
                                : "LỊCH TRÌNH CHUYẾN ĐI"}
                            </span>
                            <h2 className="tp-trip-title">{String(trip.name)}</h2>
                            <h3 className="tp-sr-only">
                              {day ? `Ngày ${dateLabel(day.date)}` : "Lịch trình"}
                            </h3>
                          </div>

                          {day && (
                            <details className="tp-day-menu">
                              <summary aria-label="Tùy chọn ngày">•••</summary>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void mutate({
                                    path: dayBase,
                                    body: {
                                      date: new FormData(e.currentTarget).get(
                                        "date",
                                      ),
                                    },
                                  });
                                }}
                              >
                                <label>
                                  Đổi ngày tham quan
                                  <input
                                    name="date"
                                    type="date"
                                    required
                                    min={String(trip.start_date)}
                                    max={String(trip.end_date)}
                                    defaultValue={String(day.date)}
                                  />
                                </label>
                                <button type="submit" disabled={disabled}>
                                  Áp dụng ngày
                                </button>
                              </form>
                              <button
                                type="button"
                                disabled={disabled}
                                className="tp-danger"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      items.length
                                        ? `Xóa ngày này và ${items.length} địa điểm đã thêm?`
                                        : "Xóa ngày tham quan này?",
                                    )
                                  )
                                    void mutate({
                                      path: dayBase,
                                      method: "DELETE",
                                    });
                                }}
                              >
                                Xóa ngày tham quan
                              </button>
                            </details>
                          )}
                        </div>

                        <div className="tp-day-summary-chips">
                          <span>
                            <Icon name="pin" size={13} />
                            {items.length} điểm dừng
                          </span>
                          <span>
                            <Icon name="clock" size={13} />
                            {formatDurationShort(totalDayMinutes)}
                          </span>
                          <span>
                            <Icon name="price" size={13} />
                            {trip.budget == null || Number(trip.budget) === 0
                              ? "Chưa đặt ngân sách"
                              : `${Number(trip.budget).toLocaleString("vi-VN")} ${String(trip.currency ?? "VND")}`}
                          </span>
                          {tripDestinations.length > 0 && (
                            <span>
                              <Icon name="compass" size={13} />
                              {tripDestinations
                                .map((segment) =>
                                  String(
                                    destinations.find(
                                      (d) =>
                                        String(d.destination_id ?? d.id) ===
                                        String(segment.destination_id),
                                    )?.name ?? "Điểm đến",
                                  ),
                                )
                                .join(", ")}
                            </span>
                          )}
                        </div>
                      </div>

                      {!items.length && (
                        <div className="tp-timeline-empty">
                          <Icon name="route" size={34} />
                          <h4>
                            {day
                              ? "Một ngày, những điểm đến mới."
                              : "Bạn muốn bắt đầu từ ngày nào?"}
                          </h4>
                          <p>
                            {day
                              ? "Tìm một địa điểm và thêm vào ngày. Chúng tôi sẽ kết nối các điểm dừng cho bạn."
                              : "Thêm ngày trong khoảng thời gian của chuyến đi để bắt đầu lên lịch trình."}
                          </p>
                          {day && (
                            <button
                              type="button"
                              className="tp-primary"
                              onClick={openPlaceExplorer}
                            >
                              + Khám phá địa điểm
                            </button>
                          )}
                        </div>
                      )}

                      {/* Sequential Jelajah Timeline Stops */}
                      <div className="tp-stops-list">
                        {hydratedItems.map((item, index) => {
                          const id = rowId(item);
                          const name = placeName(item);
                          const snap = snapshot(item);
                          const isSelected = selectedItem === id;
                          const leg = legs.find(
                            (row) =>
                              String(row.from_item_id) === id &&
                              String(row.to_item_id) ===
                                rowId(hydratedItems[index + 1] ?? {}),
                          );
                          const previewText =
                            typeof item.note === "string" && item.note.trim()
                              ? item.note
                              : String(snap.address ?? "");

                          return (
                            <div key={id} className="tp-stop-group">
                              <article
                                data-testid="trip-timeline-item"
                                data-item-id={id}
                                className={`tp-item ${isSelected ? "is-selected" : ""}`}
                                draggable={!disabled && !item.locked}
                                onClick={(event) => {
                                  if (
                                    (event.target as HTMLElement).closest(
                                      "input,textarea,button,summary,details",
                                    )
                                  )
                                    return;
                                  setSelectedItem(id);
                                }}
                                onDragStart={(e) => {
                                  if (
                                    (e.target as HTMLElement).closest(
                                      "input,textarea,button,select",
                                    )
                                  ) {
                                    e.preventDefault();
                                    return;
                                  }
                                  setDragged(index);
                                }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  reorder(dragged, index);
                                  setDragged(-1);
                                }}
                              >
                                {/* Left Time + Colored Dot Rail */}
                                <div className="tp-stop-rail">
                                  <time className="tp-stop-time">
                                    {stopTimes[index]}
                                  </time>
                                  <button
                                    type="button"
                                    className="tp-number"
                                    aria-label={`Xem ${name} trên bản đồ`}
                                    onClick={() => setSelectedItem(id)}
                                  >
                                    {index + 1}
                                  </button>
                                </div>

                                <div className="tp-item-content">
                                  <div className="tp-item-row">
                                    <PlacePhoto
                                      place={snap}
                                      className="tp-stop-thumb"
                                      showEmptyFallback
                                    />

                                    <div className="tp-stop-summary">
                                      <button
                                        type="button"
                                        className="tp-place-name"
                                        onClick={() => setSelectedItem(id)}
                                      >
                                        {name}
                                      </button>
                                      {previewText && (
                                        <p className="tp-stop-sub">
                                          {previewText}
                                        </p>
                                      )}
                                      {item.locked ? (
                                        <span className="tp-locked">
                                          Đã khóa · mở khóa để chỉnh sửa
                                        </span>
                                      ) : null}
                                      {snap.status === "ARCHIVED" && (
                                        <span className="tp-warning">
                                          Địa điểm không còn khả dụng.
                                        </span>
                                      )}
                                    </div>

                                    <div className="tp-stop-right">
                                      <span className="tp-duration-pill">
                                        {formatDurationShort(
                                          Number(item.duration_minutes ?? 120),
                                        )}
                                      </span>
                                      <details className="tp-item-menu">
                                        <summary aria-label={`Thao tác ${name}`}>
                                          •••
                                        </summary>
                                        <button
                                          type="button"
                                          disabled={disabled}
                                          onClick={() =>
                                            itemChange(item, {
                                              locked: !item.locked,
                                            })
                                          }
                                        >
                                          {item.locked
                                            ? "Mở khóa địa điểm"
                                            : "Khóa địa điểm"}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={
                                            disabled ||
                                            Boolean(item.locked) ||
                                            trip.state === "COMPLETED"
                                          }
                                          onClick={() =>
                                            void mutate({
                                              path: `${base}/snapshots/refresh`,
                                              method: "POST",
                                              body: { item_ids: [id] },
                                            })
                                          }
                                        >
                                          Cập nhật thông tin địa điểm
                                        </button>
                                        <button
                                          type="button"
                                          disabled={
                                            disabled || Boolean(item.locked)
                                          }
                                          className="tp-danger"
                                          onClick={() => {
                                            if (
                                              window.confirm(
                                                `Bỏ ${name} khỏi ngày tham quan?`,
                                              )
                                            )
                                              void mutate({
                                                path: `${dayBase}/items/${id}`,
                                                method: "DELETE",
                                              });
                                          }}
                                        >
                                          Bỏ khỏi lịch trình
                                        </button>
                                      </details>
                                    </div>
                                  </div>

                                  {isSelected && (
                                    <div className="tp-item-drawer">
                                      <ItemEditor
                                        key={`${id}-${editorGeneration}`}
                                        item={item}
                                        disabled={
                                          busy ||
                                          loading ||
                                          ["saving", "failed", "conflict"].includes(
                                            sync,
                                          )
                                        }
                                        onDirty={() => {
                                          dirtyEditors.current.add(id);
                                          setSync("editing");
                                        }}
                                        onSave={(body) => itemChange(item, body)}
                                      />
                                      <div className="tp-reorder">
                                        <span>
                                          {item.locked
                                            ? "Giữ nguyên vị trí"
                                            : "Kéo để sắp xếp hoặc"}
                                        </span>
                                        <button
                                          type="button"
                                          aria-label={`Đưa ${name} lên`}
                                          disabled={
                                            disabled ||
                                            index === 0 ||
                                            Boolean(item.locked) ||
                                            Boolean(items[index - 1]?.locked)
                                          }
                                          onClick={() =>
                                            reorder(index, index - 1)
                                          }
                                        >
                                          ↑ Lên
                                        </button>
                                        <button
                                          type="button"
                                          aria-label={`Đưa ${name} xuống`}
                                          disabled={
                                            disabled ||
                                            index === items.length - 1 ||
                                            Boolean(item.locked) ||
                                            Boolean(items[index + 1]?.locked)
                                          }
                                          onClick={() =>
                                            reorder(index, index + 1)
                                          }
                                        >
                                          ↓ Xuống
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </article>

                              {/* Minimal Inline Travel Leg Connector */}
                              {index < items.length - 1 && (
                                <div
                                  data-testid="travel-leg"
                                  data-leg-id={leg?.leg_id}
                                  className="tp-leg"
                                >
                                  <span
                                    className="tp-leg-line"
                                    aria-hidden="true"
                                  />
                                  <div className="tp-leg-inline">
                                    <span className="tp-leg-meta" role="status">
                                      <Icon name="route" size={12} />
                                      {!leg || leg.status === "PENDING"
                                        ? "Đang tính tuyến…"
                                        : leg.status === "SELF_MANAGED"
                                          ? "Tự di chuyển"
                                          : leg.status === "FAILED"
                                            ? "Chưa tính được tuyến"
                                            : `${leg.duration_seconds == null ? "—" : `${Math.ceil(Number(leg.duration_seconds) / 60)} phút`}${leg.distance_m == null ? "" : ` · ${(Number(leg.distance_m) / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`}${leg.fallback ? " (chim bay)" : ""}`}
                                    </span>

                                    <div className="tp-leg-select">
                                      <RoundedSelect
                                        label={`Phương tiện từ ${name}`}
                                        compact
                                        fitContent
                                        pill
                                        value={String(leg?.mode ?? "DRIVE")}
                                        disabled={disabled || !leg}
                                        onChange={(modeValue) =>
                                          void mutate({
                                            path: `${dayBase}/travel-legs/${String(leg?.leg_id)}`,
                                            body: { mode: modeValue },
                                          })
                                        }
                                        options={Object.entries(modes).map(
                                          ([value, label]) => ({
                                            value,
                                            label,
                                          }),
                                        )}
                                      />
                                    </div>

                                    {(leg?.status === "FAILED" ||
                                      leg?.status === "FALLBACK") && (
                                      <button
                                        type="button"
                                        className="tp-leg-retry"
                                        disabled={disabled}
                                        onClick={() =>
                                          void mutate({
                                            path: `${dayBase}/travel-legs/${String(leg.leg_id)}`,
                                            body: { mode: leg.mode },
                                          })
                                        }
                                      >
                                        Tính lại
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {!!items.length && (
                        <button
                          type="button"
                          className="tp-add-place"
                          onClick={openPlaceExplorer}
                        >
                          + Thêm địa điểm vào ngày
                        </button>
                      )}
                    </section>
                  ) : (
                    /* CATALOG PLACE DISCOVERY DRAWER INSIDE LEFT PANE */
                    <aside className="tp-explore">
                      <div className="tp-explore-header">
                        <button
                          type="button"
                          className="tp-back-timeline"
                          onClick={() => {
                            setLeftMode("timeline");
                            setMobileView("timeline");
                          }}
                        >
                          <Icon name="arrowLeft" size={15} />
                          <span>Quay lại lịch trình</span>
                        </button>
                        <span className="tp-day-eyebrow">
                          {day
                            ? `THÊM VÀO NGÀY ${activeDayIndex + 1}`
                            : "CHỌN NGÀY TRƯỚC"}
                        </span>
                      </div>

                      <div className="tp-explore-heading">
                        <h3>Đi đâu hôm nay?</h3>
                        <Icon name="compass" size={18} />
                      </div>

                      <label>
                        Tìm địa điểm
                        <input
                          type="search"
                          value={query}
                          placeholder="Tên địa điểm, thành phố…"
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>

                      <div className="tp-filters">
                        <div className="tp-field">
                          <label htmlFor="tp-filter-category">Danh mục</label>
                          <RoundedSelect
                            id="tp-filter-category"
                            label="Danh mục"
                            compact
                            value={category}
                            onChange={setCategory}
                            options={[
                              { value: "", label: "Tất cả danh mục" },
                              ...categories.map((row) => ({
                                value: String(row.category_id ?? row.id),
                                label: String(row.name),
                              })),
                            ]}
                          />
                        </div>
                        <div className="tp-field">
                          <label htmlFor="tp-filter-destination">Điểm đến</label>
                          <RoundedSelect
                            id="tp-filter-destination"
                            label="Điểm đến"
                            compact
                            value={destination}
                            onChange={setDestination}
                            options={[
                              { value: "", label: "Tất cả điểm đến" },
                              ...destinations.map((row) => ({
                                value: String(row.destination_id ?? row.id),
                                label: String(row.name),
                              })),
                            ]}
                          />
                        </div>
                      </div>

                      {placeError && (
                        <p role="alert">
                          {placeError}
                          <button type="button" onClick={() => void findPlaces()}>
                            Thử tải địa điểm lại
                          </button>
                        </p>
                      )}
                      {finding && <p role="status">Đang tìm địa điểm…</p>}

                      <div className="tp-place-list">
                        {hydratedPlaces.map((place) => {
                          const added = items.some(
                              (item) => String(item.place_id) === rowId(place),
                            );
                          return (
                            <article className="tp-place" key={rowId(place)}>
                              <PlacePhoto place={place} />
                              <div>
                                <h4>{String(place.name)}</h4>
                                <p>
                                  {String(
                                    place.address ??
                                      place.destination_name ??
                                      "",
                                  )}
                                </p>
                                <button
                                  type="button"
                                  disabled={disabled || !day || added}
                                  onClick={() =>
                                    void mutate({
                                      path: `${dayBase}/items`,
                                      method: "POST",
                                      body: {
                                        place_id: rowId(place),
                                        locked: false,
                                        recommendation_request_id: null,
                                        duration_minutes: 120,
                                        note: `Ghé thăm ${String(place.name)}`,
                                      },
                                      after: async () => {
                                        setNotice(
                                          `Đã thêm ${String(place.name)}. Tuyến di chuyển được cập nhật tự động.`,
                                        );
                                        setLeftMode("timeline");
                                        setMobileView("timeline");
                                      },
                                    })
                                  }
                                >
                                  {added
                                    ? "✓ Đã có trong ngày"
                                    : "+ Thêm vào ngày"}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>

                      {!finding && !places.length && !placeError && (
                        <p className="tp-empty">
                          Chưa tìm thấy địa điểm. Thử tên khác hoặc bỏ bộ lọc.
                        </p>
                      )}
                      {cursor && (
                        <button
                          type="button"
                          className="tp-load-more-places"
                          disabled={finding}
                          onClick={() => void findPlaces(cursor)}
                        >
                          Xem thêm địa điểm
                        </button>
                      )}
                      {!day && (
                        <p className="tp-hint">
                          Thêm hoặc chọn ngày trước khi thêm địa điểm.
                        </p>
                      )}
                    </aside>
                  )}
                </div>

                {/* RIGHT COLUMN: FULL-BLEED INTERACTIVE ROUTE MAP */}
                <aside className="tp-map-pane">
                  <TripMap
                    items={hydratedItems}
                    legs={legs}
                    selected={selectedItem}
                    onSelect={setSelectedItem}
                    dayNumber={activeDayIndex + 1}
                    disabled={disabled}
                    onToggleLock={(item) =>
                      itemChange(item, { locked: !item.locked })
                    }
                  />
                </aside>
              </div>
            </>
          )}

          {!trip && !loading && !newTrip && (
            <div className="tp-timeline-empty tp-empty-studio">
              <Icon name="route" size={44} />
              <h3>
                {trips.length
                  ? "Mở một chuyến đi để tiếp tục."
                  : "Chưa có chuyến đi nào."}
              </h3>
              <p>Chọn chuyến đi ở trên hoặc tạo một hành trình mới.</p>
              <button
                type="button"
                className="tp-primary"
                onClick={() => setNewTrip(true)}
              >
                + Chuyến đi mới
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IntercityTransfers({
  travel,
  trip,
  disabled,
  mutate,
}: {
  travel: TravelClient;
  trip: Resource;
  disabled: boolean;
  mutate: (operation: Operation) => Promise<void>;
}) {
  const [items, setItems] = useState<Resource[]>([]),
    [transfers, setTransfers] = useState<Resource[]>([]),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<Resource | null>(null);
  const base = `/trips/${rowId(trip)}/transfers`;

  useEffect(() => {
    let active = true;
    void Promise.all([
      travel.readAll("trip", base),
      travel
        .readAll("trip", `/trips/${rowId(trip)}/days`)
        .then(async (data) => {
          const pages = await Promise.all(
            data.items.map((day) =>
              travel.readAll(
                "trip",
                `/trips/${rowId(trip)}/days/${rowId(day)}/items`,
              ),
            ),
          );
          return pages.flatMap((page) => page.items);
        }),
    ])
      .then(([rows, endpoints]) => {
        if (active) {
          setTransfers(rows.items);
          setItems(endpoints);
          setError("");
        }
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [travel, trip.version]);

  return (
    <section className="tp-intercity">
      <h4>Chặng di chuyển riêng</h4>
      <p className="tp-hint">
        Giữ các chặng đã tạo trước đây hoặc thêm chặng tùy chọn. Các tuyến liền
        nhau trong ngày được quản lý tự động ở lịch trình.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        key={String(editing?.transfer_id ?? "new")}
        className="tp-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          if (form.get("from") === form.get("to")) {
            setError("Chọn hai điểm khác nhau.");
            return;
          }
          void mutate({
            path: `${base}${editing ? `/${String(editing.transfer_id)}` : ""}`,
            method: editing ? "PATCH" : "POST",
            body: {
              from_item_id: form.get("from"),
              to_item_id: form.get("to"),
              mode: form.get("mode"),
            },
            after: async () => {
              setEditing(null);
            },
          });
        }}
      >
        <div className="tp-field">
          <label htmlFor="tp-transfer-from">Điểm đi</label>
          <RoundedSelect
            id="tp-transfer-from"
            name="from"
            label="Điểm đi"
            required
            defaultValue={String(editing?.from_item_id ?? "")}
            placeholder="Chọn điểm"
            options={[
              { value: "", label: "Chọn điểm" },
              ...items.map((item) => ({
                value: rowId(item),
                label: placeName(item),
              })),
            ]}
          />
        </div>
        <div className="tp-field">
          <label htmlFor="tp-transfer-to">Điểm đến</label>
          <RoundedSelect
            id="tp-transfer-to"
            name="to"
            label="Điểm đến"
            required
            defaultValue={String(editing?.to_item_id ?? "")}
            placeholder="Chọn điểm"
            options={[
              { value: "", label: "Chọn điểm" },
              ...items.map((item) => ({
                value: rowId(item),
                label: placeName(item),
              })),
            ]}
          />
        </div>
        <div className="tp-field">
          <label htmlFor="tp-transfer-mode">Phương tiện</label>
          <RoundedSelect
            id="tp-transfer-mode"
            name="mode"
            label="Phương tiện"
            defaultValue={String(editing?.mode ?? "DRIVE")}
            options={[
              { value: "DRIVE", label: "Ô tô" },
              { value: "WALK", label: "Đi bộ" },
              { value: "BICYCLE", label: "Xe đạp" },
            ]}
          />
        </div>
        <button type="submit" disabled={disabled || items.length < 2}>
          {editing ? "Cập nhật chặng riêng" : "Thêm chặng riêng"}
        </button>
        {editing && (
          <button type="button" onClick={() => setEditing(null)}>
            Hủy chỉnh sửa
          </button>
        )}
      </form>
      {transfers.map((row) => (
        <article key={String(row.transfer_id)}>
          <p>
            {placeName(
              items.find((item) => rowId(item) === row.from_item_id) ?? {},
            )}{" "}
            →{" "}
            {placeName(
              items.find((item) => rowId(item) === row.to_item_id) ?? {},
            )}{" "}
            · {modes[String(row.mode)] ?? String(row.mode)} ·{" "}
            {row.distance_m == null
              ? "Chưa có khoảng cách"
              : `${Number(row.distance_m).toLocaleString("vi-VN")} m`}
            {row.fallback ? " đường chim bay" : ""}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setEditing(row)}
          >
            Sửa chặng riêng
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (window.confirm("Xóa chặng di chuyển riêng này?"))
                void mutate({
                  path: `${base}/${String(row.transfer_id)}`,
                  method: "DELETE",
                });
            }}
          >
            Xóa chặng riêng
          </button>
        </article>
      ))}
    </section>
  );
}
