/**
 * ============================================================================
 * GOOGLE APPS SCRIPT - BỘ QUẢN LÝ BẢN QUYỀN & XÁC THỰC GIÁO VIÊN QUIZMASTER LIVE
 * ============================================================================
 * SỬ DỤNG CHO GOOGLE SHEET:
 * https://docs.google.com/spreadsheets/d/1ozyUT1aWEBl-RD5L-CE6_TSdbPLwioyUE-DeVBW_m8U/edit
 * 
 * Hướng dẫn cài đặt 4 bước (Mất 1 phút):
 * 1. Mở link Google Sheet ở trên.
 * 2. Đặt Tiêu đề cho các cột ở Dòng 1 (Hàng 1) như sau:
 *    - Cột A: Email
 *    - Cột B: Name
 *    - Cột C: Active (Đánh dấu chữ x hoặc X để kích hoạt tài khoản cho Giáo viên)
 *    - Cột D: LastLogin
 *    - Cột E: LicenseKey
 * 3. Vào Tiện ích mở rộng (Extensions) -> Apps Script -> Dán toàn bộ mã nguồn bên dưới vào.
 * 4. Bấm nút Lưu (Save) -> Triển khai (Deploy) -> Triển khai mới (New deployment):
 *    - Chọn loại: Ứng dụng web (Web App)
 *    - Thực thi dưới dạng: Tôi (Me)
 *    - Ai có quyền truy cập: Bất kỳ ai (Anyone)
 *    - Bấm Triển khai và sao chép URL Web App để sử dụng!
 * ============================================================================
 */

function doGet(e) {
  const params = e ? (e.parameter || {}) : {};
  const action = params.action || 'google_auth';
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  if (!data || data.length === 0) {
    return jsonResponse({ success: false, message: 'Google Sheet rỗng!' });
  }

  const headers = data[0].map(h => String(h || '').trim().toLowerCase());

  // --------------------------------------------------------------------------
  // ACTION 1: GOOGLE AUTHENTICATION & TEACHER ACTIVE CHECK (Google Sheet Sync)
  // --------------------------------------------------------------------------
  if (action === 'google_auth' || action === 'check_teacher') {
    const email = String(params.email || '').trim().toLowerCase();
    const name = String(params.name || '').trim();

    if (!email) {
      return jsonResponse({ success: false, message: 'Vui lòng cung cấp Email!' });
    }

    let emailCol = headers.findIndex(h => h.includes('email') || h.includes('tài khoản'));
    let nameCol = headers.findIndex(h => h.includes('name') || h.includes('tên') || h.includes('customer'));
    let activeCol = headers.findIndex(h => h.includes('active') || h.includes('kích hoạt') || h.includes('trạng thái') || h.includes('status'));
    let lastLoginCol = headers.findIndex(h => h.includes('lastlogin') || h.includes('thời gian') || h.includes('đăng nhập'));

    if (emailCol === -1) emailCol = 0;
    if (nameCol === -1) nameCol = 1;
    if (activeCol === -1) activeCol = 2;
    if (lastLoginCol === -1) lastLoginCol = 3;

    let foundRowIndex = -1;
    let isActive = false;

    for (let i = 1; i < data.length; i++) {
      const rowEmail = String(data[i][emailCol] || '').trim().toLowerCase();
      if (rowEmail === email) {
        foundRowIndex = i;
        const activeVal = String(data[i][activeCol] || '').trim().toLowerCase();
        // Check if marked with 'x', 'X', 'active', 'true', '1', 'yes', 'dã kích hoạt', 'vip'
        if (['x', 'active', 'true', '1', 'yes', 'đã kích hoạt', 'vip'].includes(activeVal)) {
          isActive = true;
        }
        // Update last login timestamp
        try {
          sheet.getRange(i + 1, lastLoginCol + 1).setValue(new Date().toLocaleString('vi-VN'));
        } catch (err) {}
        break;
      }
    }

    // If teacher email is not found, append a new row automatically
    if (foundRowIndex === -1) {
      const newRow = [];
      newRow[emailCol] = email;
      newRow[nameCol] = name || 'Giáo Viên Mới';
      newRow[activeCol] = ''; // Admin needs to put 'x' in this cell to activate
      newRow[lastLoginCol] = new Date().toLocaleString('vi-VN');
      sheet.appendRow(newRow);

      return jsonResponse({
        success: true,
        active: false,
        email,
        name,
        message: 'Đã tự động lưu email của bạn vào Google Sheet. Tài khoản đang chờ Quản trị viên đánh dấu "x" ở cột Active để kích hoạt!'
      });
    }

    return jsonResponse({
      success: true,
      active: isActive,
      email,
      name,
      message: isActive ? 'Tài khoản của bạn đã được xác thực VIP thành công!' : 'Tài khoản chưa được đánh dấu "x" kích hoạt trên Google Sheet!'
    });
  }

  // --------------------------------------------------------------------------
  // ACTION 2: LICENSE KEY VERIFICATION (Legacy Key Support)
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
          message: isActive ? 'Mã bản quyền hợp lệ!' : 'Tài khoản chưa được đánh dấu "x" kích hoạt!'
        });
      }
    }
    return jsonResponse({ success: false, valid: false, message: 'Mã bản quyền không tồn tại!' });
  }

  return jsonResponse({ success: false, message: 'Action không hợp lệ!' });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
