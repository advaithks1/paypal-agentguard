import type { Payment, PaymentIntent } from '@/types';
import { api } from './api';
import { isDemoMode } from './config';
import { demoUnavailable } from './demo/workflow';

/** PayPal calls only ever go through the backend. Demo mode cannot pay: it says so instead of faking a payment. */
const unavailable = <T>(what: string): Promise<T> => Promise.reject(demoUnavailable(what));
const id = encodeURIComponent;

export const paymentService = {
  createOrder(purchaseRequestId: string, intent?: PaymentIntent): Promise<Payment> {
    return isDemoMode ? unavailable('PayPal checkout') : api.post<Payment>('/payments/create-order', intent ? { purchase_request_id: purchaseRequestId, intent } : { purchase_request_id: purchaseRequestId });
  },
  /** After the buyer approved at PayPal: hold the funds (no charge). */
  authorize(paypalOrderId: string): Promise<Payment> {
    return isDemoMode ? unavailable('Holding funds with PayPal') : api.post<Payment>('/payments/authorize', { paypal_order_id: paypalOrderId });
  },
  /** Capture the held funds (optionally partially). The backend refuses unless a human approved and the amount fits the hold. */
  captureAuthorization(paymentId: string, amount?: number): Promise<Payment> {
    return isDemoMode ? unavailable('Capturing held funds') : api.post<Payment>(`/payments/${id(paymentId)}/capture-authorization`, amount === undefined ? {} : { amount, final_capture: false });
  },
  voidAuthorization(paymentId: string): Promise<Payment> {
    return isDemoMode ? unavailable('Releasing held funds') : api.post<Payment>(`/payments/${id(paymentId)}/void-authorization`);
  },
  reauthorize(paymentId: string): Promise<Payment> {
    return isDemoMode ? unavailable('Renewing a hold') : api.post<Payment>(`/payments/${id(paymentId)}/reauthorize`);
  },
  capture(paypalOrderId: string): Promise<Payment> {
    return isDemoMode ? unavailable('Capturing a PayPal payment') : api.post<Payment>('/payments/capture', { paypal_order_id: paypalOrderId });
  },
  refund(paymentId: string, amount?: number): Promise<Payment> {
    return isDemoMode ? unavailable('Refunds') : api.post<Payment>(`/payments/${id(paymentId)}/refund`, amount === undefined ? {} : { amount });
  },
  void(paymentId: string): Promise<Payment> {
    return isDemoMode ? unavailable('Voiding an order') : api.post<Payment>(`/payments/${id(paymentId)}/void`);
  },
  byRequest(purchaseRequestId: string): Promise<Payment | null> {
    return isDemoMode ? Promise.resolve(null) : api.get<Payment | null>(`/payments/by-request/${id(purchaseRequestId)}`);
  },
  sync(paymentId: string): Promise<Payment> {
    return isDemoMode ? unavailable('Syncing with PayPal') : api.get<Payment>(`/payments/${id(paymentId)}/sync`);
  },
};
