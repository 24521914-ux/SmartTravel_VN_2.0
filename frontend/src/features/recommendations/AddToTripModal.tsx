import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, type Resource, type TravelClient } from '../../shared/api';
import { Icon, Modal, RoundedSelect } from '../../shared/ui';
import { useAuth } from '../../app/providers/AuthProvider';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import { useToast } from '../../app/providers/ToastProvider';
import { placeIdOf, placeImageCandidates } from '../places/media';

export interface AddToTripModalProps {
  place: Resource | null;
  travel: TravelClient;
  recommendationRequestId?: string | null;
  onClose: () => void;
  onNavigateToAccount: () => void;
  onOpenTrip: () => void;
}

type ModalStage =
  | 'guest'
  | 'loading-trips'
  | 'selecting'
  | 'confirming'
  | 'saving'
  | 'success'
  | 'error'
  | 'conflict';

const rowId = (row: Resource) => String(row.item_id ?? row.place_id ?? row.trip_id ?? row.day_id ?? row.id ?? '');
const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const formatDateLabel = (value: unknown) => {
  const raw = String(value ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.split('-').reverse().join('/') : raw;
};

export function AddToTripModal({
  place,
  travel,
  recommendationRequestId = null,
  onClose,
  onNavigateToAccount,
  onOpenTrip,
}: AddToTripModalProps) {
  const { isAuthenticated } = useAuth();
  const { locale, text } = useAppPreferences();
  const { showToast } = useToast();

  const placeId = place ? placeIdOf(place) : '';
  const placeName = place
    ? String(locale === 'en' ? place.name_en ?? place.name ?? '' : place.name_vi ?? place.name ?? '')
    : '';
  const placeAddress = place && typeof place.address === 'string' ? place.address : '';
  const placePhotos = place ? placeImageCandidates(place) : [];

  const [stage, setStage] = useState<ModalStage>('selecting');
  const [trips, setTrips] = useState<Resource[]>([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [days, setDays] = useState<Resource[]>([]);
  const [selectedDayId, setSelectedDayId] = useState('');
  const [dayItems, setDayItems] = useState<Resource[]>([]);
  const [loadingDays, setLoadingDays] = useState(false);

  const [durationMinutes, setDurationMinutes] = useState('120');
  const [note, setNote] = useState('');
  const [showCreateTrip, setShowCreateTrip] = useState(false);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [newDayDate, setNewDayDate] = useState(todayIso());
  const [creatingDay, setCreatingDay] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [photoFailed, setPhotoFailed] = useState(false);

  const selectedTrip = trips.find(t => rowId(t) === selectedTripId) ?? null;
  const selectedDay = days.find(d => rowId(d) === selectedDayId) ?? null;
  const selectedDayIndex = days.findIndex(d => rowId(d) === selectedDayId);
  const alreadyInDay = Boolean(placeId && dayItems.some(item => String(item.place_id) === placeId));

  async function loadDaysForTrip(tripId: string) {
    if (!tripId) {
      setDays([]);
      setSelectedDayId('');
      setDayItems([]);
      return;
    }
    setLoadingDays(true);
    try {
      const data = await travel.readAll('trip', `/trips/${encodeURIComponent(tripId)}/days`);
      setDays(data.items);
      const firstDayId = data.items[0] ? rowId(data.items[0]) : '';
      setSelectedDayId(firstDayId);
      if (firstDayId) {
        const itemsRes = await travel.readAll(
          'trip',
          `/trips/${encodeURIComponent(tripId)}/days/${encodeURIComponent(firstDayId)}/items`,
        );
        setDayItems(itemsRes.items);
      } else {
        setDayItems([]);
      }
    } catch (cause) {
      setErrorMessage((cause as Error).message || text('Chưa tải được danh sách ngày của chuyến đi.', 'Unable to load trip days.'));
    } finally {
      setLoadingDays(false);
    }
  }

  async function loadUserTrips() {
    setStage('loading-trips');
    setErrorMessage('');
    try {
      const data = await travel.readAll('trip', '/me/trips');
      setTrips(data.items);
      let rememberedTripId = '';
      try {
        const stored = JSON.parse(sessionStorage.getItem('smarttravel-planner-selection') ?? '{}') as { tripId?: string };
        rememberedTripId = stored.tripId ?? '';
      } catch {
        // Ignore storage errors
      }
      const initialTrip = data.items.find(t => rowId(t) === rememberedTripId) ?? data.items[0];
      if (initialTrip) {
        const initialId = rowId(initialTrip);
        setSelectedTripId(initialId);
        setNewDayDate(String(initialTrip.start_date ?? todayIso()));
        await loadDaysForTrip(initialId);
      } else {
        setSelectedTripId('');
        setDays([]);
        setSelectedDayId('');
        setShowCreateTrip(true);
      }
      setStage('selecting');
    } catch (cause) {
      setErrorMessage(
        cause instanceof ApiError && cause.status === 401
          ? text('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'Your session expired. Please sign in again.')
          : text('Không tải được danh sách chuyến đi. Hãy thử lại.', 'Unable to load your trips. Please try again.'),
      );
      setStage('error');
    }
  }

  useEffect(() => {
    if (!place) return;
    setPhotoFailed(false);
    setDurationMinutes('120');
    setNote(text(`Ghé thăm ${placeName}`, `Visit ${placeName}`));
    setShowCreateTrip(false);
    setErrorMessage('');
    setIdempotencyKey('');

    if (!isAuthenticated) {
      setStage('guest');
      return;
    }
    void loadUserTrips();
  }, [placeId, isAuthenticated]);

  async function handleSelectTrip(tripId: string) {
    setSelectedTripId(tripId);
    const chosen = trips.find(t => rowId(t) === tripId);
    if (chosen?.start_date) setNewDayDate(String(chosen.start_date));
    await loadDaysForTrip(tripId);
  }

  async function handleSelectDay(dayId: string) {
    setSelectedDayId(dayId);
    if (!selectedTripId || !dayId) {
      setDayItems([]);
      return;
    }
    try {
      const itemsRes = await travel.readAll(
        'trip',
        `/trips/${encodeURIComponent(selectedTripId)}/days/${encodeURIComponent(dayId)}/items`,
      );
      setDayItems(itemsRes.items);
    } catch {
      setDayItems([]);
    }
  }

  async function handleQuickCreateTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const startDate = String(form.get('start_date') ?? todayIso());
    const endDate = String(form.get('end_date') ?? startDate);
    if (!name || endDate < startDate) {
      setErrorMessage(text('Vui lòng nhập tên chuyến đi và khoảng ngày hợp lệ.', 'Please enter a valid trip name and date range.'));
      return;
    }
    setCreatingTrip(true);
    setErrorMessage('');
    try {
      const created = await travel.mutate<Resource>('trip', '/me/trips', {
        name,
        start_date: startDate,
        end_date: endDate,
        budget: 0,
        currency: 'VND',
        timezone: 'Asia/Ho_Chi_Minh',
      });
      const createdId = rowId(created);
      setTrips(prev => [created, ...prev.filter(t => rowId(t) !== createdId)]);
      setSelectedTripId(createdId);
      setNewDayDate(startDate);
      setShowCreateTrip(false);
      await loadDaysForTrip(createdId);
      showToast(text('Đã tạo chuyến đi mới.', 'Created new trip.'), 'success');
    } catch (cause) {
      setErrorMessage((cause as Error).message || text('Không thể tạo chuyến đi mới.', 'Could not create trip.'));
    } finally {
      setCreatingTrip(false);
    }
  }

  async function handleQuickAddDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTrip || !newDayDate) return;
    setCreatingDay(true);
    setErrorMessage('');
    try {
      const createdDay = await travel.mutate<Resource>(
        'trip',
        `/trips/${encodeURIComponent(selectedTripId)}/days`,
        { date: newDayDate },
        'POST',
        Number(selectedTrip.version),
      );
      const refreshedTrip = await travel.read<Resource>('trip', `/trips/${encodeURIComponent(selectedTripId)}`);
      setTrips(prev => prev.map(t => (rowId(t) === selectedTripId ? refreshedTrip : t)));
      await loadDaysForTrip(selectedTripId);
      const createdDayId = rowId(createdDay);
      if (createdDayId) setSelectedDayId(createdDayId);
    } catch (cause) {
      setErrorMessage((cause as Error).message || text('Không thể thêm ngày vào chuyến đi.', 'Could not add day to trip.'));
    } finally {
      setCreatingDay(false);
    }
  }

  function proceedToConfirm(event: FormEvent) {
    event.preventDefault();
    const durationNum = Number(durationMinutes);
    if (!selectedTripId || !selectedDayId || !Number.isInteger(durationNum) || durationNum < 0 || !note.trim()) {
      setErrorMessage(text('Vui lòng chọn chuyến đi, ngày, thời lượng hợp lệ và ghi chú.', 'Please choose a trip, day, valid duration, and note.'));
      return;
    }
    setErrorMessage('');
    setIdempotencyKey(crypto.randomUUID());
    setStage('confirming');
  }

  async function savePlaceToTrip(overrideVersion?: number) {
    if (!selectedTrip || !selectedDayId || !placeId) return;
    const key = idempotencyKey || crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(key);

    setStage('saving');
    setErrorMessage('');
    try {
      const version = overrideVersion ?? Number(selectedTrip.version);
      await travel.mutate<Resource>(
        'trip',
        `/trips/${encodeURIComponent(selectedTripId)}/days/${encodeURIComponent(selectedDayId)}/items`,
        {
          place_id: placeId,
          locked: false,
          recommendation_request_id: recommendationRequestId,
          duration_minutes: Number(durationMinutes),
          note: note.trim(),
        },
        'POST',
        version,
        key,
      );
      try {
        sessionStorage.setItem(
          'smarttravel-planner-selection',
          JSON.stringify({ tripId: selectedTripId, dayId: selectedDayId }),
        );
      } catch {
        // Ignore storage unavailable
      }
      setStage('success');
      showToast(
        text(`Đã thêm "${placeName}" vào chuyến đi.`, `Added "${placeName}" to your trip.`),
        'success',
      );
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 412)) {
        setErrorMessage(
          text(
            'Chuyến đi vừa được cập nhật ở nơi khác nên phiên bản đã thay đổi.',
            'This trip was updated elsewhere and its version changed.',
          ),
        );
        setStage('conflict');
        return;
      }
      if (cause instanceof ApiError && cause.status === 401) {
        setErrorMessage(text('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'Session expired. Please sign in again.'));
        setStage('error');
        return;
      }
      setErrorMessage(
        cause instanceof ApiError
          ? cause.message
          : text('Không thể lưu vào chuyến đi do lỗi kết nối. Bạn có thể bấm Thử lại.', 'Could not save to trip due to connection error. Please retry.'),
      );
      setStage('error');
    }
  }

  async function handleRefreshAndRetry() {
    if (!selectedTripId) {
      await loadUserTrips();
      return;
    }
    setStage('saving');
    try {
      const latestTrip = await travel.read<Resource>('trip', `/trips/${encodeURIComponent(selectedTripId)}`);
      setTrips(prev => prev.map(t => (rowId(t) === selectedTripId ? latestTrip : t)));
      setIdempotencyKey(crypto.randomUUID());
      await savePlaceToTrip(Number(latestTrip.version));
    } catch (cause) {
      setErrorMessage((cause as Error).message || text('Không thể tải lại phiên bản chuyến đi.', 'Failed to reload trip version.'));
      setStage('error');
    }
  }

  const stepIndex =
    stage === 'selecting' || stage === 'loading-trips'
      ? 1
      : stage === 'confirming' || stage === 'saving'
        ? 2
        : stage === 'success'
          ? 3
          : 2;

  return (
    <Modal
      isOpen={Boolean(place)}
      onClose={() => {
        if (stage !== 'saving') onClose();
      }}
      title={text('Thêm vào chuyến đi', 'Add to trip')}
      maxWidth="560px"
    >
      {place && (
        <div className="rec-trip-modal">
          {stage !== 'guest' && (
            <ol className="rec-trip-steps" aria-label={text('Tiến trình thêm vào chuyến đi', 'Add to trip progress')}>
              <li className={stepIndex >= 1 ? 'is-active' : ''}><span>1</span>{text('Chọn Trip', 'Select Trip')}</li>
              <li className={stepIndex >= 2 ? 'is-active' : ''}><span>2</span>{text('Xác nhận', 'Confirm')}</li>
              <li className={stage === 'success' ? 'is-done' : ''}><span>3</span>{text('Hoàn tất', 'Done')}</li>
            </ol>
          )}

          <div className="rec-trip-place-preview">
            {placePhotos[0] && !photoFailed ? (
              <img
                key={placeId}
                src={placePhotos[0]}
                alt={placeName}
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <div className="rec-trip-place-thumb-placeholder" aria-hidden="true">
                <Icon name="pin" size={20} />
              </div>
            )}
            <div>
              <strong>{placeName}</strong>
              {placeAddress && <span>{placeAddress}</span>}
            </div>
          </div>

          {stage === 'guest' && (
            <div className="rec-trip-state-box">
              <p>
                {text(
                  'Hãy đăng nhập để lưu địa điểm này vào lịch trình chuyến đi của bạn. Bộ lọc gợi ý hiện tại vẫn sẽ được giữ nguyên khi bạn quay lại.',
                  'Sign in to save this place into your personal trip itinerary.',
                )}
              </p>
              <div className="rec-trip-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  {text('Ở lại trang gợi ý', 'Stay here')}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    onClose();
                    onNavigateToAccount();
                  }}
                >
                  <Icon name="user" size={16} />
                  {text('Đăng nhập ngay', 'Sign in')}
                </button>
              </div>
            </div>
          )}

          {stage === 'loading-trips' && (
            <div className="rec-trip-state-box" role="status">
              <Icon name="refresh" size={22} className="rec-spin" />
              <p>{text('Đang tải danh sách chuyến đi của bạn…', 'Loading your trips…')}</p>
            </div>
          )}

          {stage === 'selecting' && (
            <div className="rec-trip-selecting">
              {errorMessage && (
                <div className="travel-error" role="alert">
                  {errorMessage}
                </div>
              )}

              {trips.length > 0 && !showCreateTrip ? (
                <form className="clay-form" onSubmit={proceedToConfirm}>
                  <div className="rec-trip-field-head">
                    <label htmlFor="rec-trip-select">{text('Chọn chuyến đi', 'Choose a trip')}</label>
                    <button
                      type="button"
                      className="rec-link-btn"
                      onClick={() => setShowCreateTrip(true)}
                    >
                      + {text('Tạo chuyến đi mới', 'Create new trip')}
                    </button>
                  </div>
                  <RoundedSelect
                    id="rec-trip-select"
                    label={text('Chọn chuyến đi', 'Choose a trip')}
                    value={selectedTripId}
                    onChange={val => void handleSelectTrip(val)}
                    required
                    options={trips.map(t => ({
                      value: rowId(t),
                      label: `${String(t.name)} (${formatDateLabel(t.start_date)} – ${formatDateLabel(t.end_date)})`,
                    }))}
                  />

                  {loadingDays ? (
                    <p className="rec-muted" role="status">{text('Đang tải các ngày trong chuyến đi…', 'Loading trip days…')}</p>
                  ) : days.length > 0 ? (
                    <div className="form-group">
                      <label htmlFor="rec-day-select">{text('Chọn ngày tham quan', 'Choose trip day')}</label>
                      <RoundedSelect
                        id="rec-day-select"
                        label={text('Chọn ngày tham quan', 'Choose trip day')}
                        value={selectedDayId}
                        onChange={val => void handleSelectDay(val)}
                        required
                        options={days.map((d, idx) => ({
                          value: rowId(d),
                          label: `${text(`Ngày ${idx + 1}`, `Day ${idx + 1}`)} · ${formatDateLabel(d.date)}`,
                        }))}
                      />
                    </div>
                  ) : (
                    <div className="rec-trip-empty-days">
                      <p>{text('Chuyến đi này chưa có ngày tham quan. Thêm một ngày để tiếp tục:', 'This trip has no days yet. Add a day to continue:')}</p>
                      <div className="rec-inline-row">
                        <input
                          type="date"
                          aria-label={text('Ngày tham quan', 'Day date')}
                          value={newDayDate}
                          onChange={e => setNewDayDate(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={creatingDay || !newDayDate}
                          onClick={e => void handleQuickAddDay(e as unknown as FormEvent<HTMLFormElement>)}
                        >
                          {creatingDay ? text('Đang thêm…', 'Adding…') : text('+ Thêm ngày', '+ Add day')}
                        </button>
                      </div>
                    </div>
                  )}

                  {alreadyInDay && (
                    <p className="rec-trip-warning" role="status">
                      <Icon name="alert" size={16} />
                      {text('Địa điểm này đã có trong ngày bạn chọn. Bạn vẫn có thể thêm lại nếu muốn.', 'This place is already in the selected day.')}
                    </p>
                  )}

                  <div className="rec-trip-row-2">
                    <label>
                      {text('Thời lượng (phút)', 'Duration (minutes)')}
                      <input
                        type="number"
                        min={0}
                        step={15}
                        value={durationMinutes}
                        onChange={e => setDurationMinutes(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      {text('Ghi chú cho điểm dừng', 'Visit note')}
                      <input
                        type="text"
                        maxLength={1024}
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        required
                      />
                    </label>
                  </div>

                  <div className="rec-trip-actions">
                    <button type="button" className="btn-secondary" onClick={onClose}>
                      {text('Hủy', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={!selectedTripId || !selectedDayId || loadingDays}
                    >
                      {text('Tiếp tục xác nhận', 'Review & Confirm')}
                      <Icon name="arrow" size={16} />
                    </button>
                  </div>
                </form>
              ) : (
                <form className="clay-form" onSubmit={e => void handleQuickCreateTrip(e)}>
                  <div className="rec-trip-field-head">
                    <strong>{text('Tạo nhanh chuyến đi mới', 'Quick create a trip')}</strong>
                    {trips.length > 0 && (
                      <button
                        type="button"
                        className="rec-link-btn"
                        onClick={() => setShowCreateTrip(false)}
                      >
                        {text('Chọn chuyến đi có sẵn', 'Choose existing trip')}
                      </button>
                    )}
                  </div>
                  <label>
                    {text('Tên chuyến đi', 'Trip name')}
                    <input
                      name="name"
                      required
                      maxLength={200}
                      placeholder={text('Ví dụ: Cuối tuần khám phá Đà Nẵng', 'e.g. Weekend in Da Nang')}
                    />
                  </label>
                  <div className="rec-trip-row-2">
                    <label>
                      {text('Ngày bắt đầu', 'Start date')}
                      <input name="start_date" type="date" required defaultValue={todayIso()} />
                    </label>
                    <label>
                      {text('Ngày kết thúc', 'End date')}
                      <input name="end_date" type="date" required defaultValue={todayIso()} />
                    </label>
                  </div>
                  <div className="rec-trip-actions">
                    <button type="button" className="btn-secondary" onClick={onClose}>
                      {text('Hủy', 'Cancel')}
                    </button>
                    <button type="submit" className="btn-primary" disabled={creatingTrip}>
                      {creatingTrip ? text('Đang tạo…', 'Creating…') : text('Tạo chuyến đi', 'Create trip')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {stage === 'confirming' && selectedTrip && selectedDay && (
            <div className="rec-trip-confirm">
              <div className="rec-trip-confirm-card">
                <p>{text('Xác nhận thêm địa điểm vào lịch trình:', 'Confirm adding this place to your itinerary:')}</p>
                <dl>
                  <div>
                    <dt>{text('Chuyến đi', 'Trip')}</dt>
                    <dd>{String(selectedTrip.name)}</dd>
                  </div>
                  <div>
                    <dt>{text('Ngày', 'Day')}</dt>
                    <dd>
                      {text(`Ngày ${selectedDayIndex + 1}`, `Day ${selectedDayIndex + 1}`)} · {formatDateLabel(selectedDay.date)}
                    </dd>
                  </div>
                  <div>
                    <dt>{text('Thời lượng dự kiến', 'Duration')}</dt>
                    <dd>{durationMinutes} {text('phút', 'min')}</dd>
                  </div>
                  <div>
                    <dt>{text('Ghi chú', 'Note')}</dt>
                    <dd>{note}</dd>
                  </div>
                </dl>
              </div>
              <div className="rec-trip-actions">
                <button type="button" className="btn-secondary" onClick={() => setStage('selecting')}>
                  <Icon name="arrowLeft" size={16} />
                  {text('Chỉnh lại', 'Back')}
                </button>
                <button type="button" className="btn-primary" onClick={() => void savePlaceToTrip()}>
                  <Icon name="check" size={16} />
                  {text('Xác nhận lưu', 'Confirm & Save')}
                </button>
              </div>
            </div>
          )}

          {stage === 'saving' && (
            <div className="rec-trip-state-box" role="status">
              <Icon name="refresh" size={26} className="rec-spin" />
              <strong>{text('Đang lưu vào chuyến đi…', 'Saving to your trip…')}</strong>
              <p>{text('Vui lòng đợi trong giây lát, không đóng hộp thoại này.', 'Please wait a moment while we update your itinerary.')}</p>
            </div>
          )}

          {stage === 'success' && (
            <div className="rec-trip-state-box is-success" role="status">
              <Icon name="checkCircle" size={34} />
              <strong>{text('Đã lưu thành công!', 'Saved to trip!')}</strong>
              <p>
                {text(
                  `“${placeName}” đã được thêm vào chuyến đi của bạn.`,
                  `“${placeName}” has been added to your itinerary.`,
                )}
              </p>
              <div className="rec-trip-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  {text('Tiếp tục xem gợi ý', 'Keep browsing')}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    onClose();
                    onOpenTrip();
                  }}
                >
                  <Icon name="route" size={16} />
                  {text('Mở chuyến đi', 'Open trip')}
                </button>
              </div>
            </div>
          )}

          {(stage === 'error' || stage === 'conflict') && (
            <div className="rec-trip-state-box is-error" role="alert">
              <Icon name="alert" size={32} />
              <strong>
                {stage === 'conflict'
                  ? text('Chuyến đi vừa có thay đổi mới', 'Trip version conflict')
                  : text('Lưu chưa thành công', 'Could not save to trip')}
              </strong>
              <p>{errorMessage}</p>
              <div className="rec-trip-actions">
                <button type="button" className="btn-secondary" onClick={() => setStage('selecting')}>
                  {text('Chọn lại', 'Change selection')}
                </button>
                {stage === 'conflict' ? (
                  <button type="button" className="btn-primary" onClick={() => void handleRefreshAndRetry()}>
                    <Icon name="refresh" size={16} />
                    {text('Cập nhật & Thử lại', 'Refresh & Retry')}
                  </button>
                ) : selectedTrip && selectedDayId ? (
                  <button type="button" className="btn-primary" onClick={() => void savePlaceToTrip()}>
                    <Icon name="refresh" size={16} />
                    {text('Thử lại', 'Retry')}
                  </button>
                ) : (
                  <button type="button" className="btn-primary" onClick={() => void loadUserTrips()}>
                    <Icon name="refresh" size={16} />
                    {text('Thử lại', 'Retry')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
