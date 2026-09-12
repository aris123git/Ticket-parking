import type { PaymentMethod } from "./payment.js";

export type Role = "CASHIER" | "ADMIN";
export type SaleStatus = "SOLD" | "CANCELLED" | "REFUNDED";
export type DurationUnit = "HOURS" | "WEEKS";
export type SyncStatus = "PENDING" | "SYNCED" | "FAILED";
export type PaperWidth = 58 | 80;

export type Tariff = {
  id: string;
  reference: string;
  name: string;
  durationValue: number;
  durationUnit: DurationUnit;
  priceFcfa: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaleSnapshot = {
  id: string;
  ticketNumber: string;
  tariffId: string | null;
  tariffRef: string;
  tariffName: string;
  durationValue: number;
  durationUnit: DurationUnit;
  priceFcfa: number;
  paymentMethod?: PaymentMethod;
  amountReceived?: number;
  changeFcfa?: number;
  cashierId: string;
  cashierName: string;
  status: SaleStatus;
  soldAt: string;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancelReason?: string | null;
  refundedAt?: string | null;
  refundedBy?: string | null;
  refundReason?: string | null;
};

export type AuditEvent = {
  id: string;
  userId: string | null;
  userName: string;
  userRole: string;
  operation: string;
  entityType: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  createdAt: string;
};
