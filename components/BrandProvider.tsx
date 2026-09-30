"use client";

// The brand the signed-in user sees (the platform's, or their white-label
// reseller's), for client components that print the product name — onboarding,
// payment windows, help text. Provided by the dashboard layout from lib/branding.

import { createContext, useContext, type ReactNode } from "react";

export interface ClientBrand {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
  isWhiteLabel: boolean;
}

const BrandContext = createContext<ClientBrand>({
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "WhatsCRM",
  logoUrl: null,
  primaryColor: "#059669",
  supportEmail: null,
  isWhiteLabel: false,
});

export function BrandProvider({ brand, children }: { brand: ClientBrand; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): ClientBrand {
  return useContext(BrandContext);
}
