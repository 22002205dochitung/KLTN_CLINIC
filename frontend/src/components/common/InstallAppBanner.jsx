import React, { useEffect, useState } from 'react';
import './InstallAppBanner.css';

const DISMISS_KEY = 'pwa-install-dismissed-at';
const DISMISS_DAYS = 7;

const readDismissed = () => {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at && Date.now() - at < DISMISS_DAYS * 86400000;
  } catch (e) {
    return false;
  }
};

const isStandalone = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch (e) {
    return false;
  }
};

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent || '')
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * InstallAppBanner - offers to install the web app on the phone's home screen.
 * Android / desktop Chrome & Edge: one-tap install through the browser prompt.
 * iPhone Safari: short instructions (Safari has no install prompt).
 */
const InstallAppBanner = () => {
  const [promptEvent, setPromptEvent] = useState(null);
  const [mode, setMode] = useState(null); // 'prompt' | 'ios' | null
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone() || readDismissed()) return undefined;

    const onPrompt = (e) => {
      e.preventDefault();
      setPromptEvent(e);
      setMode('prompt');
    };
    const onInstalled = () => {
      setInstalled(true);
      setMode(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if (isIos()) setMode('ios');

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* private mode */ }
    setMode(null);
  };

  const install = async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    try {
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === 'accepted') setInstalled(true);
    } catch (e) {
      // ignore
    }
    setPromptEvent(null);
    setMode(null);
  };

  if (installed || !mode) return null;

  return (
    <div className="install-banner" role="dialog" aria-label="Cài ứng dụng THCT Clinic">
      <img className="install-banner-icon" src={`${process.env.PUBLIC_URL}/icons/icon-192.png`} alt="" width="44" height="44" />
      <div className="install-banner-text">
        <strong>Cài THCT Clinic lên điện thoại</strong>
        {mode === 'ios' ? (
          <span>Bấm <b>Chia sẻ</b> <span aria-hidden="true">⬆︎</span> rồi chọn <b>Thêm vào MH chính</b>.</span>
        ) : (
          <span>Mở nhanh như app, toàn màn hình, không cần vào trình duyệt.</span>
        )}
      </div>
      <div className="install-banner-actions">
        {mode === 'prompt' && (
          <button type="button" className="install-banner-btn" onClick={install}>Cài đặt</button>
        )}
        <button type="button" className="install-banner-close" onClick={dismiss} aria-label="Để sau">✕</button>
      </div>
    </div>
  );
};

export default InstallAppBanner;
