import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import { createPrescriptions } from '../../services/medicalRecordsService';
import PrescriptionTemplates from './PrescriptionTemplates';
import SuggestInput from '../common/SuggestInput';
import INSTRUCTION_PRESETS from './instructionPresets';
import './MedicalRecords.css';

/**
 * PrescriptionsForm Component
 * 
 * Dynamic form for doctor to add multiple prescriptions to a medical record.
 * Allows adding/removing prescription rows dynamically.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
const emptyRow = () => ({ medicine_id: null, medicine_name: '', unit: '', dosage: '', quantity: 1, instructions: '' });
const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;

const PrescriptionsForm = ({ medicalRecordId, patient, diagnosis, onSuccess, onSkip }) => {
  const [prescriptions, setPrescriptions] = useState([emptyRow()]);
  // Medicine catalogue (kê đơn từ danh mục): name, unit, price, stock
  const [catalogue, setCatalogue] = useState([]);
  useEffect(() => {
    axios.get(`${API_BASE}/medicines`, { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } })
      .then((res) => setCatalogue(res.data?.data?.items || []))
      .catch(() => setCatalogue([]));
  }, []);
  const byId = useMemo(() => new Map(catalogue.map((m) => [m.id, m])), [catalogue]);
  const findByName = (name) => {
    const key = String(name || '').trim().toLowerCase();
    return catalogue.find((m) => m.name.toLowerCase() === key) || null;
  };
  // total quantity per catalogue medicine across all rows (to compare with stock)
  const requested = useMemo(() => {
    const map = new Map();
    prescriptions.forEach((p) => {
      if (p.medicine_id) map.set(p.medicine_id, (map.get(p.medicine_id) || 0) + (parseInt(p.quantity, 10) || 0));
    });
    return map;
  }, [prescriptions]);
  const estimate = prescriptions.reduce((sum, p) => {
    const med = p.medicine_id ? byId.get(p.medicine_id) : null;
    return sum + (med ? med.price * (parseInt(p.quantity, 10) || 0) : 0);
  }, 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fill the form from a saved template (đơn mẫu); re-link each medicine to today's catalogue
  const applyTemplate = (items) => {
    const rows = (items || []).map((it) => {
      const med = (it.medicine_id && byId.get(it.medicine_id)) || findByName(it.medicine_name);
      return {
        medicine_id: med ? med.id : null,
        medicine_name: med ? med.name : (it.medicine_name || ''),
        unit: med ? med.unit : (it.unit || ''),
        dosage: it.dosage || '',
        quantity: it.quantity || 1,
        instructions: it.instructions || ''
      };
    });
    setPrescriptions(rows.length ? rows : [emptyRow()]);
    setError('');
  };

  const handleAddPrescription = () => {
    setPrescriptions([...prescriptions, emptyRow()]);
  };

  const handleRemovePrescription = (index) => {
    if (prescriptions.length > 1) {
      setPrescriptions(prescriptions.filter((_, i) => i !== index));
    }
  };

  const handlePrescriptionChange = (index, field, value) => {
    const updated = prescriptions.map((p, i) => (i === index ? { ...p, [field]: value } : p));
    if (field === 'medicine_name') {
      // picking a catalogue name links the row to the catalogue; typing anything else unlinks it
      const med = findByName(value);
      updated[index].medicine_id = med ? med.id : null;
      updated[index].unit = med ? med.unit : '';
    }
    setPrescriptions(updated);
    setError('');
  };

  const validateForm = () => {
    for (let i = 0; i < prescriptions.length; i++) {
      const prescription = prescriptions[i];
      
      if (!prescription.medicine_name.trim()) {
        setError(`Vui lòng nhập tên thuốc cho thuốc #${i + 1}`);
        return false;
      }
      
      if (!prescription.dosage.trim()) {
        setError(`Vui lòng nhập liều lượng cho thuốc #${i + 1}`);
        return false;
      }
      
      if (!prescription.quantity || prescription.quantity <= 0) {
        setError(`Số lượng phải lớn hơn 0 cho thuốc #${i + 1}`);
        return false;
      }
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    try {
      setLoading(true);
      setError('');

      const cleanedPrescriptions = prescriptions.map(p => ({
        medicine_id: p.medicine_id || undefined,
        unit: p.unit || undefined,
        medicine_name: p.medicine_name.trim(),
        dosage: p.dosage.trim(),
        quantity: parseInt(p.quantity),
        instructions: p.instructions.trim() || null
      }));

      const response = await createPrescriptions(medicalRecordId, cleanedPrescriptions);

      if (response.success) {
        if (onSuccess) {
          onSuccess(response.data?.prescriptionIds);
        }
      } else {
        setError(response.message || 'Không thể tạo đơn thuốc');
      }
    } catch (err) {
      console.error('Error creating prescriptions:', err);
      setError(err?.error?.message || err?.message || 'Có lỗi xảy ra khi tạo đơn thuốc');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    }
  };

  return (
    <div className="prescriptions-form-container">
      <div className="form-header">
        <h2>Kê đơn thuốc</h2>
        <div className="form-subtitle">
          Bệnh nhân: <strong>{patient?.patient_fullname}</strong>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="prescriptions-form">
        {error && (
          <div className="form-error">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <PrescriptionTemplates
          rows={prescriptions}
          diagnosis={diagnosis}
          onApply={applyTemplate}
          disabled={loading}
        />

        <div className="prescriptions-list">
          {prescriptions.map((prescription, index) => (
            <div key={index} className="prescription-item">
              <div className="prescription-header">
                <span className="prescription-number">Thuốc #{index + 1}</span>
                {prescriptions.length > 1 && (
                  <button
                    type="button"
                    className="btn-remove"
                    onClick={() => handleRemovePrescription(index)}
                    disabled={loading}
                    aria-label={`Xoá thuốc #${index + 1}`}
                  >
                    🗑️
                  </button>
                )}
              </div>

              <div className="prescription-fields">
                <div className="form-group">
                  <label className="form-label">
                    Tên thuốc <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    list="medicine-catalogue"
                    value={prescription.medicine_name}
                    onChange={(e) => handlePrescriptionChange(index, 'medicine_name', e.target.value)}
                    placeholder="Gõ để tìm trong danh mục, VD: Paracetamol"
                    disabled={loading}
                    autoComplete="off"
                  />
                  {(() => {
                    const med = prescription.medicine_id ? byId.get(prescription.medicine_id) : null;
                    if (med) {
                      const need = requested.get(med.id) || 0;
                      return (
                        <div className={`presc-med-info ${need > med.stock ? 'is-short' : ''}`}>
                          ✓ Trong danh mục · {money(med.price)}/{med.unit} · Kho còn {med.stock} {med.unit}
                          {need > med.stock && ` – không đủ cho ${need} ${med.unit}, bệnh nhân có thể phải mua thêm bên ngoài`}
                        </div>
                      );
                    }
                    return prescription.medicine_name.trim()
                      ? <div className="presc-med-info is-outside">Thuốc ngoài danh mục – bệnh nhân tự mua, không tính tiền tại quầy</div>
                      : null;
                  })()}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">
                      Liều lượng <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={prescription.dosage}
                      onChange={(e) => handlePrescriptionChange(index, 'dosage', e.target.value)}
                      placeholder="VD: 1 viên/lần"
                      disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Số lượng{prescription.unit ? ` (${prescription.unit})` : ''} <span className="required">*</span>
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      value={prescription.quantity}
                      onChange={(e) => handlePrescriptionChange(index, 'quantity', e.target.value)}
                      min="1"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor={`rx-instr-${index}`}>Hướng dẫn sử dụng</label>
                  <SuggestInput
                    id={`rx-instr-${index}`}
                    value={prescription.instructions}
                    onChange={(v) => handlePrescriptionChange(index, 'instructions', v)}
                    options={INSTRUCTION_PRESETS}
                    placeholder="Bấm để chọn cách dùng, hoặc tự gõ (VD: Uống sau ăn)"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <datalist id="medicine-catalogue">
          {catalogue.map((m) => (
            <option key={m.id} value={m.name}>{`${money(m.price)}/${m.unit} · kho ${m.stock}`}</option>
          ))}
        </datalist>

        {estimate > 0 && (
          <div className="presc-estimate">Tạm tính thuốc trong danh mục: <b>{money(estimate)}</b> (thu tại quầy thu ngân)</div>
        )}

        <button
          type="button"
          className="btn btn-add-prescription"
          onClick={handleAddPrescription}
          disabled={loading}
        >
          <span>➕</span>
          <span>Thêm thuốc</span>
        </button>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSkip}
            disabled={loading}
          >
            Bỏ qua
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="btn-spinner"></div>
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <span>Lưu đơn thuốc</span>
                <span className="btn-icon">✓</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PrescriptionsForm;
