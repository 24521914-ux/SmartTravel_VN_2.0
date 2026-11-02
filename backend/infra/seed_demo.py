"""Persistent, Vietnamese manual-test fixtures for the existing local P02 stack.

Run: python backend/infra/seed_demo.py
Only the loopback Gateway and smarttravel-p02 databases are used. No truncation,
password reset, scanner bypass or production provider is involved. Prices,
reviews, businesses and itineraries are illustrative, not travel advice.
"""
import argparse
import hashlib
import io
import json
import re
import secrets
import sys
import time
import uuid
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from p02 import LOCAL, ROOT, compose, prepare, request

GATEWAY = 'http://127.0.0.1:58080'
NAMESPACE = uuid.UUID('7a5c73fe-dc07-4219-a586-a6b3b87119fd')
STATE = LOCAL / 'demo-records.json'
ACCOUNTS = LOCAL / 'demo-accounts.json'
IDS = ('change_request_id', 'request_id', 'review_id', 'contribution_id', 'item_id', 'transfer_id', 'segment_id',
       'collection_id', 'day_id', 'trip_id', 'offering_id', 'claim_id',
       'job_id', 'source_id', 'business_id', 'destination_id', 'media_id', 'place_id', 'id')
VERIFICATION_BASELINE_KEY = 'verification:initial-baseline'

# Subprovince geographic groupings for the local tourism catalog. These are
# illustrative travel scopes, not a synchronization of current legal boundaries.
TOURISM_AREAS = [
    ('Hà Nội', 'Hoàn Kiếm & phố cổ', 'Hoàn Kiếm', ('Hồ Hoàn Kiếm', 'Chợ Đồng Xuân', 'Phố ẩm thực Tống Duy Tân', 'Nhà thờ Lớn Hà Nội')),
    ('Hà Nội', 'Văn Miếu & Đống Đa', 'Đống Đa', ('Văn Miếu Quốc Tử Giám',)),
    ('Hà Nội', 'Cầu Giấy', 'Cầu Giấy', ('Bảo tàng Dân tộc học Việt Nam',)),
    ('Thành phố Hồ Chí Minh', 'Trung tâm Quận 1', 'Quận 1', ('Dinh Độc Lập', 'Chợ Bến Thành', 'Phố đi bộ Nguyễn Huệ', 'Bến Bạch Đằng')),
    ('Thành phố Hồ Chí Minh', 'Khu vực Quận 3', 'Quận 3', ('Bảo tàng Chứng tích Chiến tranh',)),
    ('Đà Nẵng', 'Ven biển Sơn Trà', 'Sơn Trà', ('Bãi biển Mỹ Khê',)),
    ('Đà Nẵng', 'Ngũ Hành Sơn', 'Ngũ Hành Sơn', ('Danh thắng Ngũ Hành Sơn',)),
    ('Đà Nẵng', 'Trung tâm sông Hàn', 'Hải Châu', ('Cầu Rồng', 'Chợ Hàn', 'Bảo tàng Điêu khắc Chăm Đà Nẵng')),
    ('Đà Nẵng', 'Hội An', 'Hội An', ('Phố cổ Hội An',)),
    ('Huế', 'Trung tâm Huế', 'Huế', ('Đại Nội Huế', 'Chùa Thiên Mụ', 'Chợ Đông Ba', 'Làng hương Thủy Xuân')),
    ('Lâm Đồng', 'Đà Lạt', 'Đà Lạt', ('Hồ Xuân Hương', 'Thác Datanla', 'Đồi chè Cầu Đất', 'Vườn hoa thành phố Đà Lạt')),
    ('Quảng Ninh', 'Hạ Long', 'Hạ Long', ('Vịnh Hạ Long', 'Bảo tàng Quảng Ninh', 'Bãi biển Bãi Cháy', 'Làng chài Cửa Vạn')),
]


def tourism_scope_update(current, province_id, area_geo_id):
    """Migrate only a seed's old whole-province scope; preserve manual moves."""
    scope = str(current.get('geographic_unit_id', ''))
    if scope == area_geo_id:
        return {}
    if scope == province_id:
        return {'geographic_unit_id': area_geo_id}
    raise RuntimeError('Demo place geographic scope was changed manually; refusing to overwrite it')

ACCOUNT_FIXTURES = [
    {'alias': 'lan', 'email': 'lan.nguyen@demo.smarttravel.invalid', 'name': 'Nguyễn Ngọc Lan', 'roles': ['USER']},
    {'alias': 'minh', 'email': 'minh.tran@demo.smarttravel.invalid', 'name': 'Trần Quang Minh', 'roles': ['USER']},
    {'alias': 'business', 'email': 'mai.huong@demo.smarttravel.invalid', 'name': 'Lê Mai Hương · Du lịch Miền Trung', 'roles': ['USER', 'BUSINESS']},
    {'alias': 'editor', 'email': 'an.pham@demo.smarttravel.invalid', 'name': 'Phạm Hải An · Điều hành tour', 'roles': ['USER', 'BUSINESS']},
    {'alias': 'manager', 'email': 'quan.tri@demo.smarttravel.invalid', 'name': 'Quản trị SmartTravel · Dữ liệu mẫu', 'roles': ['USER', 'ADMIN']},
    {'alias': 'new-user', 'email': 'mai.anh.do@demo.smarttravel.invalid', 'name': 'Đỗ Mai Anh', 'roles': ['USER']},
    {'alias': 'password-change', 'email': 'khanh.hoa.nguyen@demo.smarttravel.invalid', 'name': 'Nguyễn Khánh Hòa', 'roles': ['USER']},
    {'alias': 'delete-account', 'email': 'quoc.bao.tran@demo.smarttravel.invalid', 'name': 'Trần Quốc Bảo', 'roles': ['USER']},
]

PLACE_DESCRIPTIONS = {
    'Hồ Hoàn Kiếm': 'Lối dạo quanh hồ nằm giữa khu phố cổ và khu hành chính trung tâm; có thể kết hợp ngắm Tháp Rùa và cầu Thê Húc từ bờ hồ.',
    'Văn Miếu Quốc Tử Giám': 'Quần thể sân trong, hồ Văn và bia tiến sĩ kể lại lịch sử giáo dục Nho học; nên dành thời gian đọc bảng giới thiệu ở từng khu.',
    'Bảo tàng Dân tộc học Việt Nam': 'Không gian trong nhà giới thiệu văn hóa các dân tộc, còn khu ngoài trời có nhà truyền thống; khuôn viên rộng nên đi giày dễ bước.',
    'Chợ Đồng Xuân': 'Khu chợ trong nhà nhiều tầng với quầy hàng gia dụng và vải vóc; các lối chính đông hơn vào buổi sáng và cuối tuần.',
    'Phố ẩm thực Tống Duy Tân': 'Dãy quán ăn gần khu phố cổ có lựa chọn món nóng buổi tối; giá và chỗ ngồi thay đổi theo từng quán.',
    'Dinh Độc Lập': 'Các phòng tiếp khách, phòng họp và khu tầng hầm cho thấy nhiều lớp lịch sử hiện đại; tuyến tham quan có nhiều cầu thang.',
    'Bảo tàng Chứng tích Chiến tranh': 'Các phòng trưng bày lưu tư liệu và hiện vật về chiến tranh; nội dung có thể nặng cảm xúc và cần thời gian đọc.',
    'Chợ Bến Thành': 'Khu chợ trung tâm có quầy thực phẩm, quà lưu niệm và hàng thủ công; nên hỏi giá trước khi mua và chú ý lối đi đông.',
    'Phố đi bộ Nguyễn Huệ': 'Quảng trường lát đá nối trụ sở UBND thành phố với bến Bạch Đằng; buổi tối có nhiều người dạo bộ và biểu diễn đường phố.',
    'Bến Bạch Đằng': 'Dải công viên ven sông có ghế nghỉ và lối đi bộ; khách có thể quan sát tàu thuyền mà không cần mua vé dịch vụ.',
    'Bãi biển Mỹ Khê': 'Bờ cát dài thuận tiện cho tản bộ và ngắm biển; nắng giữa trưa mạnh nên nên chuẩn bị nước và đồ che nắng.',
    'Danh thắng Ngũ Hành Sơn': 'Các ngọn núi đá vôi có lối bậc, hang và điểm nhìn ra biển; một số đoạn dốc không phù hợp nếu khó đi cầu thang.',
    'Cầu Rồng': 'Cây cầu bắc qua sông Hàn có lối ngắm cảnh ở hai bờ; khu vực ven sông đông hơn vào các tối cuối tuần có sự kiện.',
    'Chợ Hàn': 'Chợ gần sông Hàn bán đặc sản đóng gói, trái cây và đồ dùng; nên kiểm tra nhãn và hỏi rõ khối lượng trước khi mua.',
    'Bảo tàng Điêu khắc Chăm Đà Nẵng': 'Bộ sưu tập điêu khắc Chăm được sắp theo thời kỳ và địa điểm khai quật; chú giải giúp nối các hiện vật với bối cảnh kiến trúc.',
    'Phố cổ Hội An': 'Các tuyến phố ven sông có nhà gỗ, hội quán và cửa hiệu thủ công; buổi tối đẹp nhưng dòng người dày ở những ngõ chính.',
    'Đại Nội Huế': 'Hoàng thành có nhiều cổng, sân và cung điện trong một khuôn viên lớn; cần vài giờ nếu muốn đi trọn tuyến ngoài trời.',
    'Chùa Thiên Mụ': 'Ngôi chùa trên đồi nhìn xuống sông Hương có tháp Phước Duyên và sân vườn yên tĩnh; đường xuống bến có bậc đá.',
    'Chợ Đông Ba': 'Chợ lâu đời cạnh sông Hương có khu hàng ăn và quầy đặc sản Huế; lối đi nhỏ nên giữ đồ cá nhân gọn khi đông khách.',
    'Làng hương Thủy Xuân': 'Các bó hương nhiều màu được phơi dọc con đường làng; có thể hỏi người làm nghề về công đoạn se hương trước khi chụp ảnh.',
    'Hồ Xuân Hương': 'Vòng hồ ở trung tâm Đà Lạt thích hợp cho một quãng đi bộ nhẹ; sương và mưa chiều có thể làm mặt đường trơn.',
    'Thác Datanla': 'Lối đi xuyên rừng dẫn tới các tầng thác và điểm ngắm nước; thời gian chờ dịch vụ vui chơi có thể dài vào ngày nghỉ.',
    'Đồi chè Cầu Đất': 'Các luống chè trên đồi mở ra tầm nhìn rộng, thường có sương sớm; đường từ trung tâm thành phố khá xa.',
    'Vườn hoa thành phố Đà Lạt': 'Các luống hoa thay đổi theo mùa trong khuôn viên có lối đi lát; cảnh quan phụ thuộc thời điểm chăm sóc và thời tiết.',
    'Vịnh Hạ Long': 'Các tuyến tàu đi qua đảo đá vôi và hang trên vịnh; lịch trình phụ thuộc thời tiết nên nên chừa thời gian dự phòng.',
    'Bảo tàng Quảng Ninh': 'Tòa nhà ven biển có các tầng trưng bày về thiên nhiên, khai khoáng và đời sống địa phương; dành thời gian cho khu hiện vật than.',
    'Bãi biển Bãi Cháy': 'Bãi cát đô thị gần khu dịch vụ, thuận tiện đi dạo buổi chiều; tiện ích và mật độ khách thay đổi theo mùa.',
    'Làng chài Cửa Vạn': 'Cụm nhà nổi giữa vịnh giúp hình dung nếp sống làng chài; chuyến thuyền và mặt nước phụ thuộc điều kiện thời tiết.',
    'Nhà thờ Lớn Hà Nội': 'Công trình đá nằm giữa các phố nhỏ của khu trung tâm; có thể ngắm kiến trúc từ quảng trường bên ngoài khi không vào khuôn viên.',
}

REVIEW_FIXTURES = [
    (4, 'Tôi đi một vòng hồ vào sáng sớm, không khí dễ chịu và nhiều ghế nghỉ. Sau khoảng tám giờ khu vực quanh phố cổ bắt đầu đông hơn.'),
    (5, 'Khu bia tiến sĩ và các sân trong được chăm chút, bảng giới thiệu giúp chuyến thăm có mạch chuyện rõ ràng. Đi buổi sáng sẽ đỡ nắng ở các khoảng sân.'),
    (3, 'Nhà Rông ngoài trời là phần tôi thích nhất vì có thể nhìn cấu trúc từ nhiều phía. Một số phòng trưng bày dày chữ, nên nếu đi cùng trẻ nhỏ sẽ cần chọn tuyến trước.'),
    (4, 'Tôi tìm được nhiều quầy đồ gia dụng và vải trong một lần ghé chợ. Lối tầng trệt khá hẹp lúc đông người nên không tiện nếu mang hành lý cồng kềnh.'),
    (2, 'Các hàng ăn mở muộn, hợp khi muốn ăn tối gần phố cổ. Chỗ ngồi sát nhau và giá giữa các quán chênh lệch, tôi phải hỏi kỹ trước khi gọi món.'),
    (4, 'Các phòng lớn và tầng hầm tạo nên tuyến tham quan thú vị, bảng chỉ dẫn khá dễ theo. Một vài đoạn cầu thang dài nên người đi cùng cần nghỉ giữa chặng.'),
    (5, 'Tư liệu được chia theo chủ đề nên tôi dễ theo dõi từng khu. Nội dung xúc động và có một số ảnh mạnh, không phải trải nghiệm nhẹ nhàng cho mọi lứa tuổi.'),
    (3, 'Chợ nằm ngay khu trung tâm nên dễ ghé mua đặc sản. Một số quầy mời chào liên tục và giá chưa niêm yết rõ, vì vậy tôi hỏi giá trước khi chọn.'),
    (2, 'Quảng trường rộng và có thể ngồi ngắm phố lên đèn. Cuối tuần âm thanh và lượng người khá dày, nên tôi rời đi sớm hơn dự tính.'),
    (4, 'Đoạn ven sông thoáng, có chỗ nghỉ chân và nhìn được tàu chạy qua. Nếu muốn lên tàu thì cần xem riêng lịch dịch vụ, còn đi bộ ở bến vẫn vui.'),
    (4, 'Bãi cát rộng và dễ tìm lối xuống biển, tôi thích đi vào sáng sớm. Giữa trưa nắng gắt và thiếu bóng râm ở một số đoạn.'),
    (5, 'Hang và các điểm nhìn trên núi rất đáng công leo bậc; từ trên cao thấy rõ dải biển. Bậc đá có chỗ trơn nên tôi đi chậm và mang giày bám tốt.'),
    (4, 'Đi bộ hai bờ sông cho nhiều góc nhìn cây cầu và trung tâm thành phố. Tối có sự kiện sẽ đông, nên đến sớm nếu muốn đứng gần bờ.'),
    (3, 'Tôi mua được vài món khô và thử món ăn tại chợ. Khu trong chợ nóng vào buổi trưa, một số quầy cần hỏi kỹ hạn dùng và giá theo cân.'),
    (2, 'Bộ sưu tập có nhiều tượng và phù điêu đặc sắc, nhưng phòng trưng bày khá nóng trong buổi trưa tôi ghé. Thuyết minh ngắn nên tôi phải đọc thêm bảng chú giải.'),
    (4, 'Buổi tối đèn lồng soi xuống sông rất đẹp và các cửa hàng thủ công thú vị. Phố chính đông, tôi thích rẽ vào các ngõ nhỏ yên hơn.'),
    (5, 'Tôi dành gần nửa ngày mà vẫn còn khu chưa xem kỹ; cổng và sân trong cho thấy quy mô của hoàng thành. Nên mang nước vì phần lớn hành trình ở ngoài trời.'),
    (3, 'Sân chùa yên và nhìn được một đoạn sông Hương. Bậc lên xuống khá nhiều, nên chuyến thăm không nhẹ nhàng với người hạn chế vận động.'),
    (1, 'Quầy bún và bánh Huế cho tôi nhiều lựa chọn, nhưng lối đi chật và khá nóng lúc đông. Tôi khó tìm được chỗ ngồi yên để ăn.'),
    (4, 'Những bó hương phơi nhiều màu tạo nên khung cảnh đặc trưng; người làm nghề giải thích từng bước rất dễ hiểu. Tôi hỏi trước khi chụp ảnh để không cản công việc.'),
    (3, 'Đi bộ sát hồ vào buổi sáng khá thư thả và dễ tìm quán nghỉ. Cuối tuần giao thông quanh hồ đông, nên đoạn dạo bị ngắt bởi tiếng xe.'),
    (5, 'Lối rừng đưa tôi tới nhiều tầng thác và có chỗ dừng ngắm nước. Ngày nghỉ phải chờ lâu ở khu dịch vụ, nhưng đoạn đi bộ vẫn đáng trải nghiệm.'),
    (2, 'Đồi chè đẹp khi có sương mỏng và không khí mát. Hôm tôi đi trời quang, quãng đường xa hơn phần thời gian tham quan nên cần sắp xếp phương tiện trước.'),
    (4, 'Các luống hoa được chăm khá gọn và lối đi dễ theo. Một vài khu đang thay cây theo mùa nên cảnh quan không đồng đều trong cùng chuyến.'),
    (3, 'Từ tàu có nhiều góc nhìn đảo đá và mặt nước, nhưng chuyến đi chiếm gần cả ngày. Tôi sẽ kiểm tra dự báo biển và hỏi rõ phần nào đã gồm trong vé.'),
    (5, 'Kiến trúc kính đen nổi bật sát biển, các tầng trưng bày giúp câu chuyện địa phương dễ tiếp cận. Tôi muốn có thêm thời gian đọc kỹ phần về khai thác than.'),
    (1, 'Bãi gần khu dịch vụ nên dễ tới, nhưng đoạn tôi ghé có rác sau giờ đông khách. Cần xem điều kiện vệ sinh tại chỗ trước khi chọn khu tắm.'),
    (4, 'Đi thuyền qua cụm nhà nổi cho góc nhìn khác về đời sống trên vịnh. Trải nghiệm phụ thuộc nhiều vào thời tiết và chất lượng thuyết minh của chuyến.'),
]

REJECTED_REVIEW_FIXTURE = (
    2,
    'Tôi ghé hồ vào cuối buổi chiều và thấy lối sát đường khá ồn, trong khi một đoạn vỉa hè đang đông người. '
    'Cảnh quan vẫn đẹp nhưng trải nghiệm đi bộ hôm đó không thoải mái như mong đợi.'
)


def opening_hours_for(category):
    hours = {
        'Biển và đảo': ('05:00', '19:00'), 'Di sản văn hóa': ('08:00', '17:00'),
        'Thiên nhiên và sinh thái': ('07:00', '17:30'), 'Ẩm thực địa phương': ('06:00', '22:00'),
        'Chợ và mua sắm': ('06:00', '18:00'), 'Cà phê và thư giãn': ('06:00', '22:00'),
        'Du lịch cộng đồng': ('08:00', '17:00'), 'Điểm tham quan': ('06:00', '22:00'),
        'Bảo tàng': ('08:00', '17:00'),
    }
    start, end = hours[category]
    weekdays = range(1, 7) if category == 'Bảo tàng' else range(7)
    return [{'weekday': day, 'open': start, 'close': end, 'overnight': False} for day in weekdays]


def rid(row):
    return next(str(row[k]) for k in IDS if row.get(k))


def manifest_entries(state, prefix):
    return [(key, value) for key, value in state.items()
            if key.startswith(prefix) and key != VERIFICATION_BASELINE_KEY]


def legacy_test_place(row):
    return bool(re.match(r'^(?:P0\d[\s_-]|Integration places \d|[0-9a-f]{8}-[0-9a-f]{4}-)',
                         str(row.get('name', '')), re.IGNORECASE))


def validate_account_identity(alias, tracked, found):
    if tracked and not found:
        raise RuntimeError(f'Demo account removed: {alias}; refusing to recreate it')
    if tracked and str(tracked.get('user_id')) != str(found[0].get('user_id')):
        raise RuntimeError(f'Demo account identity changed: {alias}')


def is_seed_review(row, rating, content, legacy_rating=None, legacy_content=None):
    """Recognize only the exact current or historical seed review before adopting an untracked row."""
    if row.get('status') not in {'PENDING', 'APPROVED', 'REJECTED', 'HIDDEN', 'DELETED'}:
        return False
    current = row.get('rating') == rating and row.get('content') == content
    legacy = (legacy_rating is not None and legacy_content is not None
              and row.get('rating') == legacy_rating and row.get('content') == legacy_content)
    return current or legacy


def normalize_mongo_json(value):
    """Convert mongosh JSON encodings of BSON Long into ordinary Python integers."""
    if isinstance(value, list):
        return [normalize_mongo_json(item) for item in value]
    if isinstance(value, dict):
        if set(value) == {'high', 'low', 'unsigned'} and isinstance(value['unsigned'], bool):
            number = ((int(value['high']) & 0xffffffff) << 32) | (int(value['low']) & 0xffffffff)
            if not value['unsigned'] and number & (1 << 63):
                number -= 1 << 64
            return number
        return {key: normalize_mongo_json(item) for key, item in value.items()}
    return value


class Demo:
    def __init__(self):
        self.state = json.loads(STATE.read_text(encoding='utf-8')) if STATE.exists() else {}
        self.tokens = {}
        self.created = 0
        self.updated = 0
        self.fresh = set()
        self.password = prepare()['IDENTITY_FIXTURE_PASSWORD']

    def save(self):
        STATE.write_text(json.dumps(self.state, ensure_ascii=False, indent=2), encoding='utf-8')

    def call(self, service, path, method='GET', body=None, actor='admin', version=None, key=None):
        headers = {}
        if version is not None:
            headers['If-Match'] = f'"{version}"'
        if method != 'GET':
            headers['Idempotency-Key'] = str(uuid.uuid5(NAMESPACE, key or json.dumps(
                [actor, service, path, method, body, version], ensure_ascii=False, sort_keys=True)))
        status, data, _ = request(GATEWAY, '/api/' + service + '/api/v1' + path,
                                  method, body, self.tokens.get(actor), headers)
        if not 200 <= status < 300:
            raise RuntimeError(f'{service} {method} {path}: HTTP {status} {(data or {}).get("code", "")}')
        return data

    def rows(self, service, path, actor='admin'):
        rows, cursor = [], None
        while True:
            query = {'limit': 100}
            if cursor:
                query['cursor'] = cursor
            page = self.call(service, path + ('&' if '?' in path else '?') + urlencode(query), actor=actor)
            rows.extend(page['items'])
            cursor = page.get('next_cursor')
            if not cursor:
                return rows

    def ensure(self, key, service, listing, target, body, actor='admin', match=None, version=None, existing=None, list_actor=None):
        """Read the authoritative store even without a local manifest; fail on ambiguity."""
        rows = existing if existing is not None else self.rows(service, listing, list_actor or actor)
        matches = [r for r in rows if (match(r) if match else r.get('name') == body.get('name'))]
        if key in self.state:
            owned = [r for r in rows if rid(r) == rid(self.state[key])]
            if owned:
                return owned[0]
            # A user may intentionally delete a fixture. Do not resurrect it silently.
            raise RuntimeError(f'Demo record removed: {key}; remove its manifest entry to recreate explicitly')
        if len(matches) > 1:
            raise RuntimeError(f'Ambiguous demo match: {key}')
        if matches:
            row = matches[0]
        else:
            row = self.call(service, target, 'POST', body, actor, version, key='create:' + key)
            self.created += 1
            self.fresh.add(key)
        self.state[key] = row
        self.save()
        return row

    def mongo(self, collection, query):
        assert collection in {'reviews', 'collections', 'collection_items', 'contributions', 'review_reports', 'favorites'}
        script = ("const a=db.getSiblingDB('admin');"
                  "if(!a.auth('community_admin',process.env.MONGO_INITDB_ROOT_PASSWORD))throw Error('auth');"
                  f"print(JSON.stringify(db.getSiblingDB('community_db').{collection}.find({json.dumps(query)}).toArray()))")
        result = compose('exec', '-T', 'community-db', 'mongosh', '--quiet', '--eval', script)
        return normalize_mongo_json(json.loads(result.stdout.strip()))

    def seed_review_author(self, review_id, user_id, display_name):
        """Local presentation fixture only: Community has no API field for author display snapshots."""
        review_id = str(uuid.UUID(str(review_id)))
        user_id = str(uuid.UUID(str(user_id)))
        assert display_name in {'Nguyễn Ngọc Lan', 'Trần Quang Minh'}
        query = json.dumps({'_id': review_id, 'user_id': user_id})
        fields = json.dumps({'author_name': display_name}, ensure_ascii=False)
        script = ("const a=db.getSiblingDB('admin');"
                  "if(!a.auth('community_admin',process.env.MONGO_INITDB_ROOT_PASSWORD))throw Error('auth');"
                  f"const r=db.getSiblingDB('community_db').reviews.updateOne({query},{{$set:{fields}}});"
                  "if(r.matchedCount!==1)throw Error('demo review missing')")
        compose('exec', '-T', 'community-db', 'mongosh', '--quiet', '--eval', script)

    def sql(self, service, statement):
        assert service in {'catalog', 'identity', 'trip', 'ingestion'}
        return compose('exec', '-T', service + '-db', 'psql', '-U', service + '_admin',
                       '-d', service + '_db', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement).stdout.strip()

    def accounts(self):
        status, login, _ = request(GATEWAY, '/api/identity/api/v1/auth/login', 'POST',
                                   {'email': 'fixture-admin@example.invalid', 'password': self.password})
        if status != 200:
            raise RuntimeError(f'Local bootstrap administrator login: HTTP {status}')
        self.tokens['admin'] = login['access_token']
        if not ACCOUNTS.exists():
            if any(key.startswith('user:') for key in self.state):
                raise RuntimeError('Demo credential file is missing while tracked accounts exist; refusing to reset passwords')
            credentials = {'password': secrets.token_urlsafe(18), 'accounts': []}
        else:
            credentials = json.loads(ACCOUNTS.read_text(encoding='utf-8'))
        if not credentials.get('password') or not isinstance(credentials.get('accounts'), list):
            raise RuntimeError('Demo credential file is incomplete; refusing to reset passwords')
        by_alias = {account.get('alias'): account for account in credentials['accounts']}
        known_emails = {account.get('email') for account in credentials['accounts']}
        credentials_changed = not ACCOUNTS.exists()
        for fixture in ACCOUNT_FIXTURES:
            current = by_alias.get(fixture['alias'])
            if current:
                if current.get('email') != fixture['email']:
                    raise RuntimeError(f'Demo account alias collision: {fixture["alias"]}')
                continue
            if 'user:' + fixture['alias'] in self.state:
                raise RuntimeError(f'Demo credential entry removed for tracked account: {fixture["alias"]}')
            if fixture['email'] in known_emails:
                raise RuntimeError(f'Demo account email collision: {fixture["alias"]}')
            credentials['accounts'].append(dict(fixture))
            by_alias[fixture['alias']] = fixture
            known_emails.add(fixture['email'])
            credentials_changed = True
        if credentials_changed:
            ACCOUNTS.write_text(json.dumps(credentials, ensure_ascii=False, indent=2), encoding='utf-8')
        for account in credentials['accounts']:
            def find_account():
                # Public admin representations intentionally omit email.
                email = account['email'].replace("'", "''")
                result = compose('exec', '-T', 'identity-db', 'psql', '-U', 'identity_admin', '-d', 'identity_db', '-At', '-c',
                                 f"SELECT user_id FROM identity.users WHERE email='{email}'")
                ids = result.stdout.splitlines()
                return [u for u in self.rows('identity', '/admin/users') if u['user_id'] in ids]
            found = find_account()
            new_account = not found
            if len(found) > 1:
                raise RuntimeError('Ambiguous demo account')
            tracked = self.state.get('user:' + account['alias'])
            validate_account_identity(account['alias'], tracked, found)
            if not found:
                self.call('identity', '/auth/register', 'POST', {
                    'email': account['email'], 'password': credentials['password'], 'display_name': account['name']})
                self.created += 1
                self.fresh.add('user:' + account['alias'])
                for _ in range(40):
                    with urlopen('http://127.0.0.1:59025/api/v1/messages?limit=200', timeout=10) as response:
                        messages = json.load(response).get('messages', [])
                    mail = next((m for m in messages if account['email'] in json.dumps(m)), None)
                    if mail:
                        break
                    time.sleep(.5)
                else:
                    raise RuntimeError('Verification mail deadline')
                with urlopen('http://127.0.0.1:59025/api/v1/message/' + mail['ID'], timeout=10) as response:
                    text = json.load(response).get('Text', '')
                token = re.findall(r'[A-Za-z0-9_-]{32,}', text)[-1]
                self.call('identity', '/auth/verify-email', 'POST', {'token': token})
                found = find_account()
            user = found[0]
            if new_account and sorted(user['roles']) != sorted(account['roles']):
                self.call('identity', '/admin/users/' + user['user_id'] + '/roles', 'PUT',
                          {'roles': account['roles']}, version=user['version'])
            status, session, _ = request(GATEWAY, '/api/identity/api/v1/auth/login', 'POST',
                                        {'email': account['email'], 'password': credentials['password']})
            if status != 200:
                raise RuntimeError(f'Demo account {account["alias"]} login HTTP {status}; password is never reset')
            self.tokens[account['alias']] = session['access_token']
            self.state['user:' + account['alias']] = self.call('identity', '/me', actor=account['alias'])
            self.save()
        print('READY 8 named demo accounts; credentials saved locally (never printed)', flush=True)

    def catalog(self):
        categories = ['Biển và đảo', 'Di sản văn hóa', 'Thiên nhiên và sinh thái', 'Ẩm thực địa phương',
                      'Chợ và mua sắm', 'Cà phê và thư giãn', 'Du lịch cộng đồng']
        # Rename only machine-generated category names from the screenshot; keep IDs/references.
        old = sorted((r for r in self.rows('catalog', '/categories')
                      if re.fullmatch(r'Integration categories \d+(?: updated)?', r['name'])), key=rid)
        existing_names = {r['name'] for r in self.rows('catalog', '/categories')}
        for row, name in zip(old, (n for n in categories if n not in existing_names)):
            key = 'renamed-category:' + rid(row)
            if key not in self.state:
                self.state[key] = {'id': rid(row), 'previous_name': row['name'], 'name': name}
                self.save()
            self.call('catalog', '/admin/categories/' + rid(row), 'PATCH', {'name': name}, version=row['version'])
        self.cats = {}
        for name in categories + ['Điểm tham quan', 'Nhà hàng', 'Khách sạn', 'Bảo tàng']:
            self.cats[name] = rid(self.ensure('category:' + name, 'catalog', '/admin/categories',
                                            '/admin/categories', {'name': name, 'active': True}))
        self.tags, self.amenities = [], []
        for kind, names, output in [
            ('tags', ['Ngắm hoàng hôn', 'Du lịch chậm', 'Ẩm thực đường phố', 'Dành cho cặp đôi', 'Khám phá cuối tuần'], self.tags),
            ('amenities', ['Nhà vệ sinh', 'Lối đi cho xe lăn', 'Hướng dẫn viên', 'Khu vui chơi trẻ em', 'Bãi đỗ xe', 'Wi-Fi'], self.amenities),
        ]:
            for name in names:
                output.append(rid(self.ensure(kind + ':' + name, 'catalog', '/admin/' + kind,
                                              '/admin/' + kind, {'name': name, 'active': True})))
        regions = [('Hà Nội', 'Hà Nội ngàn năm'), ('Thành phố Hồ Chí Minh', 'Sài Gòn năng động'),
                   ('Đà Nẵng', 'Đà Nẵng biển xanh'), ('Huế', 'Huế và miền di sản'),
                   ('Lâm Đồng', 'Đà Lạt ngàn hoa'), ('Quảng Ninh', 'Hạ Long kỳ quan biển đảo')]
        self.geo, self.dest = {}, {}
        for province, destination in regions:
            geo = self.ensure('geo:' + province, 'catalog', '/admin/geographic-units', '/admin/geographic-units',
                              {'name': province, 'level': 'PROVINCE', 'parent_id': '10000000-0000-0000-0000-000000000001', 'aliases': []})
            self.geo[province] = rid(geo)
            dest = self.ensure('destination:' + destination, 'catalog', '/admin/destinations', '/admin/destinations',
                               {'name': destination, 'geographic_unit_ids': [rid(geo)]})
            self.dest[province] = rid(dest)
        self.area_geo, self.area_dest = {}, {}
        for province, name, geo_name, place_names in TOURISM_AREAS:
            parent = self.geo[province]
            geo = self.ensure('tourism-geo:' + province + ':' + geo_name, 'catalog', '/admin/geographic-units', '/admin/geographic-units',
                              {'name': geo_name, 'level': 'DISTRICT', 'parent_id': parent, 'aliases': []},
                              match=lambda row, n=geo_name, p=parent: row.get('name') == n and row.get('parent_id') == p)
            if geo.get('parent_id') != parent:
                raise RuntimeError('Demo tourism scope parent was changed manually; refusing to overwrite it')
            destination = self.ensure('tourism-area:' + province + ':' + name, 'catalog', '/admin/destinations', '/admin/destinations',
                                      {'name': name, 'geographic_unit_ids': [rid(geo)]})
            if set(destination.get('geographic_unit_ids', [])) != {rid(geo)}:
                raise RuntimeError('Demo tourism area membership was changed manually; refusing to overwrite it')
            for place_name in place_names:
                self.area_geo[place_name] = rid(geo)
                self.area_dest[place_name] = rid(destination)
        # Public landmark names/approximate coordinates; all prices are demo values.
        places = [
            ('Hồ Hoàn Kiếm', 'Hà Nội', 'Điểm tham quan', 21.0288, 105.8525, 0),
            ('Văn Miếu Quốc Tử Giám', 'Hà Nội', 'Di sản văn hóa', 21.0276, 105.8355, 70000),
            ('Bảo tàng Dân tộc học Việt Nam', 'Hà Nội', 'Bảo tàng', 21.0404, 105.7989, 40000),
            ('Chợ Đồng Xuân', 'Hà Nội', 'Chợ và mua sắm', 21.0381, 105.8495, 0),
            ('Phố ẩm thực Tống Duy Tân', 'Hà Nội', 'Ẩm thực địa phương', 21.0296, 105.8442, 80000),
            ('Dinh Độc Lập', 'Thành phố Hồ Chí Minh', 'Di sản văn hóa', 10.7770, 106.6953, 65000),
            ('Bảo tàng Chứng tích Chiến tranh', 'Thành phố Hồ Chí Minh', 'Bảo tàng', 10.7794, 106.6921, 40000),
            ('Chợ Bến Thành', 'Thành phố Hồ Chí Minh', 'Chợ và mua sắm', 10.7725, 106.6980, 0),
            ('Phố đi bộ Nguyễn Huệ', 'Thành phố Hồ Chí Minh', 'Điểm tham quan', 10.7740, 106.7035, 0),
            ('Bến Bạch Đằng', 'Thành phố Hồ Chí Minh', 'Cà phê và thư giãn', 10.7760, 106.7068, 0),
            ('Bãi biển Mỹ Khê', 'Đà Nẵng', 'Biển và đảo', 16.0544, 108.2470, 0),
            ('Danh thắng Ngũ Hành Sơn', 'Đà Nẵng', 'Thiên nhiên và sinh thái', 16.0034, 108.2638, 40000),
            ('Cầu Rồng', 'Đà Nẵng', 'Điểm tham quan', 16.0611, 108.2275, 0),
            ('Chợ Hàn', 'Đà Nẵng', 'Ẩm thực địa phương', 16.0678, 108.2230, 0),
            ('Bảo tàng Điêu khắc Chăm Đà Nẵng', 'Đà Nẵng', 'Bảo tàng', 16.0605, 108.2231, 60000),
            ('Phố cổ Hội An', 'Đà Nẵng', 'Di sản văn hóa', 15.8801, 108.3380, 120000),
            ('Đại Nội Huế', 'Huế', 'Di sản văn hóa', 16.4698, 107.5770, 200000),
            ('Chùa Thiên Mụ', 'Huế', 'Di sản văn hóa', 16.4536, 107.5449, 0),
            ('Chợ Đông Ba', 'Huế', 'Ẩm thực địa phương', 16.4701, 107.5885, 0),
            ('Làng hương Thủy Xuân', 'Huế', 'Du lịch cộng đồng', 16.4298, 107.5625, 0),
            ('Hồ Xuân Hương', 'Lâm Đồng', 'Cà phê và thư giãn', 11.9404, 108.4420, 0),
            ('Thác Datanla', 'Lâm Đồng', 'Thiên nhiên và sinh thái', 11.9039, 108.4498, 50000),
            ('Đồi chè Cầu Đất', 'Lâm Đồng', 'Du lịch cộng đồng', 11.8664, 108.5665, 0),
            ('Vườn hoa thành phố Đà Lạt', 'Lâm Đồng', 'Điểm tham quan', 11.9538, 108.4517, 100000),
            ('Vịnh Hạ Long', 'Quảng Ninh', 'Biển và đảo', 20.9101, 107.1839, 290000),
            ('Bảo tàng Quảng Ninh', 'Quảng Ninh', 'Bảo tàng', 20.9500, 107.0960, 40000),
            ('Bãi biển Bãi Cháy', 'Quảng Ninh', 'Biển và đảo', 20.9512, 107.0355, 0),
            ('Làng chài Cửa Vạn', 'Quảng Ninh', 'Du lịch cộng đồng', 20.7334, 107.1612, 100000),
            ('Nhà thờ Lớn Hà Nội', 'Hà Nội', 'Di sản văn hóa', 21.0288, 105.8480, None),
        ]
        self.places = []
        for name, province, category, lat, lon, price in places:
            hours = opening_hours_for(category)
            row = self.ensure('place:' + name, 'catalog', '/admin/places', '/admin/places', {
                'name': name, 'latitude': lat, 'longitude': lon,
                'description': PLACE_DESCRIPTIONS[name],
                'category_ids': [self.cats[category]], 'tag_ids': self.tags[:2],
                'amenity_ids': self.amenities[:3], 'geographic_unit_id': self.area_geo[name],
                'destination_ids': [self.area_dest[name]], 'price': price, 'currency': 'VND',
                'opening_hours': hours,
                'media_keys': []})
            if 'place:' + name in self.fresh and row.get('status') != 'PUBLISHED':
                row = self.call('catalog', '/admin/places/' + rid(row) + '/status', 'PUT',
                                {'status': 'PUBLISHED'}, version=row['version'])
            if 'place:' + name not in self.fresh:
                current = self.call('catalog', '/admin/places/' + rid(row))
                update = tourism_scope_update(current, self.geo[province], self.area_geo[name])
                if not current.get('description'):
                    update['description'] = PLACE_DESCRIPTIONS[name]
                old_hours = [{'weekday': d, 'open': '08:00', 'close': '18:00', 'overnight': False} for d in range(7)]
                if current.get('opening_hours') == old_hours:
                    update['opening_hours'] = hours
                if update:
                    row = self.call('catalog', '/admin/places/' + rid(current), 'PATCH', update,
                                    version=current['version'])
                    self.updated += 1
            self.places.append(row)
        self.draft_place = self.ensure('draft-place:Vườn Bách Thảo Hà Nội', 'catalog', '/admin/places',
                                       '/admin/places', {
            'name': 'Vườn Bách Thảo Hà Nội', 'description': 'Hồ sơ địa điểm mẫu đang chờ quản trị viên kiểm tra trước khi công khai.',
            'latitude': 21.0453, 'longitude': 105.8314,
            'category_ids': [self.cats['Thiên nhiên và sinh thái']], 'tag_ids': [], 'amenity_ids': [],
            'geographic_unit_id': self.geo['Hà Nội'], 'destination_ids': [self.dest['Hà Nội']],
            'price': None, 'currency': 'VND', 'opening_hours': [], 'media_keys': []})
        for index, (name, kind, price, place) in enumerate([
            ('Dạo hồ Hoàn Kiếm và tìm hiểu phố cổ', 'TOUR', 150000, 0),
            ('Tham quan Dinh Độc Lập cùng hướng dẫn viên', 'SERVICE', 120000, 5),
            ('Chèo SUP buổi sáng tại Mỹ Khê', 'ACTIVITY', 250000, 10),
            ('Khám phá đèn lồng Hội An', 'EXPERIENCE', 180000, 15),
            ('Trải nghiệm làm hương Thủy Xuân', 'EXPERIENCE', 90000, 19),
            ('Tìm hiểu văn hóa trà Cầu Đất', 'TOUR', 160000, 22),
            ('Du thuyền ngắm Vịnh Hạ Long', 'TOUR', 650000, 24),
            ('Đêm giao lưu văn hóa bên sông Hương', 'EVENT', 100000, 18),
        ]):
            self.ensure('offering:' + str(index), 'catalog', '/admin/offerings', '/admin/offerings',
                        {'name': name, 'type': kind, 'price': price, 'currency': 'VND', 'place_id': rid(self.places[place])})
        print('READY named catalog: 29 public landmarks, 1 private draft, 6 provinces, 12 tourism areas, 8 experiences', flush=True)

    def personal(self):
        for actor in ['lan', 'minh']:
            preferences = self.call('identity', '/me/preferences', actor=actor)
            if 'preferences:' + actor not in self.state:
                self.call('identity', '/me/preferences', 'PUT', {
                    'category_ids': [self.cats['Di sản văn hóa'], self.cats['Biển và đảo']],
                    'travel_style_ids': ['00000000-0000-4000-8000-000000000101'],
                    'food_preference_ids': [], 'budget_level': 'MID', 'budget_min': 500000,
                    'budget_max': 5000000, 'currency': 'VND', 'personalization_enabled': False,
                    'consent_version': 1}, actor, preferences['version'])
                self.state['preferences:' + actor] = {'saved': True}
                self.save()
            for index in ([0, 10, 15, 24] if actor == 'lan' else [5, 16, 20]):
                place_id = rid(self.places[index])
                favorite_path = '/me/favorites'
                favorites = self.rows('community', favorite_path, actor)
                if not any(r['place_id'] == place_id for r in favorites) and 'favorite:' + actor + place_id not in self.state:
                    self.call('community', '/me/favorites/' + place_id, 'PUT', {}, actor)
                    self.state['favorite:' + actor + place_id] = {'place_id': place_id}
                    self.save()
        for actor, name, visibility, indexes in [
            ('lan', 'Những miền biển em muốn đến', 'PUBLIC', [10, 24, 26]),
            ('lan', 'Cuối tuần khám phá di sản', 'PRIVATE', [1, 5, 15, 16]),
            ('minh', 'Hương vị và văn hóa ba miền', 'PUBLIC', [4, 7, 13, 18]),
        ]:
            col = self.ensure('collection:' + name, 'community', '/me/collections', '/me/collections',
                              {'name': name, 'visibility': visibility}, actor)
            col_id = rid(col)
            for index in indexes:
                current = self.call('community', '/me/collections/' + col_id, actor=actor)
                self.ensure('collection-item:' + col_id + str(index), 'community', '/collections/' + col_id + '/items',
                            '/collections/' + col_id + '/items', {'place_id': rid(self.places[index]),
                            'note': 'Dành thời gian khám phá ' + self.places[index]['name']}, actor,
                            match=lambda r, i=index: r['place_id'] == rid(self.places[i]), version=current['version'])
        self.ensure('collection:Điểm muốn xem sau', 'community', '/me/collections', '/me/collections',
                    {'name': 'Điểm muốn xem sau', 'visibility': 'PRIVATE'}, 'lan')
        print('READY favorites, preferences and 4 collections (3 populated, 1 empty)', flush=True)

    def trips(self):
        for name, province, indexes, state in [
            ('Đà Nẵng – Hội An: biển xanh và phố cổ', 'Đà Nẵng', [10, 12, 13, 11, 15], 'PLANNED'),
            ('Hà Nội: một cuối tuần khám phá di sản', 'Hà Nội', [0, 1, 3, 2, 4], 'DRAFT'),
            ('Đà Lạt: nghỉ ngơi giữa ngàn thông', 'Lâm Đồng', [20, 21, 22, 23], 'DRAFT'),
        ]:
            trip = self.ensure('trip:' + name, 'trip', '/me/trips', '/me/trips', {
                'name': name, 'start_date': '2026-12-05', 'end_date': '2026-12-07',
                'timezone': 'Asia/Ho_Chi_Minh', 'currency': 'VND', 'budget': 3500000}, 'lan')
            path = '/trips/' + rid(trip)
            def version():
                return self.call('trip', path, actor='lan')['version']
            self.ensure('segment:' + name, 'trip', path + '/destinations', path + '/destinations',
                        {'destination_id': self.dest[province], 'start_date': '2026-12-05', 'end_date': '2026-12-07'},
                        'lan', match=lambda r: r['destination_id'] == self.dest[province], version=version())
            for day_index, date in enumerate(['2026-12-05', '2026-12-06', '2026-12-07']):
                day = self.ensure('day:' + name + date, 'trip', path + '/days', path + '/days', {'date': date},
                                  'lan', match=lambda r: r['date'] == date, version=version())
                item_path = path + '/days/' + rid(day) + '/items'
                selected = indexes[day_index * 2:day_index * 2 + 2]
                for index in selected:
                    self.ensure('trip-item:' + name + str(index), 'trip', item_path, item_path, {
                        'place_id': rid(self.places[index]), 'note': 'Khám phá ' + self.places[index]['name'],
                        'duration_minutes': 90, 'locked': day_index == 1, 'recommendation_request_id': None},
                        'lan', match=lambda r, i=index: r['place_id'] == rid(self.places[i]), version=version())
                items = self.rows('trip', item_path, 'lan')
                if len(items) >= 2:
                    body = {'from_item_id': rid(items[0]), 'to_item_id': rid(items[1]), 'mode': 'DRIVE'}
                    self.ensure('transfer:' + name + date, 'trip', path + '/transfers', path + '/transfers', body,
                                'lan', match=lambda r: r['from_item_id'] == body['from_item_id'] and r['to_item_id'] == body['to_item_id'], version=version())
            if 'trip-state:' + name not in self.state:
                if state != 'DRAFT':
                    self.call('trip', path + '/state', 'PUT', {'state': state}, 'lan', version())
                self.state['trip-state:' + name] = {'state': state}
                self.save()
        name = 'Đà Nẵng – Huế: biển miền Trung và kinh thành'
        trip = self.ensure('trip:' + name, 'trip', '/me/trips', '/me/trips', {
            'name': name, 'start_date': '2026-12-10', 'end_date': '2026-12-14',
            'timezone': 'Asia/Ho_Chi_Minh', 'currency': 'VND', 'budget': 4200000}, 'lan')
        path = '/trips/' + rid(trip)
        def version():
            return self.call('trip', path, actor='lan')['version']
        for key, province, start, end in [
            ('central-coast', 'Đà Nẵng', '2026-12-10', '2026-12-12'),
            ('heritage-city', 'Huế', '2026-12-13', '2026-12-14'),
        ]:
            self.ensure('segment:' + name + ':' + key, 'trip', path + '/destinations', path + '/destinations', {
                'destination_id': self.dest[province], 'start_date': start, 'end_date': end}, 'lan',
                match=lambda row, p=province: row['destination_id'] == self.dest[p], version=version())
        itinerary = [
            ('2026-12-10', [10]), ('2026-12-11', [11, 12]), ('2026-12-12', [15]),
            ('2026-12-13', [16]), ('2026-12-14', [17, 18]),
        ]
        for date, indexes in itinerary:
            day = self.ensure('day:' + name + date, 'trip', path + '/days', path + '/days', {'date': date},
                              'lan', match=lambda row, d=date: row['date'] == d, version=version())
            item_path = path + '/days/' + rid(day) + '/items'
            for index in indexes:
                self.ensure('trip-item:' + name + str(index), 'trip', item_path, item_path, {
                    'place_id': rid(self.places[index]), 'note': 'Dành thời gian tham quan ' + self.places[index]['name'],
                    'duration_minutes': 120 if index in {11, 15, 16} else 90,
                    'locked': index == 16, 'recommendation_request_id': None},
                    'lan', match=lambda row, i=index: row['place_id'] == rid(self.places[i]), version=version())
            items = self.rows('trip', item_path, 'lan')
            if len(items) >= 2:
                body = {'from_item_id': rid(items[0]), 'to_item_id': rid(items[1]), 'mode': 'DRIVE'}
                self.ensure('transfer:' + name + date, 'trip', path + '/transfers', path + '/transfers', body,
                            'lan', match=lambda row, b=body: row['from_item_id'] == b['from_item_id'] and row['to_item_id'] == b['to_item_id'],
                            version=version())
        self.ensure('trip:Chuyến đi mới của Nguyễn Ngọc Lan', 'trip', '/me/trips', '/me/trips', {
            'name': 'Chuyến đi mới của Nguyễn Ngọc Lan', 'start_date': '2026-12-18', 'end_date': '2026-12-19',
            'timezone': 'Asia/Ho_Chi_Minh', 'currency': 'VND', 'budget': 0}, 'lan')
        print('READY 5 trips including an empty draft and a 2-destination, 5-day itinerary', flush=True)

    def community(self):
        for index, place in enumerate(self.places):
            actor = 'lan' if index % 2 == 0 else 'minh'
            rating, content = REVIEW_FIXTURES[index] if index < len(REVIEW_FIXTURES) else (None, None)
            if content is None:
                continue
            existing = self.mongo('reviews', {'user_id': self.state['user:' + actor]['user_id'], 'place_id': rid(place)})
            for row in existing:
                row['review_id'] = row['_id']
            review_key = 'review:' + rid(place)
            legacy_content = f'{place["name"]} là điểm dừng chân đáng nhớ. Nên đi buổi sáng, mang nước uống và dành thời gian tìm hiểu văn hóa địa phương. Đây là đánh giá mẫu để thử nghiệm SmartTravel.'
            legacy_rating = 4 + index % 2
            migrated_legacy = False
            if review_key not in self.state and existing:
                if len(existing) != 1 or not is_seed_review(existing[0], rating, content, legacy_rating, legacy_content):
                    raise RuntimeError(f'Untracked review collision for {place["name"]}; refusing to adopt or change user content')
                migrated_legacy = existing[0].get('content') == legacy_content
            review = self.ensure(review_key, 'community', '',
                                 '/places/' + rid(place) + '/reviews', {'rating': rating, 'content': content, 'media_keys': []},
                                 actor, match=lambda r, p=place: r['place_id'] == rid(p), existing=existing)
            seed_owned_this_run = review_key in self.fresh or migrated_legacy
            previous_status = review.get('status')
            if (review.get('content') == legacy_content and review.get('rating') == legacy_rating
                    and previous_status in {'APPROVED', 'PENDING'}):
                review = self.call('community', '/reviews/' + rid(review), 'PATCH',
                                   {'rating': rating, 'content': content, 'media_keys': []}, actor,
                                   version=review['version'])
                self.updated += 1
                if previous_status == 'APPROVED':
                    decision = self.call('community', '/admin/reviews/' + rid(review) + '/moderate', 'POST',
                              {'action': 'APPROVE', 'reason': 'Duyệt lại đánh giá mẫu sau khi chuẩn hóa nội dung'},
                              version=review['version'])
                    self.updated += 1
                    review['status'] = 'APPROVED'
                    review['version'] = decision['version']
            self.seed_review_author(rid(review), self.state['user:' + actor]['user_id'],
                                    self.state['user:' + actor]['display_name'])
            if index % 5 != 0 and 'review-approved:' + rid(place) not in self.state:
                if review.get('status') == 'PENDING' and seed_owned_this_run:
                    decision = self.call('community', '/admin/reviews/' + rid(review) + '/moderate', 'POST',
                              {'action': 'APPROVE', 'reason': 'Đánh giá mẫu phục vụ kiểm thử thủ công'}, version=review['version'])
                    review['status'] = 'APPROVED'
                    review['version'] = decision['version']
                    self.updated += 1
                if review.get('status') == 'APPROVED':
                    self.state['review-approved:' + rid(place)] = {'review_id': rid(review)}
                    self.save()
            if index == 0 and 'review-rejected:' + rid(place) not in self.state:
                if (review.get('status') == 'PENDING' and review.get('rating') == rating
                        and review.get('content') == content and seed_owned_this_run):
                    decision = self.call('community', '/admin/reviews/' + rid(review) + '/moderate', 'POST',
                              {'action': 'REJECT', 'reason': 'Đánh giá mẫu để kiểm tra hàng chờ từ chối'},
                              version=review['version'])
                    review['status'] = 'REJECTED'
                    review['version'] = decision['version']
                    self.updated += 1
                    self.state['review-rejected:' + rid(place)] = {'review_id': rid(review)}
                    self.save()
                elif review.get('status') == 'REJECTED':
                    self.state['review-rejected:' + rid(place)] = {'review_id': rid(review)}
                    self.save()
        self.seed_rejected_review()
        for key, target_index, actor, reason in [
            ('report:review', 1, 'lan', 'Đề nghị kiểm tra nhận xét về lối tham quan và thời gian cần thiết.'),
            ('report:review:cho-dong-ba', 18, 'minh', 'Đề nghị quản trị viên xem lại nội dung nhận xét và trải nghiệm được mô tả.'),
            ('report:review:vuon-hoa-da-lat', 23, 'lan', 'Đề nghị xác minh nhận xét về tình trạng khu vực trưng bày theo mùa.'),
        ]:
            target = self.places[target_index]
            self.ensure(key, 'community', '/admin/reports',
                        '/reviews/' + rid(self.state['review:' + rid(target)]) + '/reports',
                        {'reason': reason}, actor,
                        match=lambda row, target=target: row.get('review_id') == rid(self.state['review:' + rid(target)]),
                        list_actor='admin')
        for name, kind, target in [
            ('Làng rau Trà Quế', 'ADD', None), ('Rừng dừa Bảy Mẫu Cẩm Thanh', 'ADD', None),
            ('Bãi biển Mỹ Khê', 'EDIT', self.places[10]),
        ]:
            fields = {'name': name, 'latitude': 15.9030, 'longitude': 108.3480,
                      'category_ids': [self.cats['Du lịch cộng đồng']]}
            if target:
                fields = {'name': name, 'opening_hours': [{'weekday': d, 'open': '05:00', 'close': '22:00', 'overnight': False} for d in range(7)]}
            self.ensure('contribution:' + name, 'community', '/me/contributions', '/contributions',
                        {'type': kind, 'target_id': rid(target) if target else None,
                         'expected_version': target['version'] if target else 0, 'fields': fields}, 'lan',
                        match=lambda r, n=name: r.get('fields', {}).get('name') == n)
        print('READY 29 review fixtures (28 landmark reviews plus one dedicated moderation example), 3 reports and 3 contributions', flush=True)

    def seed_rejected_review(self):
        place = self.places[0]
        actor = 'minh'
        key = 'review:moderation-rejected'
        rating, content = REJECTED_REVIEW_FIXTURE
        existing = self.mongo('reviews', {'user_id': self.state['user:' + actor]['user_id'], 'place_id': rid(place)})
        for row in existing:
            row['review_id'] = row['_id']
        if key not in self.state and existing and (len(existing) != 1 or not is_seed_review(existing[0], rating, content)):
            raise RuntimeError('Untracked review collision for rejected-review fixture; refusing to change user content')
        review = self.ensure(key, 'community', '', '/places/' + rid(place) + '/reviews',
                             {'rating': rating, 'content': content, 'media_keys': []}, actor,
                             match=lambda row: row.get('place_id') == rid(place)
                             and row.get('rating') == rating and row.get('content') == content,
                             existing=existing)
        self.seed_review_author(rid(review), self.state['user:' + actor]['user_id'],
                                self.state['user:' + actor]['display_name'])
        if review.get('status') == 'PENDING' and key in self.fresh:
            decision = self.call('community', '/admin/reviews/' + rid(review) + '/moderate', 'POST',
                                 {'action': 'REJECT', 'reason': 'Đánh giá mẫu dành riêng cho hàng chờ từ chối'},
                                 version=review['version'])
            review['status'] = 'REJECTED'
            review['version'] = decision['version']
            self.updated += 1
        self.state['review:moderation-rejected'] = review
        self.state['review-rejected:moderation-rejected'] = {'review_id': rid(review), 'status': review.get('status')}
        self.save()

    def businesses(self):
        for name, verified, index in [('Du lịch Miền Trung Xanh', True, 10), ('Trải nghiệm Di sản Hội An', False, 15)]:
            business = self.ensure('business:' + name, 'catalog', '/businesses', '/businesses', {'name': name}, 'business')
            path = '/businesses/' + rid(business)
            # This API has no public list for requests. Recover by DB identity if the manifest is lost.
            for kind, table, column, body in [
                ('verification', 'business_verifications', 'request_id', {'evidence_keys': ['private/demo/ho-so-doanh-nghiep-mau.pdf']}),
                ('claims', 'business_place_claims', 'claim_id', {'place_id': rid(self.places[index]), 'evidence_keys': ['private/demo/ho-so-quan-ly-dia-diem-mau.pdf']}),
            ]:
                if kind == 'claims' and not verified:
                    continue  # The service correctly requires a verified business before claiming.
                key = kind + ':' + name
                if key not in self.state:
                    extra = f" AND place_id='{rid(self.places[index])}'" if kind == 'claims' else ''
                    result = compose('exec', '-T', 'catalog-db', 'psql', '-U', 'catalog_admin', '-d', 'catalog_db', '-At', '-c',
                                     f"SELECT row_to_json(t) FROM (SELECT {column},status,version FROM catalog.{table} WHERE business_id='{rid(business)}'{extra}) t")
                    rows = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
                    if len(rows) > 1:
                        raise RuntimeError('Ambiguous business demo request')
                    self.state[key] = rows[0] if rows else self.call('catalog', path + '/' + kind, 'POST', body, 'business')
                    self.save()
                row = self.state[key]
                if verified and 'approved:' + key not in self.state:
                    review_kind = 'business-verifications' if kind == 'verification' else 'claims'
                    self.call('catalog', '/admin/' + review_kind + '/' + str(row[column]) + '/review', 'POST',
                              {'action': 'APPROVE', 'reason': 'Hồ sơ giả lập dành riêng cho kiểm thử local'}, version=row['version'])
                    self.state['approved:' + key] = {'approved': True}
                    self.save()
            if verified:
                pending_key = 'claims:Hội An · Chờ xét duyệt'
                if pending_key not in self.state:
                    place_id = rid(self.places[15])
                    rows = self.sql('catalog', f"SELECT row_to_json(t) FROM (SELECT claim_id,status,version FROM catalog.business_place_claims WHERE business_id='{rid(business)}' AND place_id='{place_id}') t")
                    found = [json.loads(line) for line in rows.splitlines() if line.startswith('{')]
                    if len(found) > 1:
                        raise RuntimeError('Ambiguous pending demo claim')
                    self.state[pending_key] = found[0] if found else self.call('catalog', path + '/claims', 'POST',
                        {'place_id': place_id, 'evidence_keys': ['private/demo/ho-so-quan-ly-hoi-an-mau.pdf']}, 'business')
                    self.save()
                key = 'change-request:' + name
                claim = self.state['claims:' + name]
                if key not in self.state:
                    rows = self.sql('catalog', f"SELECT row_to_json(t) FROM (SELECT request_id,claim_id,status,version FROM catalog.change_requests WHERE claim_id='{claim['claim_id']}') t")
                    found = [json.loads(line) for line in rows.splitlines() if line.startswith('{')]
                    if len(found) > 1:
                        raise RuntimeError('Ambiguous demo change request')
                    if found:
                        self.state[key] = found[0]
                    else:
                        current = self.call('catalog', '/places/' + rid(self.places[index]))
                        self.state[key] = self.call('catalog', '/claims/' + str(claim['claim_id']) + '/change-requests', 'POST',
                                                    {'fields': {'price': 20000}, 'expected_version': current['version']}, 'business')
                    self.save()
        print('READY 2 businesses: verified/pending, approved/pending claims and pending change request', flush=True)

    def ingestion(self):
        source = self.ensure('source:demo', 'ingestion', '/admin/data-sources', '/admin/data-sources', {
            'name': 'Cẩm nang du lịch miền Trung · Nguồn mẫu nội bộ',
            'uri': 'http://source-sandbox:8080/records?run=demo-vietnam', 'secret_reference': 'none',
            'license_version': 'demo-local-v1', 'allow_storage': True, 'allow_training': False})
        key = 'job:demo'
        if key not in self.state:
            result = compose('exec', '-T', 'ingestion-db', 'psql', '-U', 'ingestion_admin', '-d', 'ingestion_db', '-At', '-c',
                             f"SELECT row_to_json(t) FROM (SELECT job_id,status FROM ingestion.import_jobs WHERE source_id='{rid(source)}') t")
            jobs = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
            if len(jobs) > 1:
                raise RuntimeError('Ambiguous demo import job')
            self.state[key] = jobs[0] if jobs else self.call('ingestion', '/admin/data-sources/' + rid(source) + '/import-jobs', 'POST', {'mode': 'FULL'})
            self.save()
        print('READY named ingestion source and import job', flush=True)

    def supporting_data(self):
        # Local fixture-only inserts for data without a public creation API.
        # Stable UUIDs + DO NOTHING preserve edits/read states on subsequent runs.
        for actor in ['lan', 'minh', 'business', 'manager']:
            user_id = self.state['user:' + actor]['user_id']
            names = [p['name'] for p in self.places[:24]] if actor == 'lan' else [
                'Bộ sưu tập du lịch đã sẵn sàng', 'Hướng dẫn kiểm thử đánh giá địa điểm', 'Theo dõi trạng thái đóng góp']
            for index, name in enumerate(names):
                key = f'notification:{actor}:{index}'
                notification_id = str(uuid.uuid5(NAMESPACE, key))
                event_id = str(uuid.uuid5(NAMESPACE, key + ':event'))
                payload = json.dumps({'title': ('Cẩm nang mẫu · ' + name), 'body': 'Thông báo mẫu để thử chức năng đã đọc/chưa đọc.'}, ensure_ascii=False).replace("'", "''")
                self.sql('identity', f"INSERT INTO identity.notifications(notification_id,user_id,source_event_id,notification_type,payload,read_at) VALUES ('{notification_id}','{user_id}','{event_id}','DEMO_MANUAL_TEST','{payload}'::jsonb,{'now()' if index % 3 == 0 else 'NULL'}) ON CONFLICT DO NOTHING")
                self.state.setdefault(key, {'notification_id': notification_id})
        for key, business in list(self.state.items()):
            if not key.startswith('business:'):
                continue
            editor_id = self.state['user:editor']['user_id']
            member_id = str(uuid.uuid5(NAMESPACE, 'editor:' + rid(business)))
            self.sql('catalog', f"INSERT INTO catalog.business_members(business_id,user_id,member_role,member_id) VALUES ('{rid(business)}','{editor_id}','EDITOR','{member_id}') ON CONFLICT (business_id,user_id) DO NOTHING")
            actual = self.sql('catalog', f"SELECT member_id FROM catalog.business_members WHERE business_id='{rid(business)}' AND user_id='{editor_id}'")
            self.state.setdefault('member:' + rid(business), {'member_id': actual})
        self.save()
        self.media_fixture()
        print('READY 33 persisted notifications, business editor and quarantined photo', flush=True)

    def media_fixture(self):
        from PIL import Image
        photo = ROOT / 'frontend/public/images/editorial/hoi-an.webp'
        output = io.BytesIO()
        with Image.open(photo) as image:
            image.convert('RGB').save(output, format='JPEG', quality=85)
        content = output.getvalue()
        checksum = hashlib.sha256(content).hexdigest()
        owner = self.state['user:manager']['user_id']
        rows = self.sql('catalog', f"SELECT row_to_json(t) FROM (SELECT media_id,object_key,moderation_status FROM catalog.media_assets WHERE checksum='{checksum}' AND created_by='{owner}') t")
        found = [json.loads(line) for line in rows.splitlines() if line.startswith('{')]
        if not found:
            boundary = 'smarttravel-demo-' + uuid.uuid4().hex
            data = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="pho-co-hoi-an.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'.encode()
                    + content + f'\r\n--{boundary}--\r\n'.encode())
            req = Request(GATEWAY + '/api/catalog/api/v1/admin/media', data=data, method='POST', headers={
                'Authorization': 'Bearer ' + self.tokens['manager'], 'Content-Type': 'multipart/form-data; boundary=' + boundary})
            with urlopen(req, timeout=30) as response:
                found = [json.load(response)]
        if len(found) != 1:
            raise RuntimeError('Ambiguous demo photo')
        self.state['media:Phố cổ Hội An · Chờ quét và duyệt'] = found[0]
        self.save()

    def verify_rating_projections(self):
        deadline = time.monotonic() + 45
        while True:
            pending = []
            for place in self.places:
                place_id = rid(place)
                reviews = self.rows('community', '/places/' + place_id + '/reviews')
                actual = self.call('catalog', '/places/' + place_id)
                count = len(reviews)
                average = sum(int(row['rating']) for row in reviews) / count if count else None
                actual_count = int(actual.get('review_count') or 0)
                actual_average = actual.get('rating_avg')
                matches_average = (count == 0 and actual_average in (None, 0, 0.0)) or (
                    count > 0 and actual_average is not None and abs(float(actual_average) - average) < 0.02)
                if actual_count != count or not matches_average:
                    pending.append(place['name'])
            if not pending:
                print('PASS rating projection matches approved public reviews for all seeded places', flush=True)
                return
            if time.monotonic() >= deadline:
                raise RuntimeError('Rating projection deadline exceeded for: ' + ', '.join(pending[:8]))
            time.sleep(.75)

    def verify_empty_account(self, alias):
        user_id = self.state['user:' + alias]['user_id']
        assert not self.mongo('favorites', {'user_id': user_id}), alias + ' favorites'
        assert not self.mongo('collections', {'owner_id': user_id}), alias + ' collections'
        assert not self.mongo('reviews', {'user_id': user_id}), alias + ' reviews'
        assert not self.mongo('contributions', {'user_id': user_id}), alias + ' contributions'
        defaults = self.sql('identity', f"""
            SELECT count(*) || ':' || count(*) FILTER (
                WHERE budget_level='MID' AND budget_min IS NULL AND budget_max IS NULL
                  AND currency='VND' AND companion_type IS NULL AND indoor_outdoor IS NULL
                  AND personalization_enabled=false AND consent_version=1 AND version=1
            ) FROM identity.user_preferences WHERE user_id='{user_id}'
        """)
        assert defaults == '1:1', alias + ' default preferences'
        assert self.sql('identity', f"SELECT count(*) FROM identity.user_category_preferences WHERE user_id='{user_id}'") == '0'
        assert self.sql('identity', f"SELECT count(*) FROM identity.user_preference_options WHERE user_id='{user_id}'") == '0'
        assert self.sql('trip', f"SELECT count(*) FROM trip.trips WHERE user_id='{user_id}'") == '0'

    def verify_trip_relationships(self):
        for trip_key, trip in ((key, value) for key, value in self.state.items() if key.startswith('trip:')):
            trip_id = rid(trip)
            trip_path = '/trips/' + trip_id
            actual_trip = self.call('trip', trip_path, actor='lan')
            assert rid(actual_trip) == trip_id, trip_key + ' detail id'
            segment_ids = {rid(row) for row in self.rows('trip', trip_path + '/destinations', 'lan')}
            day_rows = self.rows('trip', trip_path + '/days', 'lan')
            day_ids = {rid(row) for row in day_rows}
            expected_segments = {rid(value) for key, value in self.state.items()
                                 if key.startswith('segment:') and key[len('segment:'):].startswith(trip['name'])}
            expected_days = {rid(value) for key, value in self.state.items()
                             if key.startswith('day:') and key[len('day:'):].startswith(trip['name'])}
            assert expected_segments <= segment_ids, trip_key + ' destination relationship'
            assert expected_days <= day_ids, trip_key + ' day relationship'
            actual_item_ids = set()
            for day in day_rows:
                actual_item_ids.update(rid(row) for row in self.rows(
                    'trip', trip_path + '/days/' + rid(day) + '/items', 'lan'))
            expected_items = {rid(value) for key, value in self.state.items()
                              if key.startswith('trip-item:') and trip['name'] in key}
            assert expected_items <= actual_item_ids, trip_key + ' day item relationship'
            transfer_ids = {rid(row) for row in self.rows('trip', trip_path + '/transfers', 'lan')}
            expected_transfers = {rid(value) for key, value in self.state.items()
                                  if key.startswith('transfer:') and key[len('transfer:'):].startswith(trip['name'])}
            assert expected_transfers <= transfer_ids, trip_key + ' transfer relationship'

    def verify(self):
        initial_baseline = VERIFICATION_BASELINE_KEY not in self.state
        for place in self.places:
            actual = self.call('catalog', '/places/' + rid(place))
            assert actual['name'] == place['name']
            assert actual.get('description'), place['name'] + ' description'
        no_price = next(p for p in self.places if p['name'] == 'Nhà thờ Lớn Hà Nội')
        unknown = self.call('catalog', '/places/' + rid(no_price))
        assert unknown.get('price') is None and unknown.get('price_min') is None, 'unknown price must stay null'
        draft = self.call('catalog', '/admin/places/' + rid(self.draft_place))
        assert draft['status'] == 'DRAFT', 'draft must remain private'
        status, _, _ = request(GATEWAY, '/api/catalog/api/v1/places/' + rid(self.draft_place))
        assert status == 404, 'draft place leaked to public Catalog'
        for service, path, actor in [('community', '/me/collections', 'lan'),
                                     ('community', '/me/contributions', 'lan'), ('trip', '/me/trips', 'lan'),
                                     ('catalog', '/businesses', 'business'), ('ingestion', '/admin/data-sources', 'admin')]:
            assert self.rows(service, path, actor), (service, path)
        if initial_baseline:
            for alias in ['new-user', 'password-change', 'delete-account']:
                self.verify_empty_account(alias)
        empty_collection = self.state['collection:Điểm muốn xem sau']
        empty_trip = self.state['trip:Chuyến đi mới của Nguyễn Ngọc Lan']
        if initial_baseline:
            assert not self.mongo('collection_items', {'collection_id': rid(empty_collection)}), 'empty collection fixture'
            assert self.sql('trip', f"SELECT count(*) FROM trip.trip_days WHERE trip_id='{rid(empty_trip)}'") == '0'
            assert self.sql('trip', f"SELECT count(*) FROM trip.trip_destinations WHERE trip_id='{rid(empty_trip)}'") == '0'
        # Store verification uses exact IDs; no credentials/PII printed in evidence.
        place_ids = ','.join("'" + rid(p) + "'" for p in self.places)
        result = compose('exec', '-T', 'catalog-db', 'psql', '-U', 'catalog_admin', '-d', 'catalog_db', '-At', '-c',
                         f'SELECT count(*) FROM catalog.places WHERE place_id IN ({place_ids})')
        assert result.stdout.strip() == str(len(self.places))
        trip_ids = ','.join("'" + rid(v) + "'" for k, v in self.state.items() if k.startswith('trip:'))
        result = compose('exec', '-T', 'trip-db', 'psql', '-U', 'trip_admin', '-d', 'trip_db', '-At', '-c',
                         f'SELECT count(*) FROM trip.trips WHERE trip_id IN ({trip_ids})')
        expected_trips = sum(k.startswith('trip:') for k in self.state)
        assert result.stdout.strip() == str(expected_trips), result.stdout
        counts = {'places': len(self.places), 'draft_places': 1, 'trips': expected_trips}
        for prefix, collection in [('review:', 'reviews'), ('collection:', 'collections'),
                                   ('collection-item:', 'collection_items'), ('contribution:', 'contributions'),
                                   ('report:', 'review_reports')]:
            ids = [rid(v) for k, v in self.state.items() if k.startswith(prefix)]
            found = self.mongo(collection, {'_id': {'$in': ids}})
            assert {r['_id'] for r in found} == set(ids), collection
            counts[collection] = len(found)
            if collection == 'reviews':
                rating_values = {int(row['rating']) for row in found}
                status_counts = {status: sum(1 for row in found if row.get('status') == status)
                                 for status in sorted({row.get('status') for row in found})}
                counts['review_ratings'] = sorted(rating_values)
                counts['review_statuses'] = status_counts
                assert all(row.get('author_name') for row in found), 'seed review author names'
                if initial_baseline:
                    assert {1, 2, 3, 4, 5} <= rating_values, 'seed review rating range'
                    assert {'APPROVED', 'PENDING', 'REJECTED'} <= set(status_counts), status_counts
        for service, table, field, prefix in [
            ('identity', 'users', 'user_id', 'user:'), ('identity', 'notifications', 'notification_id', 'notification:'),
            ('catalog', 'businesses', 'business_id', 'business:'),
            ('catalog', 'business_verifications', 'request_id', 'verification:'),
            ('catalog', 'business_place_claims', 'claim_id', 'claims:'),
            ('catalog', 'change_requests', 'request_id', 'change-request:'),
            ('ingestion', 'data_sources', 'source_id', 'source:'), ('ingestion', 'import_jobs', 'job_id', 'job:'),
            ('catalog', 'media_assets', 'media_id', 'media:'),
            ('catalog', 'business_members', 'member_id', 'member:'),
            ('trip', 'trip_days', 'day_id', 'day:'),
            ('trip', 'trip_destinations', 'trip_destination_id', 'segment:'),
            ('trip', 'itinerary_items', 'item_id', 'trip-item:'),
            ('trip', 'transfer_items', 'transfer_id', 'transfer:'),
        ]:
            ids = [v[field] if field in v else rid(v) for k, v in manifest_entries(self.state, prefix)]
            assert ids, prefix
            quoted = ','.join("'" + str(uuid.UUID(i)) + "'" for i in ids)
            found = self.sql(service, f'SELECT {field} FROM {service}.{table} WHERE {field} IN ({quoted})').splitlines()
            assert set(found) == set(ids), table
            counts[table] = len(found)
        counts['favorites'] = 0
        for actor in ['lan', 'minh']:
            expected = {v['place_id'] for k, v in self.state.items() if k.startswith('favorite:' + actor)}
            user_id = self.state['user:' + actor]['user_id']
            found = self.mongo('favorites', {'user_id': user_id, 'place_id': {'$in': list(expected)}})
            assert {r['place_id'] for r in found} == expected
            counts['favorites'] += len(found)
            assert self.sql('identity', f"SELECT count(*) FROM identity.user_preferences WHERE user_id='{user_id}'") == '1'
        assert len(self.rows('identity', '/me/notifications', 'lan')) >= 24
        self.verify_trip_relationships()
        self.verify_rating_projections()
        job = self.call('ingestion', '/admin/import-jobs/' + rid(self.state['job:demo']))
        items = self.rows('ingestion', '/admin/import-jobs/' + rid(self.state['job:demo']) + '/items')
        item_statuses = sorted({row.get('status') for row in items})
        counts['demo_import_job'] = {'status': job.get('status'), 'items': len(items), 'item_statuses': item_statuses}
        assert len(items) >= 3 and {'FAILED', 'NEEDS_REVIEW'} <= set(item_statuses)
        if initial_baseline:
            self.state[VERIFICATION_BASELINE_KEY] = {
                'verified_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'places': len(self.places), 'reviews': counts['reviews']}
            self.save()
        print('PASS exact-ID persistence in PostgreSQL and MongoDB: ' + json.dumps(counts, sort_keys=True), flush=True)
        print(f'PASS new records this run: {self.created}', flush=True)
        print(f'PASS seed-owned updates this run: {self.updated}', flush=True)

    def hide_legacy_places(self):
        """Use Catalog visibility workflow, preserving rows, references and audit events."""
        protected = {rid(v) for k, v in self.state.items() if k.startswith('place:')}
        candidates = [r for r in self.rows('catalog', '/admin/places')
                      if r.get('status') == 'PUBLISHED' and legacy_test_place(r) and rid(r) not in protected]
        for row in candidates:
            key = 'legacy-hidden:' + rid(row)
            self.state.setdefault(key, {'place_id': rid(row), 'name': row['name'], 'previous_status': row['status']})
            self.save()
            self.call('catalog', '/admin/places/' + rid(row) + '/status', 'PUT',
                      {'status': 'HIDDEN'}, version=row['version'])
        public = self.rows('catalog', '/places')
        assert not any(legacy_test_place(r) for r in public)
        assert protected <= {rid(r) for r in public}, 'Named demo places must remain published'
        hidden_ids = [v['place_id'] for k, v in self.state.items() if k.startswith('legacy-hidden:')]
        if hidden_ids:
            quoted = ','.join("'" + str(uuid.UUID(i)) + "'" for i in hidden_ids)
            actual = self.sql('catalog', f"SELECT place_id FROM catalog.places WHERE status='HIDDEN' AND place_id IN ({quoted})").splitlines()
            assert set(actual) == set(hidden_ids)
        print(f'PASS hidden legacy test places this run: {len(candidates)}; public places: {len(public)}; named demo places retained: {len(protected)}; persisted hidden: {len(hidden_ids)}', flush=True)


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-only', action='store_true', help='Read API/database fixtures without reseeding')
    parser.add_argument('--hide-legacy-tests', action='store_true', help='Hide old machine-named test places through Catalog')
    parser.add_argument('--catalog-only', action='store_true', help='Seed/migrate local catalog geography without changing personal fixtures')
    args = parser.parse_args()
    demo = Demo()
    if args.catalog_only:
        status, session, _ = request(GATEWAY, '/api/identity/api/v1/auth/login', 'POST',
                                    {'email': 'fixture-admin@example.invalid', 'password': demo.password})
        if status != 200:
            raise RuntimeError(f'Local catalog login: HTTP {status}')
        demo.tokens['admin'] = session['access_token']
        demo.catalog()
        print(f'Catalog seed: {demo.created} created, {demo.updated} updated', flush=True)
        return
    if args.hide_legacy_tests:
        status, session, _ = request(GATEWAY, '/api/identity/api/v1/auth/login', 'POST',
                                    {'email': 'fixture-admin@example.invalid', 'password': demo.password})
        if status != 200:
            raise RuntimeError(f'Local admin login: HTTP {status}')
        demo.tokens['admin'] = session['access_token']
        demo.hide_legacy_places()
        return
    if args.verify_only:
        credentials = json.loads(ACCOUNTS.read_text(encoding='utf-8'))
        for actor, email, password in [
            ('admin', 'fixture-admin@example.invalid', demo.password),
            *[(a['alias'], a['email'], credentials['password']) for a in credentials['accounts']],
        ]:
            status, session, _ = request(GATEWAY, '/api/identity/api/v1/auth/login', 'POST', {'email': email, 'password': password})
            if status != 200:
                raise RuntimeError(f'Verification login {actor}: HTTP {status}')
            demo.tokens[actor] = session['access_token']
        demo.places = [v for k, v in demo.state.items() if k.startswith('place:')]
        assert len(demo.places) == len(PLACE_DESCRIPTIONS), 'Tracked named-place manifest is incomplete'
        demo.draft_place = demo.state['draft-place:Vườn Bách Thảo Hà Nội']
        demo.verify()
        return
    demo.accounts()
    demo.catalog()
    demo.personal()
    demo.trips()
    demo.community()
    demo.businesses()
    demo.ingestion()
    demo.supporting_data()
    demo.verify()
    print('Credentials: backend/infra/.local/p02/demo-accounts.json; record IDs: backend/infra/.local/p02/demo-records.json')


if __name__ == '__main__':
    main()
