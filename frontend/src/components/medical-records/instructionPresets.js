/**
 * Common ways to take a medicine (Hướng dẫn sử dụng) offered in the prescription form.
 * The doctor can pick several (joined with "; ") or type their own text.
 */
const g = (group, labels) => labels.map((label) => ({ group, label }));

const INSTRUCTION_PRESETS = [
  ...g('Thời điểm uống', [
    'Uống sau ăn',
    'Uống sau ăn no',
    'Uống trước ăn 30 phút',
    'Uống lúc đói, buổi sáng trước ăn sáng',
    'Uống buổi tối trước khi đi ngủ'
  ]),
  ...g('Số lần trong ngày', [
    'Ngày uống 1 lần vào buổi sáng',
    'Ngày uống 2 lần: sáng – tối',
    'Ngày uống 3 lần: sáng – trưa – chiều',
    'Ngày uống 4 lần, cách nhau 6 giờ'
  ]),
  ...g('Khi cần', [
    'Uống khi sốt trên 38,5°C, cách nhau ít nhất 4–6 giờ',
    'Uống khi đau, cách nhau ít nhất 4–6 giờ, không quá 4 lần/ngày',
    'Uống khi buồn nôn hoặc nôn',
    'Uống khi ho nhiều'
  ]),
  ...g('Cách dùng', [
    'Uống nguyên viên với nhiều nước, không nhai, không bẻ',
    'Nhai kỹ rồi nuốt',
    'Ngậm dưới lưỡi',
    'Pha gói thuốc với 100 ml nước ấm, khuấy tan rồi uống',
    'Lắc kỹ chai trước khi dùng'
  ]),
  ...g('Thuốc dùng ngoài', [
    'Nhỏ mắt 1 giọt mỗi bên, ngày 3 lần',
    'Nhỏ mũi 2 giọt mỗi bên, ngày 3 lần',
    'Xịt mũi 1–2 nhát mỗi bên, ngày 2 lần',
    'Xịt họng 2–3 nhát, ngày 3 lần',
    'Súc miệng sau khi ăn và trước khi ngủ',
    'Bôi một lớp mỏng lên vùng da bệnh, ngày 2 lần',
    'Đặt âm đạo 1 viên trước khi ngủ'
  ]),
  ...g('Lưu ý', [
    'Uống đủ liệu trình, không tự ý ngưng thuốc',
    'Không uống rượu bia trong thời gian dùng thuốc',
    'Thuốc có thể gây buồn ngủ, không lái xe sau khi uống',
    'Uống nhiều nước trong ngày',
    'Ngưng thuốc và tái khám ngay nếu nổi mẩn, ngứa, khó thở'
  ])
];

export default INSTRUCTION_PRESETS;
