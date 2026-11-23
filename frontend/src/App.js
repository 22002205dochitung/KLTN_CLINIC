import React, { useState, useEffect } from 'react';
import BookingPage from './components/BookingPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthModal from './components/auth/AuthModal';
import ProtectedRoute from './components/routing/ProtectedRoute';
import ProfileManager from './components/profile/ProfileManager';
import DashboardRouter from './components/dashboards/DashboardRouter';
import { MedicalHistory, MedicalRecordDetails } from './components/medical-records';
import PatientRecordsLookup from './components/medical-records/PatientRecordsLookup';
import ClinicCatalog from './components/admin/ClinicCatalog';
import RecommendationSettings from './components/admin/RecommendationSettings';
import MedicineCatalog from './components/admin/MedicineCatalog';
import DoctorShifts from './components/admin/DoctorShifts';
import DoctorDirectory from './components/doctors/DoctorDirectory';
import HomeStore from './components/home/HomeStore';
import SecurityDashboard from './components/admin/SecurityDashboard';
import DoctorQueue from './components/doctor/DoctorQueue';
import QRScanner from './components/checkin/QRScanner';
import { MyQRCode } from './components/patient';
import { UserManagement, AdminStatistics } from './components/admin';
import AdminAppointments from './components/admin/AdminAppointments';
import { DoctorExamFlow, DoctorSchedule, DoctorFollowUps, DoctorLeaves } from './components/doctor';
import { AppointmentHistory, SimpleBookingForm } from './components/appointments';
import { PaymentHistory, CashierDesk, PaymentManagement } from './components/payment';
import './App.css';
import { API_ORIGIN } from './config/api';
import NotificationBell from './components/common/NotificationBell';
import DoctorRatings from './components/admin/DoctorRatings';
import QueueBoard from './components/queue/QueueBoard';

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const [apiMessage, setApiMessage] = useState('Đang kết nối tới Backend...');
  // Bumped on every menu click so re-clicking the current page resets its inner view
  const [navNonce, setNavNonce] = useState(0);
  // Phone layout: the menu is collapsed behind a ☰ button (it used to fill half the screen)
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Start page can come from the URL (?page=booking) - used by the installed app's shortcuts
  const [currentPage, setCurrentPage] = useState(() => {
    try {
      const page = new URLSearchParams(window.location.search).get('page');
      return page && /^[a-z-]{2,40}$/.test(page) ? page : 'home';
    } catch (e) {
      return 'home';
    }
  }); // 'home', 'booking', 'medical-records', 'qr-checkin', 'my-qr', 'doctor-medical-records', 'patient-medical-history', 'medical-record-details'
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState(null); // For viewing medical record details
  const [pageData, setPageData] = useState(null); // Additional data for specific pages
  const [bookingSuggestion, setBookingSuggestion] = useState(null);
  const { user, logout } = useAuth();

  // Kiểm tra gọi API từ Backend (port 5000) ngay khi trang load
  useEffect(() => {
    fetch(`${API_ORIGIN}/`)
      .then(res => res.json())
      .then(data => setApiMessage(data.message))
      .catch(err => setApiMessage('Không thể kết nối đến Backend Server!'));
  }, []);

  // Navigation component with role-based menu
  const Navigation = () => {
    // Define menu items based on user role - hierarchical permissions
    const getMenuItems = () => {
      const baseItems = [
        { id: 'home', label: 'Trang chủ', roles: ['all'] }
      ];

      if (user) {
        const roleBasedItems = [];

        // Dashboard - All authenticated users
        roleBasedItems.push({
          id: 'dashboard',
          label: 'Dashboard',
          roles: ['admin', 'doctor', 'patient', 'receptionist']
        });

        // Booking - Everyone except Doctor (patients book, receptionist helps book, admin manages)
        if (user.role !== 'doctor') {
          roleBasedItems.push({
            id: 'booking',
            label: 'Đặt lịch khám',
            roles: ['patient', 'receptionist', 'admin']
          });
        }

        // Doctor / specialty search (use case 3.2.2.3)
        if (user.role === 'patient') {
          roleBasedItems.push({ id: 'doctors', label: 'Bác sĩ', roles: ['patient'] });
        }

        // Medical Records - Admin, Doctor, Patient (Doctor and Admin can see all, Patient sees their own)
        roleBasedItems.push({
          id: 'medical-records',
          label: 'Hồ sơ y tế',
          roles: ['patient', 'doctor', 'receptionist', 'admin']
        });

        // Appointment history - Patient only (was reachable only through a dashboard card)
        if (user.role === 'patient') {
          roleBasedItems.push({
            id: 'appointment-history',
            label: 'Lịch hẹn của tôi',
            roles: ['patient']
          });
        }

        // Payment History - Patient only (to view their payment history)
        if (user.role === 'patient') {
          roleBasedItems.push({
            id: 'payment-history',
            label: 'Lịch sử thanh toán',
            roles: ['patient']
          });
        }

        // Cashier desk - Receptionist, Admin (collect consultation & medication payments)
        if (user.role === 'receptionist' || user.role === 'admin') {
          roleBasedItems.push({
            id: 'cashier',
            label: 'Thu ngân',
            roles: ['receptionist', 'admin']
          });
        }

        // Payment management - Admin only (revenue, transactions, consultation fees)
        if (user.role === 'admin') {
          roleBasedItems.push({
            id: 'payment-management',
            label: 'Doanh thu',
            roles: ['admin']
          });
        }

        // My QR Code - Only Patient (to show QR for receptionist to scan)
        if (user.role === 'patient') {
          roleBasedItems.push({
            id: 'my-qr',
            label: 'Mã QR của tôi',
            roles: ['patient']
          });
        }

        // Check-in QR Scanner - Receptionist, Admin (to scan patient QR)
        if (user.role === 'receptionist' || user.role === 'admin') {
          roleBasedItems.push({
            id: 'qr-checkin',
            label: 'Quét QR Check-in',
            roles: ['receptionist', 'admin']
          });
          // Lobby screen with the queue (open it on the TV in the waiting room)
          roleBasedItems.push({
            id: 'queue-board',
            label: 'Màn hình hàng đợi',
            roles: ['receptionist', 'admin']
          });
        }

        return [...baseItems, ...roleBasedItems];
      }

      // Guest menu
      return [
        ...baseItems,
        { id: 'booking', label: 'Đặt lịch khám', roles: ['all'] },
        { id: 'doctors', label: 'Bác sĩ', roles: ['all'] },
        { id: 'medical-records', label: 'Hồ sơ y tế', roles: ['all'] }
      ];
    };

    const menuItems = getMenuItems();
    const go = (page, data = null) => { setCurrentPage(page); setPageData(data); setNavNonce((n) => n + 1); setMobileNavOpen(false); };
    const canBook = !user || user.role !== 'doctor';

    return (
      <header className="site-header">
      <div className="topbar">
        <div className="topbar-inner">
          <span>🕒 Thứ 2 – Thứ 7 · 08:00 – 17:00</span>
          <span>📞 Hotline <b>1900-1234</b></span>
          <span className="topbar-extra">✨ Gợi ý lịch khám thông minh · Check-in bằng mã QR · Thanh toán VietQR</span>
        </div>
      </div>
      <nav className={`navbar ${mobileNavOpen ? 'is-open' : ''}`}>
        <div className="nav-container">
          <button
            type="button"
            className="nav-toggle"
            aria-label={mobileNavOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={mobileNavOpen}
            aria-controls="main-nav-menu"
            onClick={() => setMobileNavOpen((o) => !o)}
          >
            {mobileNavOpen ? '✕' : '☰'}
          </button>
          <div className="nav-logo">
            <img 
              src={`${process.env.PUBLIC_URL}/img/logo.png`}
              alt="THCT Clinic" 
              className="logo-img"
              onError={(e) => {
                console.log('Logo load error:', e);
                e.target.style.display = 'none';
                // Show fallback when image fails to load
                const fallback = e.target.nextElementSibling;
                if (fallback && fallback.classList.contains('logo-fallback')) {
                  fallback.style.display = 'flex';
                }
              }}
              onLoad={() => {
                console.log('Logo loaded successfully');
                // Hide fallback when image loads successfully
                const img = document.querySelector('.logo-img');
                const fallback = img?.nextElementSibling;
                if (fallback && fallback.classList.contains('logo-fallback')) {
                  fallback.style.display = 'none';
                }
              }}
            />
            <div className="logo-fallback" style={{ display: 'none' }}>TC</div>
            <span className="clinic-name" role="link" tabIndex={0} onClick={() => go('home')} onKeyDown={(e) => e.key === 'Enter' && go('home')}>
              THCT CLINIC<small>Chăm sóc sức khoẻ thông minh</small>
            </span>
          </div>
          <form
            className="nav-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get('q');
              go('doctors', { query: String(q || '').trim() });
            }}
          >
            <input name="q" type="search" placeholder="Tìm bác sĩ, chuyên khoa, triệu chứng…" aria-label="Tìm bác sĩ, chuyên khoa hoặc triệu chứng" />
            <button type="submit" aria-label="Tìm kiếm">🔍</button>
          </form>
          <div className="nav-menu" id="main-nav-menu">
            {menuItems.map(item => (
              <a
                key={item.id}
                href="#"
                onClick={() => { setCurrentPage(item.id); setPageData(null); setNavNonce((n) => n + 1); setMobileNavOpen(false); }}
                className={currentPage === item.id ? 'active' : ''}
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="nav-contact">
            {canBook && (
              <button type="button" className="nav-cta" onClick={() => go('booking')}>📅 Đặt lịch khám</button>
            )}
            {user ? (
              <div className="user-menu">
                <span className="user-name">
                  Xin chào, {user.fullName}
                  <span className="user-role-badge">
                    {user.role === 'admin' && '👑 Admin'}
                    {user.role === 'doctor' && '👨‍⚕️ Bác sĩ'}
                    {user.role === 'patient' && '👤 Bệnh nhân'}
                    {user.role === 'receptionist' && '👔 Lễ tân'}
                  </span>
                </span>
                <NotificationBell
                  userId={user.id || user.email}
                  onNavigate={(page) => { setCurrentPage(page); setPageData(null); setNavNonce((n) => n + 1); setMobileNavOpen(false); }}
                />
                <div className="user-dropdown">
                  <button className="user-avatar">{user.fullName.charAt(0).toUpperCase()}</button>
                  <div className="dropdown-content">
                    <a href="#" onClick={() => { setCurrentPage('profile'); setMobileNavOpen(false); }}>Hồ sơ cá nhân</a>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setMobileNavOpen(false);
                        // use case "Đăng xuất": confirm first, Cancel keeps the session
                        if (window.confirm('Bạn có chắc muốn đăng xuất?')) {
                          logout();
                          setCurrentPage('home');
                        }
                      }}
                    >
                      Đăng xuất
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="auth-buttons">
                <button className="btn-login" onClick={() => { setAuthModalMode('login'); setAuthModalOpen(true); }}>
                  Đăng nhập
                </button>
                <button className="btn-register" onClick={() => { setAuthModalMode('register'); setAuthModalOpen(true); }}>
                  Đăng ký
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
      </header>
    );
  };

  // Footer
  const Footer = () => (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-section">
            <h3>THCT CLINIC</h3>
            <p>Hệ thống đặt lịch khám bệnh thông minh</p>
            <p>Khóa luận tốt nghiệp 2026</p>
          </div>
          <div className="footer-section">
            <h4>Liên hệ</h4>
            <p>📞 Hotline: 1900-1234</p>
            <p>📧 Email: contact@thctclinic.vn</p>
            <p>📍 Địa chỉ: TP.HCM</p>
          </div>
          <div className="footer-section">
            <h4>Sinh viên thực hiện</h4>
            <p>Nguyễn Thu Hằng</p>
            <p>Đỗ Chí Tùng</p>
            <p>GVHD: TS. Ngô Hữu Dũng</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 THCT Clinic System. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );

  // Lobby queue screen: full page without the app chrome; public so a TV needs no login
  if (currentPage === 'queue-board') {
    return <QueueBoard onExit={user ? () => { setCurrentPage('dashboard'); setNavNonce((n) => n + 1); } : null} />;
  }

  // Render different pages with role-based access control
  if (currentPage === 'booking-form') {
    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <BookingPage onNavigate={setCurrentPage} initialSuggestion={bookingSuggestion} prefill={pageData?.prefill} />
        </div>
        <Footer />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          initialMode={authModalMode}
        />
      </div>
    );
  }

  // Public doctor / specialty search; "Đặt lịch" opens the booking form pre-filled
  if (currentPage === 'doctors') {
    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <DoctorDirectory
            key={`${pageData?.query || ''}|${pageData?.departmentId || ''}`}
            initialQuery={pageData?.query || ""}
            initialDepartmentId={pageData?.departmentId ? String(pageData.departmentId) : ''}
            onBook={(prefill) => {
              setPageData({ prefill });
              setCurrentPage(user && user.role === 'doctor' ? 'dashboard' : 'booking');
            }}
          />
        </div>
        <Footer />
      </div>
    );
  }

  if (currentPage === 'booking') {
    // Only Doctor cannot access booking (they don't book appointments, they treat patients)
    if (user && user.role === 'doctor') {
      return (
        <div className="app">
          <Navigation />
          <div className="page-content">
            <div className="container">
              <div className="access-denied">
                <div className="access-denied-icon">🚫</div>
                <h2>Không có quyền truy cập</h2>
                <p>Bạn không có quyền truy cập trang này.</p>
                <p>Bác sĩ không cần đặt lịch khám. Bạn có thể xem hàng đợi bệnh nhân trong Dashboard.</p>
                <button className="btn btn-primary" onClick={() => setCurrentPage('dashboard')}>
                  Về Dashboard
                </button>
              </div>
            </div>
          </div>
          <Footer />
        </div>
      );
    }

    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <BookingPage onNavigate={setCurrentPage} initialSuggestion={bookingSuggestion} prefill={pageData?.prefill} />
        </div>
        <Footer />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          initialMode={authModalMode}
        />
      </div>
    );
  }

  if (currentPage === 'medical-records') {
    // Check if user is authenticated
    if (!user) {
      setCurrentPage('home');
      setAuthModalMode('login');
      setAuthModalOpen(true);
      return null;
    }

    // Patients see their own history; staff get a patient lookup
    // (the patient-history API is patient-only, so staff used to get a 403 here)
    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          {user.role !== 'patient' ? (
            <PatientRecordsLookup />
          ) : selectedRecordId ? (
            <MedicalRecordDetails
              medicalRecordId={selectedRecordId}
              onBack={() => setSelectedRecordId(null)}
            />
          ) : (
            <MedicalHistory
              onViewDetails={(id) => setSelectedRecordId(id)}
            />
          )}
        </div>
        <Footer />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          initialMode={authModalMode}
        />
      </div>
    );
  }

  if (currentPage === 'my-qr') {
    // Check if user is authenticated
    if (!user) {
      setCurrentPage('home');
      setAuthModalMode('login');
      setAuthModalOpen(true);
      return null;
    }

    // My QR Code page for patients
    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <MyQRCode />
        </div>
        <Footer />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          initialMode={authModalMode}
        />
      </div>
    );
  }

  if (currentPage === 'qr-checkin') {
    // Check if user is authenticated
    if (!user) {
      setCurrentPage('home');
      setAuthModalMode('login');
      setAuthModalOpen(true);
      return null;
    }

    // Only Doctor cannot access QR check-in (handled inside QRScanner component)
    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <QRScanner />
        </div>
        <Footer />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          initialMode={authModalMode}
        />
      </div>
    );
  }

  if (currentPage === 'profile') {
    if (!user) {
      // Redirect to home if not logged in
      setCurrentPage('home');
      setAuthModalMode('login');
      setAuthModalOpen(true);
      return null;
    }
    
    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <ProfileManager />
        </div>
        <Footer />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          initialMode={authModalMode}
        />
      </div>
    );
  }

  if (currentPage === 'dashboard') {
    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <ProtectedRoute>
            <DashboardRouter
              key={navNonce} 
              onNavigate={(page, data) => {
                setCurrentPage(page);
                setPageData(data);
              }} 
            />
          </ProtectedRoute>
        </div>
        <Footer />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          initialMode={authModalMode}
        />
      </div>
    );
  }

  if (currentPage === 'create-medical-record') {
    if (!user || user.role !== 'doctor') {
      setCurrentPage('dashboard');
      return null;
    }

    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <DoctorExamFlow
            key={pageData?.patient?.appointment_id || 'select'}
            patient={pageData?.patient}
            onExit={() => setCurrentPage(pageData?.from === 'doctor-queue' ? 'doctor-queue' : 'dashboard')}
            onNextPatient={pageData?.from === 'doctor-queue' ? () => setCurrentPage('doctor-queue') : undefined}
          />
        </div>
        <Footer />
      </div>
    );
  }

  // Patient Medical History (accessible via PatientDashboard)
  if (currentPage === 'patient-medical-history') {
    if (!user || user.role !== 'patient') {
      setCurrentPage('dashboard');
      return null;
    }

    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          {selectedRecordId ? (
            <MedicalRecordDetails
              medicalRecordId={selectedRecordId}
              onBack={() => setSelectedRecordId(null)}
            />
          ) : (
            <MedicalHistory
              onViewDetails={(id) => setSelectedRecordId(id)}
              onBack={() => setCurrentPage('dashboard')}
            />
          )}
        </div>
        <Footer />
      </div>
    );
  }

  // Medical Record Details (standalone route)
  if (currentPage === 'medical-record-details') {
    if (!user) {
      setCurrentPage('home');
      setAuthModalMode('login');
      setAuthModalOpen(true);
      return null;
    }

    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <MedicalRecordDetails
            medicalRecordId={pageData?.recordId}
            onBack={() => setCurrentPage('dashboard')}
          />
        </div>
        <Footer />
      </div>
    );
  }

  // Patient Medical Records (for receptionist to view any patient's records)
  if (currentPage === 'patient-medical-records') {
    if (!user || (user.role !== 'receptionist' && user.role !== 'admin')) {
      setCurrentPage('dashboard');
      return null;
    }

    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <div className="container">
            <button 
              onClick={() => setCurrentPage('dashboard')}
              style={{
                marginBottom: '20px',
                padding: '10px 20px',
                background: 'white',
                border: '2px solid #26a69a',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              ← Quay lại Dashboard
            </button>
            {/* MedicalHistory only loads the logged-in patient's own history (403 for staff) */}
            <PatientRecordsLookup
              key={pageData?.patient?.id || 'lookup'}
              initialPatient={pageData?.patient || null}
            />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (currentPage === 'user-management') {
    // Only admin can access user management
    if (!user || user.role !== 'admin') {
      return (
        <div className="app">
          <Navigation />
          <div className="page-content">
            <div className="container">
              <div className="access-denied">
                <div className="access-denied-icon">🚫</div>
                <h2>Không có quyền truy cập</h2>
                <p>Bạn không có quyền truy cập trang này.</p>
                <p>Chỉ quản trị viên mới có thể quản lý người dùng.</p>
                <button className="btn btn-primary" onClick={() => setCurrentPage('dashboard')}>
                  Về Dashboard
                </button>
              </div>
            </div>
          </div>
          <Footer />
        </div>
      );
    }

    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <UserManagement onBack={() => setCurrentPage('dashboard')} />
        </div>
        <Footer />
      </div>
    );
  }

  if (currentPage === 'appointment-management') {
    // Admin (full) and receptionist (view list, no audit logs) can access appointment management
    if (!user || !['admin', 'receptionist'].includes(user.role)) {
      return (
        <div className="app">
          <Navigation />
          <div className="page-content">
            <div className="container">
              <div className="access-denied">
                <div className="access-denied-icon">🚫</div>
                <h2>Không có quyền truy cập</h2>
                <p>Bạn không có quyền truy cập trang này.</p>
                <p>Chỉ quản trị viên mới có thể quản lý lịch hẹn.</p>
                <button className="btn btn-primary" onClick={() => setCurrentPage('dashboard')}>
                  Về Dashboard
                </button>
              </div>
            </div>
          </div>
          <Footer />
        </div>
      );
    }

    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <AdminAppointments onNavigate={(page) => setCurrentPage(page)} initialFilters={pageData?.filters} />
        </div>
        <Footer />
      </div>
    );
  }

  if (currentPage === 'appointment-history') {
    // Check if user is authenticated
    if (!user) {
      setCurrentPage('home');
      setAuthModalMode('login');
      setAuthModalOpen(true);
      return null;
    }

    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <AppointmentHistory onBack={() => setCurrentPage('dashboard')} initialFilter={pageData?.filter} />
        </div>
        <Footer />
      </div>
    );
  }

  if (currentPage === 'save-medical-record') {
    // Only doctors can save medical records
    if (!user || user.role !== 'doctor') {
      setCurrentPage('dashboard');
      return null;
    }

    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <DoctorExamFlow onExit={() => setCurrentPage('dashboard')} />
        </div>
        <Footer />
      </div>
    );
  }

  if (currentPage === 'payment-history') {
    // Only patients can view their payment history
    if (!user || user.role !== 'patient') {
      setCurrentPage('dashboard');
      return null;
    }

    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          <PaymentHistory />
        </div>
        <Footer />
      </div>
    );
  }

  if (currentPage === 'cashier' || currentPage === 'payment-management') {
    const allowed = currentPage === 'cashier' ? ['receptionist', 'admin'] : ['admin'];
    if (!user || !allowed.includes(user.role)) {
      return (
        <div className="app">
          <Navigation />
          <div className="page-content">
            <div className="container">
              <div className="access-denied">
                <div className="access-denied-icon">🚫</div>
                <h2>Không có quyền truy cập</h2>
                <p>Bạn không có quyền truy cập trang này.</p>
                <button className="btn btn-primary" onClick={() => setCurrentPage(user ? 'dashboard' : 'home')}>
                  {user ? 'Về Dashboard' : 'Về trang chủ'}
                </button>
              </div>
            </div>
          </div>
          <Footer />
        </div>
      );
    }

    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          {currentPage === 'cashier'
            ? <CashierDesk onBack={() => setCurrentPage('dashboard')} />
            : <PaymentManagement onBack={() => setCurrentPage('dashboard')} />}
        </div>
        <Footer />
      </div>
    );
  }

  // Pages opened from dashboard cards (they used to fall through to the home page)
  const roleRoutes = {
    'doctor-queue': {
      roles: ['doctor'],
      render: () => (
        <DoctorQueue
          onStartExam={(patient) => { setPageData({ patient, from: 'doctor-queue' }); setCurrentPage('create-medical-record'); }}
          onOpenBoard={() => setCurrentPage('queue-board')}
        />
      )
    },
    'doctor-patients': { roles: ['doctor'], render: () => <PatientRecordsLookup /> },
    'doctor-ratings': {
      roles: ['doctor', 'admin'],
      render: () => <DoctorRatings role={user.role} onBack={() => setCurrentPage('dashboard')} />
    },
    'doctor-leaves': {
      roles: ['doctor', 'admin', 'receptionist'],
      render: () => <DoctorLeaves role={user.role} onBack={() => setCurrentPage('dashboard')} />
    },
    'doctor-follow-ups': {
      roles: ['doctor'],
      render: () => <DoctorFollowUps onBack={() => setCurrentPage('dashboard')} />
    },
    'doctor-schedule': {
      roles: ['doctor'],
      render: () => <DoctorSchedule onBack={() => setCurrentPage('dashboard')} />
    },
    'admin-statistics': {
      roles: ['admin'],
      render: () => <AdminStatistics onBack={() => setCurrentPage('dashboard')} />
    },
    'doctor-management': {
      roles: ['admin'],
      render: () => <ClinicCatalog initialTab="doctors" onBack={() => setCurrentPage('dashboard')} onNavigate={setCurrentPage} />
    },
    'department-management': {
      roles: ['admin'],
      render: () => <ClinicCatalog initialTab="departments" onBack={() => setCurrentPage('dashboard')} onNavigate={setCurrentPage} />
    },
    'recommendation-settings': {
      roles: ['admin'],
      render: () => <RecommendationSettings onBack={() => setCurrentPage('dashboard')} />
    },
    'doctor-shifts': {
      roles: ['admin'],
      render: () => <DoctorShifts onBack={() => setCurrentPage('dashboard')} />
    },
    'medicine-management': {
      roles: ['admin'],
      render: () => <MedicineCatalog onBack={() => setCurrentPage('dashboard')} />
    },
    'security-monitoring': { roles: ['admin'], render: () => <SecurityDashboard /> }
  };

  if (roleRoutes[currentPage]) {
    const route = roleRoutes[currentPage];
    const allowed = user && route.roles.includes(user.role);
    return (
      <div className="app">
        <Navigation />
        <div className="page-content">
          {allowed ? route.render() : (
            <div className="container">
              <div className="access-denied">
                <div className="access-denied-icon">🚫</div>
                <h2>Không có quyền truy cập</h2>
                <p>Bạn không có quyền truy cập trang này.</p>
                <button className="btn btn-primary" onClick={() => setCurrentPage(user ? 'dashboard' : 'home')}>
                  {user ? 'Về Dashboard' : 'Về trang chủ'}
                </button>
              </div>
            </div>
          )}
        </div>
        <Footer />
      </div>
    );
  }

  // Home page
  return (
    <div className="app">
      <Navigation />
      <HomeStore
        user={user}
        onNavigate={(page, data = null) => { setCurrentPage(page); setPageData(data); setNavNonce((n) => n + 1); }}
        onBook={(prefill) => { setPageData({ prefill }); setCurrentPage('booking'); }}
      />
      <Footer />
      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
      />
      {/* Booking Modal */}
      {bookingModalOpen && (
        <div className="modal-overlay" onClick={() => setBookingModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <SimpleBookingForm isModal={true} onClose={() => setBookingModalOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;