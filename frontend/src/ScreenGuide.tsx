import { Icon } from './Icon';

const guides: Record<string, { icon: string; title: string; text: string; steps: string[]; tone: string }> = {
  'Bản đồ': { icon: 'map', title: 'Một góc nhìn mới cho hành trình', text: 'Tìm địa điểm, xem vị trí rồi chọn điểm dừng phù hợp với bạn.', steps: ['Tìm điểm đến', 'Xem trên bản đồ', 'Khám phá xung quanh'], tone: 'mint' },
  'Bộ sưu tập': { icon: 'heart', title: 'Gom những nơi bạn muốn ghé', text: 'Một danh sách cho cuối tuần, một bộ sưu tập cho chuyến đi dài.', steps: ['Tạo bộ sưu tập', 'Thêm địa điểm', 'Chọn quyền chia sẻ'], tone: 'rose' },
  'Chuyến đi': { icon: 'calendar', title: 'Chuyến đi vui bắt đầu từ một kế hoạch', text: 'Tự sắp xếp từng ngày, thêm điểm dừng và xem lại các chặng di chuyển.', steps: ['Chọn ngày đi', 'Thêm điểm dừng', 'Sắp xếp lịch trình'], tone: 'peach' },
  'Thông báo': { icon: 'bell', title: 'Những cập nhật dành cho bạn', text: 'Theo dõi phản hồi, lời mời và những thay đổi trong hành trình.', steps: ['Xem cập nhật', 'Đọc nội dung', 'Đánh dấu đã đọc'], tone: 'lavender' },
  'Tài khoản': { icon: 'user', title: 'Một hành trình, mang dấu ấn của bạn', text: 'Lưu kế hoạch và cá nhân hóa trải nghiệm với tài khoản SmartTravel.', steps: ['Thông tin cá nhân', 'Sở thích du lịch', 'Quyền riêng tư'], tone: 'mint' },
  'Doanh nghiệp': { icon: 'building', title: 'Đưa trải nghiệm địa phương đến gần hơn', text: 'Một không gian để quản lý hồ sơ, thành viên và quyền sở hữu địa điểm.', steps: ['Hồ sơ doanh nghiệp', 'Xác minh thông tin', 'Quản lý địa điểm'], tone: 'peach' },
  'Kiểm duyệt': { icon: 'shield', title: 'Cùng giữ thông tin đáng tin cậy', text: 'Xem nội dung đóng góp và minh chứng trước khi đưa ra quyết định.', steps: ['Chọn hàng đợi', 'Đối chiếu nội dung', 'Gửi quyết định'], tone: 'mint' },
  'Quản trị': { icon: 'database', title: 'Dữ liệu tốt cho những hành trình hay', text: 'Theo dõi nguồn dữ liệu, kiểm tra lượt nhập và trạng thái xử lý.', steps: ['Chọn nguồn dữ liệu', 'Kiểm tra cấu hình', 'Theo dõi xử lý'], tone: 'lavender' },
  'Gợi ý': { icon: 'compass', title: 'Thêm cảm hứng cho chuyến đi', text: 'Khám phá những địa điểm được gợi ý theo sở thích của bạn.', steps: ['Xem gợi ý', 'Khám phá địa điểm', 'Thêm vào chuyến đi'], tone: 'peach' },
};

export function ScreenGuide({ section }: { section: string }) {
  const guide = guides[section];
  if (!guide) return null;
  return <aside className={`screen-guide ${guide.tone}`} aria-label={`Hướng dẫn ${section.toLowerCase()}`}>
    <div className="guide-symbol"><Icon name={guide.icon} size={38} /></div>
    <div className="guide-copy"><h2>{guide.title}</h2><p>{guide.text}</p></div>
    <ol>{guide.steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
  </aside>;
}

export function EmptyScreen({ section, failed, guest, onLogin }: { section: string; failed: boolean; guest: boolean; onLogin: () => void }) {
  const content: Record<string, [string, string, string]> = {
    'Bộ sưu tập': ['heart', 'Những nơi yêu thích sẽ ở đây', 'Tạo bộ sưu tập đầu tiên để lưu những địa điểm bạn muốn khám phá.'],
    'Chuyến đi': ['calendar', 'Lịch trình đầu tiên đang chờ bạn', 'Chọn tên và ngày đi trong biểu mẫu để bắt đầu một hành trình mới.'],
    'Thông báo': ['bell', 'Bạn đã xem hết cập nhật', 'Thông báo mới sẽ xuất hiện ở đây khi có thay đổi dành cho bạn.'],
    'Gợi ý': ['compass', 'Chưa có gợi ý dành cho bạn', 'Cập nhật sở thích trong tài khoản rồi quay lại để khám phá thêm.'],
    'Quản trị': ['database', 'Chưa có dữ liệu để hiển thị', 'Nguồn dữ liệu sẽ xuất hiện tại đây khi được hệ thống cung cấp.'],
  };
  const entry = content[section];
  if (!entry) return null;
  return <section className="screen-empty" aria-label={`Trạng thái ${section.toLowerCase()}`}>
    <span className="empty-symbol"><Icon name={failed ? 'alert' : guest ? 'lock' : entry[0]} size={32} /></span>
    <h2>{failed ? 'Chưa tải được dữ liệu' : guest ? 'Đăng nhập để tiếp tục hành trình' : entry[1]}</h2>
    <p>{failed ? 'Dữ liệu tạm thời chưa khả dụng. Bạn có thể chuyển màn hình rồi thử lại.' : guest ? 'Sử dụng tài khoản của bạn để xem và lưu nội dung cá nhân.' : entry[2]}</p>
    {guest && <button className="button small" onClick={onLogin}>Đến trang đăng nhập <Icon name="arrow" size={18} /></button>}
  </section>;
}

