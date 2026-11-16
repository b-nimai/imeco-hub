/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_GOOGLE_API_KEY?: string;
  readonly VITE_BILLING_SPREADSHEET_ID?: string;
  readonly VITE_BILLING_SHEET_NAME?: string;
  readonly VITE_DISPATCH_SPREADSHEET_ID?: string;
  readonly VITE_SALES_SPREADSHEET_ID?: string;
  readonly VITE_SALES_AD_SPEND_SPREADSHEET_ID?: string;
  readonly VITE_SALES_D2C_AD_SPEND_SPREADSHEET_ID?: string;
  readonly VITE_SALES_MEESHO_AD_SPEND_SPREADSHEET_ID?: string;
  readonly VITE_STOCK_APPS_SCRIPT_URL?: string;
}
