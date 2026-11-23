import React from 'react';
import { SimpleBookingForm } from './appointments';
import './BookingPage.css';

/**
 * Public Booking Page
 * Landing page for non-logged-in users to book appointments
 */
const BookingPage = ({ onNavigate, initialSuggestion = null, prefill = null }) => {
  return (
    <div className="booking-page-shell">
      <SimpleBookingForm prefill={prefill} />
    </div>
  );
};

export default BookingPage;
