import React from 'react';
import './CompactBookingPreview.css';

/**
 * CompactBookingPreview - Form nhỏ gọn trên trang chủ
 * Click vào sẽ mở modal form đầy đủ
 */
const CompactBookingPreview = ({ onOpenFullForm }) => {
  return (
    <div className="compact-booking-preview" onClick={onOpenFullForm}>
      <div className="preview-header">
        <h3>🏥 Đăng Ký Khám Nhanh</h3>
        <p>Điền thông tin để đặt lịch khám bệnh</p>
      </div>

      <div className="preview-form">
        <div className="preview-row">
          <input 
            type="text" 
            placeholder="Họ và tên" 
            readOnly
            onClick={onOpenFullForm}
          />
          <input 
            type="text" 
            placeholder="Số điện thoại" 
            readOnly
            onClick={onOpenFullForm}
          />
        </div>
        
        <div className="preview-row">
          <select disabled onClick={onOpenFullForm}>
            <option>Chọn chuyên khoa</option>
          </select>
          <input 
            type="date" 
            placeholder="Ngày khám" 
            readOnly
            onClick={onOpenFullForm}
          />
        </div>

        <button 
          type="button" 
          className="btn-open-full-form"
          onClick={(e) => {
            e.stopPropagation();
            onOpenFullForm();
          }}
        >
          📝 Điền Đầy Đủ Thông Tin →
        </button>
      </div>

      <div className="preview-footer">
        <p>💡 Click vào form để mở đầy đủ các trường</p>
      </div>
    </div>
  );
};

export default CompactBookingPreview;
