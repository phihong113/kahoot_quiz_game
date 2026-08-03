/**
 * ============================================================================
 * GOOGLE APPS SCRIPT - BỘ QUẢN LÝ BẢN QUYỀN & XÁC THỰC GIÁO VIÊN QUIZMASTER LIVE
 * (TỰ ĐỘNG TẠO TIÊU ĐỀ CỘT & BẢO MẬT CHỐNG BẺ KHÓA)
 * ============================================================================
 * SỬ DỤNG CHO GOOGLE SHEET:
 * https://docs.google.com/spreadsheets/d/1ozyUT1aWEBl-RD5L-CE6_TSdbPLwioyUE-DeVBW_m8U/edit
 * 
 * Hướng dẫn 3 bước cập nhật (Chỉ mất 30 giây):
 * 1. Mở link Google Sheet ở trên.
 * 2. Vào Tiện ích mở rộng (Extensions) -> Apps Script.
 * 3. Dán đè toàn bộ mã bên dưới -> Bấm Lưu (Save) -> Bấm Triển khai (Deploy) -> Quản lý các bản triển khai (Manage deployments) -> Sửa (Edit) -> Chọn Phiên bản MỚI (New version) -> Triển khai (Deploy).
 * ============================================================================
 */

const MAX_ALLOWED_DEVICES = 2; // Số máy tối đa 1 tài khoản được phép sử dụng

function doGet(e) {
  const params = e ? (e.parameter || {}) : {};
  const action = params.action || 'google_auth';
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // TỰ ĐỘNG KHỞI TẠO HÀNG TIÊU ĐỀ HÀNG 1 NẾU CHƯA CÓ HOẶC THIẾU CỘT
  ensureHeadersExist(sheet);

  const data = sheet.getDataRange().getValues();
  if (!data || data.length === 0) {
    return jsonResponse({ success: false, message: 'Google Sheet rỗng!' });
  }

  const headers = data[0].map(h => String(h || '').trim().toLowerCase());

  // --------------------------------------------------------------------------
  // ACTION 1: GOOGLE AUTHENTICATION & TEACHER ACTIVE CHECK WITH DEVICE BINDING
  // --------------------------------------------------------------------------
  if (action === 'google_auth' || action === 'check_teacher') {
    const email = String(params.email || '').trim().toLowerCase();
    const name = String(params.name || '').trim();
    const deviceId = String(params.deviceId || '').trim();

    if (!email) {
      return jsonResponse({ success: false, message: 'Vui lòng cung cấp Email!' });
    }

    let emailCol = headers.findIndex(h => h.includes('email') || h.includes('tài khoản'));
    let nameCol = headers.findIndex(h => h.includes('name') || h.includes('tên') || h.includes('customer'));
    let activeCol = headers.findIndex(h => h.includes('active') || h.includes('kích hoạt') || h.includes('trạng thái') || h.includes('status'));
    let lastLoginCol = headers.findIndex(h => h.includes('lastlogin') || h.includes('thời gian') || h.includes('đăng nhập'));
    let devicesCol = headers.findIndex(h => h.includes('device') || h.includes('máy') || h.includes('hardware'));

    if (emailCol === -1) emailCol = 0;
    if (nameCol === -1) nameCol = 1;
    if (activeCol === -1) activeCol = 2;
    if (lastLoginCol === -1) lastLoginCol = 3;
    if (devicesCol === -1) devicesCol = 5; // Column F default

    let foundRowIndex = -1;
    let isActive = false;
    let deviceAllowed = true;
    let deviceMsg = "";

    const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    for (let i = 1; i < data.length; i++) {
      const rowEmail = String(data[i][emailCol] || '').trim().toLowerCase();
      if (rowEmail === email) {
        foundRowIndex = i;
        const activeVal = String(data[i][activeCol] || '').trim().toLowerCase();
        
        // Kiểm tra xem có dấu "x", "active", "true", "1", "vip" không
        if (['x', 'active', 'true', '1', 'yes', 'đã kích hoạt', 'vip'].includes(activeVal)) {
          isActive = true;
        }

        // --- CƠ CHẾ CHỐNG CHIA SẺ PHẦN MỀM (DEVICE HARDWARE ID BINDING) ---
        if (deviceId && isActive) {
          const rawDevices = String(data[i][devicesCol] || '').trim();
          let deviceList = rawDevices ? rawDevices.split(',').map(d => d.trim()).filter(Boolean) : [];

          if (!deviceList.includes(deviceId)) {
            if (deviceList.length >= MAX_ALLOWED_DEVICES) {
              deviceAllowed = false;
              deviceMsg = `Cảnh báo: Tài khoản này đã đăng nhập trên ${deviceList.length} máy tính khác nhau (Tối đa ${MAX_ALLOWED_DEVICES} máy). Vui lòng liên hệ Admin để reset thiết bị!`;
            } else {
              deviceList.push(deviceId);
              try {
                sheet.getRange(i + 1, devicesCol + 1).setValue(deviceList.join(', '));
              } catch (err) {}
            }
          }
        }

        // TỰ ĐỘNG CẬP NHẬT CỘT LASTLOGIN (DÒNG i+1, CỘT lastLoginCol+1)
        try {
          sheet.getRange(i + 1, lastLoginCol + 1).setValue(nowStr);
        } catch (err) {}
        break;
      }
    }

    // Nếu email chưa có trên Google Sheet -> Tự động thêm dòng mới chờ Admin duyệt
    if (foundRowIndex === -1) {
      const newRow = [];
      newRow[emailCol] = email;
      newRow[nameCol] = name || 'Giáo Viên Mới';
      newRow[activeCol] = ''; // Cột Active để trống -> Chờ Admin điền chữ 'x'
      newRow[lastLoginCol] = nowStr;
      if (deviceId) newRow[devicesCol] = deviceId;
      sheet.appendRow(newRow);

      return jsonResponse({
        success: true,
        active: false,
        email,
        name,
        message: 'Đã lưu email của bạn vào hệ thống. Tài khoản đang chờ Quản trị viên đánh dấu "x" ở cột Active để kích hoạt!'
      });
    }

    if (!deviceAllowed) {
      return jsonResponse({
        success: true,
        active: false,
        email,
        name,
        deviceLock: true,
        message: deviceMsg
      });
    }

    return jsonResponse({
      success: true,
      active: isActive,
      email,
      name,
      message: isActive ? 'Xác thực tài khoản VIP thành công!' : 'Tài khoản chưa được đánh dấu "x" kích hoạt trên Google Sheet!'
    });
  }

  // --------------------------------------------------------------------------
  // ACTION 2: LICENSE KEY VERIFICATION (Legacy Support)
  // --------------------------------------------------------------------------
  if (action === 'verify') {
    const key = (params.key || '').trim().toUpperCase();
    if (!key) {
      return jsonResponse({ success: false, message: 'Vui lòng cung cấp mã LicenseKey!' });
    }

    let keyCol = headers.findIndex(h => h.includes('license') || h.includes('key'));
    let nameCol = headers.findIndex(h => h.includes('name') || h.includes('customer') || h.includes('tên'));
    let activeCol = headers.findIndex(h => h.includes('active') || h.includes('status') || h.includes('trạng thái'));

    if (keyCol === -1) keyCol = 0;

    for (let i = 1; i < data.length; i++) {
      const rowKey = String(data[i][keyCol] || '').trim().toUpperCase();
      if (rowKey === key) {
        const activeVal = String(data[i][activeCol] || '').trim().toLowerCase();
        const isActive = ['x', 'active', 'true', '1', 'yes', 'vip'].includes(activeVal);
        return jsonResponse({
          success: true,
          valid: isActive,
          customerName: data[i][nameCol] || 'Giáo Viên VIP',
          message: isActive ? 'Mã bản quyền hợp lệ!' : 'Tài khoản chưa được kích hoạt trên hệ thống!'
        });
      }
    }
    return jsonResponse({ success: false, valid: false, message: 'Mã bản quyền không tồn tại!' });
  }

  return jsonResponse({ success: false, message: 'Action không hợp lệ!' });
}

/**
 * Tự động kiểm tra và thêm tiêu đề hàng 1 nếu Google Sheet bị thiếu tiêu đề cột
 */
function ensureHeadersExist(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 6);
  const row1Range = sheet.getRange(1, 1, 1, Math.max(lastCol, 6));
  const row1Values = row1Range.getValues()[0];

  const standardHeaders = ['Email', 'Name', 'Active', 'LastLogin', 'LicenseKey', 'Devices'];
  let modified = false;

  for (let i = 0; i < standardHeaders.length; i++) {
    if (!row1Values[i] || String(row1Values[i]).trim() === '') {
      row1Values[i] = standardHeaders[i];
      modified = true;
    }
  }

  if (modified) {
    sheet.getRange(1, 1, 1, standardHeaders.length).setValues([standardHeaders]);
    sheet.getRange(1, 1, 1, standardHeaders.length)
      .setFontWeight('bold')
      .setBackground('#4F46E5')
      .setFontColor('#FFFFFF');
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
