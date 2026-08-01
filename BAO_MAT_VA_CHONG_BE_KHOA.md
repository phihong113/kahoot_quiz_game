# 🛡️ BÁO CÁO BẢO MẬT & HƯỚNG DẪN CHỐNG BẺ KHÓA QUIZMASTER LIVE

---

## 🔒 1. TỔNG QUAN CƠ CHẾ BẢO MẬT HIỆN TẠI (5 LỚP BẢO VỆ)

Hệ thống **QuizMaster LIVE** sử dụng mô hình **Bảo mật đa tầng (Multi-Layered Security)** để đảm bảo người dùng hoặc bên đơn vị outsource không thể tự ý chia sẻ, sao chép hoặc bẻ khóa phần mềm:

```
[Màn Hình Trình Duyệt] 
       │
       ▼ (1. Google OAuth 2.0 Real Identity)
[Xác Thực Email Giáo Viên] 
       │
       ▼ (2. Device Hardware Fingerprint)
[Gửi Hardware ID Máy Tính] 
       │
       ▼ (3. Cloud Server Side API Check)
[Google Apps Script Executed on Cloud]
       │
       ▼ (4. Server-Side Enforcement)
[Node.js Server Limits Unverified Rooms]
```

---

## 🛡️ 2. CHI TIẾT 5 LỚP CHỐNG BẺ KHÓA & CHỐNG SAO CHÉP HÀNG LOẠT

### 🟢 Lớp 1: Xác Thực Danh Tính Thực Qua Google OAuth 2.0
- Sử dụng SDK chính thức của Google (`accounts.google.com/gsi/client`).
- Người dùng buộc phải đăng nhập bằng email `@gmail.com` thật của Google.
- Token được Google ký số (cryptographically signed JWT token), ngăn chặn 100% việc giả mạo email.

### 🟢 Lớp 2: Kiểm Tra Trạng Thái Kích Hoạt Trên Cloud (Google Sheets + Apps Script)
- Mã nguồn kiểm tra bản quyền nằm hoàn toàn trên Cloud (`Google Apps Script`).
- Người dùng local hoặc bên outsource **không thể đọc hay sửa mã nguồn `GOOGLE_APPS_SCRIPT.gs`** vì file này nằm trên tài khoản Google cá nhân của Admin.
- Chỉ khi Admin gõ chữ **`x`** vào cột `Active` trên Google Sheet thì hệ thống Cloud mới trả về `active: true`.

### 🟢 Lớp 3: Khóa Thiết Bị (Hardware ID / Device Binding - Chống chia sẻ hàng loạt)
- Mỗi máy tính khi chạy phần mềm sẽ tự tạo một **Mã định danh phần cứng duy nhất (Hardware Device ID)**.
- Khi đăng nhập, mã máy tính sẽ tự động gửi lên Google Sheet và lưu tại **Cột F (`Devices`)**.
- **Quy định giới hạn:** Mỗi tài khoản Giáo viên VIP chỉ được phép chạy tối đa trên **2 máy tính** (ví dụ: 1 máy ở trường và 1 máy ở nhà).
- Nếu ai đó copy phần mềm cho máy thứ 3,4... hệ thống Cloud sẽ lập tức khóa tài khoản và thông báo:  
  *`"Cảnh báo: Tài khoản này đã đăng nhập trên quá nhiều máy tính. Vui lòng liên hệ Admin!"`*

### 🟢 Lớp 4: Kiểm Tra Server-Side Trên Node.js (Node Backend Enforcement)
- Việc giới hạn phòng thi đấu (tối đa 1 học sinh nếu chưa kích hoạt) được kiểm tra trực tiếp trong file backend `server.js` khi học sinh gửi lệnh `join-room`.
- Kể cả khi có người cố tình chỉnh sửa file JS ở giao diện web (DevTools F12), server Node.js vẫn chặn ngay lập tức.

### 🟢 Lớp 5: Ghi Nhận Nhật Ký Đăng Nhập (Audit Logging)
- Mọi lượt đăng nhập đều được lưu thời gian thực vào cột **`LastLogin`** trên Google Sheet.
- Admin dễ dàng phát hiện các hành vi bất thường (ví dụ: 1 tài khoản đăng nhập liên tục từ nhiều IP/địa điểm khác nhau).

---

## 🛠️ 3. NÂNG CẤP BẢO MẬT NÂNG CAO (DÀNH CHO BÊN MUA OUTSOURCE/ĐÓNG GÓI)

Nếu muốn đóng gói phần mềm giao cho khách hàng hoặc bên outsource mà **100% KHÔNG THỂ XEM CÔNG THỨC / CODE**, Admin thực hiện 2 bước sau:

### 1️⃣ Đóng gói thành file chạy duy nhất `.exe` (Code Compilation)
Sử dụng công cụ `pkg` hoặc `nexe` để biên dịch toàn bộ code Node.js thành file `QuizMaster.exe` chạy độc lập:
- Mã nguồn JS bị nén thành mã máy (Binary Bytecode).
- Khách hàng không thể xem hay chỉnh sửa `server.js` hoặc `app.js`.

### 2️⃣ Obfuscate (Mã hóa rối code JS frontend)
Sử dụng `javascript-obfuscator` để mã hóa biến và hàm trong `public/app.js`:
- Biến toàn bộ tên hàm thành ký tự hexa vô nghĩa (ví dụ: `_0x4f2a`).
- Thêm cơ chế chống mở F12 / DevTools (Debug Lock).

---

## 📋 HƯỚNG DẪN QUẢN TRỊ VIÊN DUYỆT TÀI KHOẢN TRÊN GOOGLE SHEET

1. Mở file Google Sheet quản lý bản quyền.
2. Kiểm tra hàng vừa có Giáo viên mới đăng nhập.
3. Khi Giáo viên đã thanh toán / kích hoạt: Gõ chữ **`x`** vào cột **`Active`** (Cột C).
4. Nếu muốn khôi phục số máy cho Giáo viên đổi máy mới: Xóa nội dung trong cột **`Devices`** (Cột F) của hàng đó.
