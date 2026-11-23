import React, { useState } from 'react';
import {
  CheckedInPatientsList,
  CreateMedicalRecordForm,
  PrescriptionsForm,
  MedicalRecordActions
} from '../medical-records';
import { printPrescription } from '../medical-records/printPrescription';
import './DoctorExamFlow.css';

/**
 * DoctorExamFlow - Quy trình khám bệnh của bác sĩ
 *
 *   0. Chọn bệnh nhân đã check-in (nếu chưa truyền `patient`)
 *   1. Tạo hồ sơ khám (triệu chứng, chẩn đoán)
 *   2. Kê đơn thuốc (lưu vào bảng prescriptions -> lễ tân thu tiền thuốc)
 *   3. Hẹn tái khám & hoàn tất lịch hẹn
 */
const STEPS = ['Hồ sơ khám', 'Kê đơn thuốc', 'Hoàn tất'];

const DoctorExamFlow = ({ patient: initialPatient, onExit, onNextPatient }) => {
  const [patient, setPatient] = useState(initialPatient || null);
  const [step, setStep] = useState(0);
  const [record, setRecord] = useState(null);
  const [prescriptionCount, setPrescriptionCount] = useState(0);
  const [completed, setCompleted] = useState(false);

  const reset = () => {
    setPatient(null);
    setStep(0);
    setRecord(null);
    setPrescriptionCount(0);
    setCompleted(false);
  };

  if (!patient) {
    return <CheckedInPatientsList onBack={onExit} onSelectPatient={setPatient} />;
  }

  return (
    <div className="exam-flow">
      <div className="exam-flow-top">
        <div className="exam-flow-patient">
          <strong>{patient.patient_fullname || patient.patient_name || 'Bệnh nhân'}</strong>
          {patient.patient_phone && <span> · {patient.patient_phone}</span>}
          <span className="exam-flow-muted"> · Lịch hẹn #{patient.appointment_id}{patient.time_slot ? ` · ${patient.time_slot}` : ''}</span>
        </div>
        <ol className="exam-flow-steps">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? 'current' : i < step ? 'done' : ''}>
              <span className="exam-flow-dot">{i < step ? '✓' : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <CreateMedicalRecordForm
          patient={patient}
          onSuccess={(created) => {
            setRecord(created);
            setStep(1);
          }}
          onCancel={initialPatient ? onExit : () => setPatient(null)}
        />
      )}

      {step === 1 && record && (
        <PrescriptionsForm
          medicalRecordId={record.id}
          patient={patient}
          diagnosis={record.diagnosis}
          onSuccess={(ids) => {
            setPrescriptionCount(Array.isArray(ids) ? ids.length : 0);
            setStep(2);
          }}
          onSkip={() => setStep(2)}
        />
      )}

      {step === 2 && record && (
        <div className="exam-flow-finish">
          <div className="exam-flow-summary">
            <div>✓ Đã lưu hồ sơ khám <b>#{record.id}</b> – {record.diagnosis}</div>
            <div>
              {prescriptionCount > 0
                ? <>✓ Đã kê <b>{prescriptionCount}</b> loại thuốc – bệnh nhân thanh toán tiền thuốc tại quầy thu ngân</>
                : <>Không kê đơn thuốc</>}
            </div>
            <button
              type="button"
              className="btn btn-outline exam-flow-print"
              onClick={() => { if (!printPrescription(record.id)) alert('Trình duyệt đã chặn cửa sổ in. Hãy cho phép pop-up rồi thử lại.'); }}
            >
              🖨 In đơn thuốc
            </button>
          </div>

          {completed ? (
            <div className="exam-flow-done">
              <p>🎉 Đã hoàn tất lịch khám.</p>
              <div className="exam-flow-actions">
                <button className="btn btn-primary" onClick={onNextPatient || reset}>
                  {onNextPatient ? '📢 Gọi số tiếp theo' : 'Khám bệnh nhân tiếp theo'}
                </button>
                <button className="btn btn-secondary" onClick={onExit}>Về Dashboard</button>
              </div>
            </div>
          ) : (
            <MedicalRecordActions
              medicalRecordId={record.id}
              appointmentId={patient.appointment_id}
              currentReexaminationDate={record.reexamination_date}
              onSuccess={(event) => {
                if (event === 'appointment_completed') setCompleted(true);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default DoctorExamFlow;
