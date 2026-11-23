import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import './ReviewBox.css';

const LABELS = { 1: 'Rất tệ', 2: 'Chưa tốt', 3: 'Bình thường', 4: 'Tốt', 5: 'Rất tốt' };

/**
 * ReviewBox - star rating + comment for one finished visit.
 * Shows the saved review with an "edit" button while the review window is open.
 */
const ReviewBox = ({ appointmentId, review, canEdit, onSaved }) => {
  const [editing, setEditing] = useState(!review);
  const [rating, setRating] = useState(review?.rating || 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(review?.comment || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!rating) return setError('Hãy chọn số sao');
    try {
      setSaving(true);
      setError('');
      const res = await axios.post(`${API_BASE}/reviews`, {
        appointment_id: appointmentId,
        rating,
        comment: comment.trim() || null
      }, { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });
      setEditing(false);
      if (onSaved) onSaved(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không thể lưu đánh giá');
    } finally {
      setSaving(false);
    }
  };

  if (!editing && review) {
    return (
      <div className="rv rv-saved">
        <span className="rv-stars" aria-label={`${review.rating} trên 5 sao`}>
          {'★'.repeat(review.rating)}<span className="rv-off">{'★'.repeat(5 - review.rating)}</span>
        </span>
        <span className="rv-text">
          Bạn đã đánh giá: <strong>{LABELS[review.rating]}</strong>{review.comment ? ` – “${review.comment}”` : ''}
        </span>
        {canEdit && <button type="button" className="rv-link" onClick={() => setEditing(true)}>Sửa</button>}
      </div>
    );
  }

  if (!canEdit) return null;

  const shown = hover || rating;
  return (
    <div className="rv">
      <div className="rv-title">⭐ Bạn thấy buổi khám thế nào?</div>
      <div className="rv-pick" role="radiogroup" aria-label="Chọn số sao" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} sao – ${LABELS[n]}`}
            className={`rv-star ${n <= shown ? 'is-on' : ''}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
        <span className="rv-label">{shown ? LABELS[shown] : 'Chọn số sao'}</span>
      </div>
      <textarea
        className="rv-comment"
        rows={2}
        maxLength={500}
        placeholder="Nhận xét thêm (không bắt buộc)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        aria-label="Nhận xét"
      />
      {error && <div className="rv-error">{error}</div>}
      <div className="rv-actions">
        {review && <button type="button" className="rv-btn" onClick={() => setEditing(false)} disabled={saving}>Huỷ</button>}
        <button type="button" className="rv-btn is-primary" onClick={submit} disabled={saving}>
          {saving ? 'Đang gửi…' : review ? 'Lưu đánh giá' : 'Gửi đánh giá'}
        </button>
      </div>
    </div>
  );
};

export default ReviewBox;
