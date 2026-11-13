import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../../shared/ui";
import {
  ApiError,
  type TravelClient,
  type Resource,
  type Page,
} from "../../shared/api";
import { TripDestinations } from "./TripDestinations";
import { TripMap, rowId, snapshot, placeName, imageUrl } from "./TripMap";
import "./trip-planner.css";
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
    [mobileView, setMobileView] = useState("timeline"),
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
  ) {
    const selectedId = rowId(selected);
    dayRef.current = selectedId;
    setDay(selected);
    setItems([]);
    setLegs([]);
    setSelectedItem("");
    remember(id, selectedId);
    const [detail, rows, segments] = await Promise.all([
      travel.read<Resource>("trip", `/trips/${id}/days/${selectedId}`),
      travel.readAll("trip", `/trips/${id}/days/${selectedId}/items`),
      travel.readAll("trip", `/trips/${id}/days/${selectedId}/travel-legs`),
    ]);
    if (generation !== request.current || dayRef.current !== selectedId) return;
    setDay(detail);
    setItems(rows.items);
    setLegs(segments.items);
  }
  async function openTrip(value: Resource, preferredDay = "") {
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
      const [detail, rows] = await Promise.all([
        travel.read<Resource>("trip", `/trips/${id}`),
        travel.readAll("trip", `/trips/${id}/days`),
      ]);
      if (generation !== request.current) return;
      applyTrip(detail);
      setDays(rows.items);
      const selected =
        rows.items.find((row) => rowId(row) === preferredDay) ?? rows.items[0];
      if (selected) await loadDay(id, selected, generation);
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
      const data = await travel.readAll("trip", "/me/trips");
      setTrips(data.items);
      let remembered: { tripId?: string; dayId?: string } = {};
      try {
        remembered = JSON.parse(
          sessionStorage.getItem("smarttravel-planner-selection") ?? "{}",
        );
      } catch {
        /* No selection. */
      }
      const selected = data.items.find(
        (row) => rowId(row) === remembered.tripId,
      );
      if (selected) await openTrip(selected, remembered.dayId);
      else if (!data.items.length) setNewTrip(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void loadTrips();
    void travel
      .readAll("catalog", "/categories")
      .then((data) => setCategories(data.items))
      .catch(() => {});
    void travel
      .readAll("catalog", "/destinations")
      .then((data) => setDestinations(data.items))
      .catch(() => {});
    return () => {
      request.current++;
    };
  }, [travel]);
  useEffect(() => {
    let active = true;
    setTripDestinations([]);
    if (tripId)
      void travel
        .readAll("trip", `${base}/destinations`)
        .then((data) => {
          if (active) setTripDestinations(data.items);
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
  async function findPlaces(next?: string) {
    const generation = ++searchRequest.current;
    setFinding(true);
    setPlaceError("");
    try {
      const params = new URLSearchParams({ limit: "12" });
      if (query.trim()) params.set("q", query.trim());
      if (category) params.set("categoryId", category);
      if (destination) params.set("destinationId", destination);
      if (next) params.set("cursor", next);
      const data = await travel.read<Page>("catalog", `/places?${params}`);
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
          // Reconcile a previously confirmed destination after a lost response,
          // rather than creating it again when the user explicitly retries.
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
      ? "Thay đổi đang chờ lưu…"
      : sync === "saving"
        ? "Đang lưu…"
        : sync === "saved"
          ? "Đã lưu"
          : sync === "failed"
            ? "Lưu chưa thành công"
            : sync === "conflict"
              ? "Có phiên bản mới"
              : "Mọi thay đổi được lưu tự động";
  return (
    <div className="tp-planner">
      <div className="tp-topbar">
        <div>
          <span className="tp-eyebrow">HÀNH TRÌNH CỦA BẠN</span>
          <h2>{trip ? "Không gian lập lịch trình" : "Chuyến đi của bạn"}</h2>
        </div>
        <button
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
      {suggestedPlace && (
        <p className="tp-banner">
          Chọn chuyến đi và ngày để thêm{" "}
          <strong>{String(suggestedPlace.name)}</strong>.
        </p>
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
            <button onClick={() => void reloadConflict()} disabled={loading}>
              Tải phiên bản mới
            </button>
          ) : failed.current ? (
            <button
              disabled={loading}
              onClick={() => {
                if (failed.current) void mutate(failed.current);
              }}
            >
              Thử lưu lại
            </button>
          ) : (
            <button
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
          {notice}
          <button aria-label="Đóng thông báo" onClick={() => setNotice("")}>
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
            <label>
              Điểm đến ban đầu (không bắt buộc)
              <select
                name="destination"
                aria-label="Điểm đến ban đầu (không bắt buộc)"
                defaultValue=""
              >
                <option value="">Chọn sau</option>
                {destinations.map((destination) => (
                  <option
                    key={String(destination.destination_id ?? destination.id)}
                    value={String(destination.destination_id ?? destination.id)}
                  >
                    {String(destination.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tiền tệ
              <select name="currency" defaultValue="VND">
                <option value="VND">VND — Việt Nam đồng</option>
              </select>
            </label>
            <button className="tp-primary" disabled={sync === "saving" || busy}>
              Tạo chuyến đi
            </button>
          </form>
        </section>
      )}
      {!!trips.length && (
        <section className="tp-trip-picker-section" aria-labelledby="created-trips-heading">
          <h2 id="created-trips-heading">Các chuyến đi đã tạo</h2>
          <nav className="tp-trip-picker" aria-label="Chọn chuyến đi">
            <label>
              Chuyến đi
              <select
                aria-label="Chọn chuyến đi"
                disabled={disabled}
                value={tripId}
                onChange={(e) => {
                  const value = trips.find(
                    (row) => rowId(row) === e.target.value,
                  );
                  if (value) void openTrip(value);
                }}
              >
                <option value="">Chọn chuyến đi của bạn</option>
                {trips.map((row) => (
                  <option key={rowId(row)} value={rowId(row)}>
                    {String(row.name)}
                  </option>
                ))}
              </select>
            </label>
            {!trip &&
              trips.slice(0, 4).map((row) => (
                <button
                  disabled={disabled}
                  key={rowId(row)}
                  onClick={() => void openTrip(row)}
                >
                  {String(row.name)} →
                </button>
              ))}
          </nav>
        </section>
      )}
      {loading && (
        <p role="status" className="tp-loading">
          Đang tải lịch trình…
        </p>
      )}
      {trip && !newTrip && (
        <>
          <header className="tp-overview">
            <div>
              <span className="tp-eyebrow">
                CHUYẾN ĐI · {states[String(trip.state)] ?? String(trip.state)}
              </span>
              <h2>{String(trip.name)}</h2>
              <div className="tp-overview-meta">
                <span>
                  {tripDestinations.length
                    ? tripDestinations
                        .map((segment) =>
                          String(
                            destinations.find(
                              (destination) =>
                                String(
                                  destination.destination_id ?? destination.id,
                                ) === String(segment.destination_id),
                            )?.name ?? "Điểm đến đã lưu",
                          ),
                        )
                        .join(" · ")
                    : "Chưa chọn điểm đến"}
                </span>
                <span>
                  <Icon name="calendar" size={17} />
                  {dateLabel(trip.start_date)} — {dateLabel(trip.end_date)}
                </span>
                <span>
                  {trip.budget == null
                    ? "Chưa đặt ngân sách"
                    : `${Number(trip.budget).toLocaleString("vi-VN")} ${String(trip.currency ?? "VND")}`}
                </span>
              </div>
            </div>
            <div className="tp-overview-actions">
              <span
                data-testid="trip-save-status"
                className={`tp-sync tp-sync-${sync}`}
                role="status"
              >
                {sync === "saved" ? "✓ " : ""}
                {status}
              </span>
              <button
                disabled={disabled}
                onClick={() => setSettings(!settings)}
                aria-expanded={settings}
              >
                <Icon name="settings" size={18} /> Cài đặt chuyến đi
              </button>
            </div>
          </header>
          {settings && (
            <section className="tp-settings" aria-label="Cài đặt chuyến đi">
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
                <button className="tp-primary" disabled={disabled}>
                  Áp dụng thay đổi
                </button>
              </form>
              <label>
                Trạng thái chuyến đi
                <select
                  value={String(trip.state)}
                  disabled={disabled}
                  onChange={(e) =>
                    void mutate({
                      path: `${base}/state`,
                      method: "PUT",
                      body: { state: e.target.value },
                    })
                  }
                >
                  {Object.entries(states).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
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
          <section className="tp-days" aria-label="Ngày tham quan">
            <div role="tablist" aria-label="Danh sách ngày trong lịch trình">
              {days.map((value, index) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={rowId(value) === dayId}
                  key={rowId(value)}
                  disabled={disabled}
                  onClick={() => void chooseDay(value)}
                >
                  <small>NGÀY {index + 1}</small>
                  <strong>{dateLabel(value.date)}</strong>
                </button>
              ))}
            </div>
            <button
              disabled={disabled}
              onClick={() => setAddingDay(!addingDay)}
              aria-expanded={addingDay}
            >
              + Thêm ngày
            </button>
          </section>
          {(addingDay || !days.length) && (
            <form
              className="tp-add-day"
              onSubmit={(e) => {
                e.preventDefault();
                const date = String(new FormData(e.currentTarget).get("date"));
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
                <p>Chỉ những ngày bạn chọn mới có trong lịch trình.</p>
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
              <button className="tp-primary" disabled={disabled}>
                Thêm ngày
              </button>
            </form>
          )}
          <div className="tp-mobile-tabs" aria-label="Khu vực lập lịch trình">
            {[
              ["timeline", "Lịch trình"],
              ["explore", "Thêm địa điểm"],
              ["map", "Bản đồ"],
            ].map(([value, label]) => (
              <button
                aria-pressed={mobileView === value}
                key={value}
                onClick={() => setMobileView(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={`tp-workspace tp-view-${mobileView}`}>
            <aside className="tp-explore tp-panel">
              <div className="tp-section-heading">
                <div>
                  <span className="tp-eyebrow">KHÁM PHÁ</span>
                  <h3>Đi đâu hôm nay?</h3>
                </div>
                <Icon name="compass" size={23} />
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
                <label>
                  Danh mục
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Tất cả danh mục</option>
                    {categories.map((row) => (
                      <option
                        key={String(row.category_id ?? row.id)}
                        value={String(row.category_id ?? row.id)}
                      >
                        {String(row.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Điểm đến
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    <option value="">Tất cả điểm đến</option>
                    {destinations.map((row) => (
                      <option
                        key={String(row.destination_id ?? row.id)}
                        value={String(row.destination_id ?? row.id)}
                      >
                        {String(row.name)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {placeError && (
                <p role="alert">
                  {placeError}
                  <button onClick={() => void findPlaces()}>
                    Thử tải địa điểm lại
                  </button>
                </p>
              )}
              {finding && <p role="status">Đang tìm địa điểm…</p>}
              <div className="tp-place-list">
                {places.map((place) => {
                  const picture = imageUrl(place),
                    added = items.some(
                      (item) => String(item.place_id) === rowId(place),
                    );
                  return (
                    <article className="tp-place" key={rowId(place)}>
                      {picture && <img src={picture} alt="" loading="lazy" />}
                      <div>
                        <h4>{String(place.name)}</h4>
                        <p>
                          {String(
                            place.address ?? place.destination_name ?? "",
                          )}
                        </p>
                        <button
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
                              },
                            })
                          }
                        >
                          {added ? "✓ Đã có trong ngày" : "+ Thêm vào ngày"}
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
            <section
              className="tp-timeline tp-panel"
              aria-label="Lịch trình theo ngày"
            >
              <div className="tp-section-heading">
                <div>
                  <span className="tp-eyebrow">LỊCH TRÌNH CỦA BẠN</span>
                  <h3>
                    {day
                      ? `Ngày ${dateLabel(day.date)}`
                      : "Chọn một ngày để bắt đầu"}
                  </h3>
                  <p>
                    {items.length} điểm dừng ·{" "}
                    {items.reduce(
                      (total, item) =>
                        total + Number(item.duration_minutes ?? 0),
                      0,
                    )}{" "}
                    phút tham quan
                  </p>
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
                            date: new FormData(e.currentTarget).get("date"),
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
                      <button disabled={disabled}>Áp dụng ngày</button>
                    </form>
                    <button
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
                          void mutate({ path: dayBase, method: "DELETE" });
                      }}
                    >
                      Xóa ngày tham quan
                    </button>
                  </details>
                )}
              </div>
              {!items.length && (
                <div className="tp-timeline-empty">
                  <Icon name="route" size={38} />
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
                      className="tp-primary"
                      onClick={() => setMobileView("explore")}
                    >
                      + Khám phá địa điểm
                    </button>
                  )}
                </div>
              )}
              {items.map((item, index) => {
                const name = placeName(item),
                  picture = imageUrl(snapshot(item)),
                  leg = legs.find(
                    (row) =>
                      String(row.from_item_id) === rowId(item) &&
                      String(row.to_item_id) === rowId(items[index + 1] ?? {}),
                  );
                return (
                  <div key={rowId(item)}>
                    <article
                      data-testid="trip-timeline-item"
                      data-item-id={rowId(item)}
                      className={`tp-item ${selectedItem === rowId(item) ? "is-selected" : ""}`}
                      draggable={!disabled && !item.locked}
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
                      <button
                        className="tp-number"
                        aria-label={`Xem ${name} trên bản đồ`}
                        onClick={() => setSelectedItem(rowId(item))}
                      >
                        {index + 1}
                      </button>
                      <div className="tp-item-content">
                        <div className="tp-item-title">
                          {picture && (
                            <img src={picture} alt="" loading="lazy" />
                          )}
                          <div>
                            <button
                              className="tp-place-name"
                              onClick={() => setSelectedItem(rowId(item))}
                            >
                              {name}
                            </button>
                            <p>{String(snapshot(item).address ?? "")}</p>
                            {item.locked ? (
                              <span className="tp-locked">
                                Đã khóa · mở khóa để chỉnh sửa
                              </span>
                            ) : null}
                            {snapshot(item).status === "ARCHIVED" && (
                              <span className="tp-warning">
                                Địa điểm không còn khả dụng. Thông tin đã lưu
                                vẫn được giữ.
                              </span>
                            )}
                          </div>
                          <details className="tp-item-menu">
                            <summary aria-label={`Thao tác ${name}`}>
                              •••
                            </summary>
                            <button
                              disabled={disabled}
                              onClick={() =>
                                itemChange(item, { locked: !item.locked })
                              }
                            >
                              {item.locked
                                ? "Mở khóa địa điểm"
                                : "Khóa địa điểm"}
                            </button>
                            <button
                              disabled={
                                disabled ||
                                Boolean(item.locked) ||
                                trip.state === "COMPLETED"
                              }
                              onClick={() =>
                                void mutate({
                                  path: `${base}/snapshots/refresh`,
                                  method: "POST",
                                  body: { item_ids: [rowId(item)] },
                                })
                              }
                            >
                              Cập nhật thông tin địa điểm
                            </button>
                            <button
                              disabled={disabled || Boolean(item.locked)}
                              className="tp-danger"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Bỏ ${name} khỏi ngày tham quan?`,
                                  )
                                )
                                  void mutate({
                                    path: `${dayBase}/items/${rowId(item)}`,
                                    method: "DELETE",
                                  });
                              }}
                            >
                              Bỏ khỏi lịch trình
                            </button>
                          </details>
                        </div>
                        <ItemEditor
                          key={`${rowId(item)}-${editorGeneration}`}
                          item={item}
                          disabled={
                            busy ||
                            loading ||
                            ["saving", "failed", "conflict"].includes(sync)
                          }
                          onDirty={() => {
                            dirtyEditors.current.add(rowId(item));
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
                            aria-label={`Đưa ${name} lên`}
                            disabled={
                              disabled ||
                              index === 0 ||
                              Boolean(item.locked) ||
                              Boolean(items[index - 1]?.locked)
                            }
                            onClick={() => reorder(index, index - 1)}
                          >
                            ↑ Lên
                          </button>
                          <button
                            aria-label={`Đưa ${name} xuống`}
                            disabled={
                              disabled ||
                              index === items.length - 1 ||
                              Boolean(item.locked) ||
                              Boolean(items[index + 1]?.locked)
                            }
                            onClick={() => reorder(index, index + 1)}
                          >
                            ↓ Xuống
                          </button>
                        </div>
                      </div>
                    </article>
                    {index < items.length - 1 && (
                      <div
                        data-testid="travel-leg"
                        data-leg-id={leg?.leg_id}
                        className="tp-leg"
                      >
                        <span className="tp-leg-line">↓</span>
                        <div>
                          <label>
                            Di chuyển đến điểm tiếp theo
                            <select
                              aria-label={`Phương tiện từ ${name}`}
                              value={String(leg?.mode ?? "DRIVE")}
                              disabled={disabled || !leg}
                              onChange={(e) =>
                                void mutate({
                                  path: `${dayBase}/travel-legs/${String(leg?.leg_id)}`,
                                  body: { mode: e.target.value },
                                })
                              }
                            >
                              {Object.entries(modes).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <p role="status">
                            {!leg || leg.status === "PENDING"
                              ? "Đang tính tuyến… Lịch trình vẫn được lưu."
                              : leg.status === "SELF_MANAGED"
                                ? "Bạn tự sắp xếp đoạn này · không tính tuyến"
                                : leg.status === "FAILED"
                                  ? "Chưa tính được tuyến. Bạn vẫn có thể tiếp tục lập lịch trình."
                                  : `${leg.distance_m == null ? "Chưa có khoảng cách" : `${(Number(leg.distance_m) / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`}${leg.fallback ? " đường chim bay" : ""} · ${leg.duration_seconds == null ? "Chưa có thời gian di chuyển" : `khoảng ${Math.ceil(Number(leg.duration_seconds) / 60)} phút`}`}
                          </p>
                          {(leg?.status === "FAILED" ||
                            leg?.status === "FALLBACK") && (
                            <button
                              disabled={disabled}
                              onClick={() =>
                                void mutate({
                                  path: `${dayBase}/travel-legs/${String(leg.leg_id)}`,
                                  body: { mode: leg.mode },
                                })
                              }
                            >
                              Thử tính tuyến lại
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!!items.length && (
                <button
                  className="tp-add-place"
                  onClick={() => {
                    setMobileView("explore");
                    document
                      .querySelector<HTMLInputElement>(
                        ".tp-explore input[type=search]",
                      )
                      ?.focus();
                  }}
                >
                  + Thêm địa điểm vào ngày
                </button>
              )}
            </section>
            <aside className="tp-map tp-panel">
              <div className="tp-section-heading">
                <div>
                  <span className="tp-eyebrow">THEO DẤU HÀNH TRÌNH</span>
                  <h3>Bản đồ trong ngày</h3>
                </div>
                <Icon name="map" size={23} />
              </div>
              <TripMap
                items={items}
                legs={legs}
                selected={selectedItem}
                onSelect={setSelectedItem}
              />
              <div className="tp-map-key">
                <span className="tp-key-dot" />
                Điểm dừng theo thứ tự của bạn
              </div>
              <p className="tp-hint">
                Thời gian di chuyển là ước tính, chưa bao gồm thời gian tham
                quan.
              </p>
            </aside>
          </div>
        </>
      )}
      {!trip && !loading && !newTrip && (
        <div className="tp-timeline-empty">
          <Icon name="route" size={44} />
          <h3>
            {trips.length
              ? "Mở một chuyến đi để tiếp tục."
              : "Chưa có chuyến đi nào."}
          </h3>
          <p>Chọn chuyến đi ở trên hoặc tạo một hành trình mới.</p>
          <button className="tp-primary" onClick={() => setNewTrip(true)}>
            + Chuyến đi mới
          </button>
        </div>
      )}
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
        nhau trong ngày được quản lý tự động ở lịch trình. Phương tiện chặng
        riêng theo khả năng API hiện có.
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
        <label>
          Điểm đi
          <select
            name="from"
            required
            defaultValue={String(editing?.from_item_id ?? "")}
          >
            <option value="">Chọn điểm</option>
            {items.map((item) => (
              <option key={rowId(item)} value={rowId(item)}>
                {placeName(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Điểm đến
          <select
            name="to"
            required
            defaultValue={String(editing?.to_item_id ?? "")}
          >
            <option value="">Chọn điểm</option>
            {items.map((item) => (
              <option key={rowId(item)} value={rowId(item)}>
                {placeName(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Phương tiện
          <select name="mode" defaultValue={String(editing?.mode ?? "DRIVE")}>
            <option value="DRIVE">Ô tô</option>
            <option value="WALK">Đi bộ</option>
            <option value="BICYCLE">Xe đạp</option>
          </select>
        </label>
        <button disabled={disabled || items.length < 2}>
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
          <button disabled={disabled} onClick={() => setEditing(row)}>
            Sửa chặng riêng
          </button>
          <button
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
