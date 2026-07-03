/**
 * Database types for the Supabase schema (Phase 2).
 *
 * Hand-authored to mirror supabase/migrations. Once the local stack is running
 * this file can be regenerated 1:1 with:
 *
 *   pnpm exec supabase gen types typescript --local > src/lib/supabase/types.ts
 *
 * Keep it in sync with the migrations until that command becomes the source of
 * truth.
 */

export type UserRole = "client" | "talachero" | "admin";
export type VerificationStatus = "pending" | "verified" | "rejected";
export type SlotStatus = "open" | "booked" | "blocked";
export type BookingStatus =
  "requested" | "confirmed" | "in_progress" | "completed" | "cancelled";
export type TransactionType = "charge" | "payout" | "refund" | "tip";

type Timestamp = string;

export interface Database {
  public: {
    Tables: {
      cities: {
        Row: {
          id: string;
          slug: string;
          name: string;
          country_code: string;
          currency: string;
          locale: string;
          timezone: string;
          center_point: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          country_code: string;
          currency: string;
          locale: string;
          timezone: string;
          center_point?: string | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["cities"]["Insert"]>;
        Relationships: [];
      };
      service_categories: {
        Row: {
          id: string;
          slug: string;
          name_key: string;
          icon: string;
          sort_order: number;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          slug: string;
          name_key: string;
          icon: string;
          sort_order?: number;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["service_categories"]["Insert"]>;
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          role: UserRole;
          email: string | null;
          phone: string | null;
          full_name: string | null;
          locale: string;
          city_id: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id: string;
          role?: UserRole;
          email?: string | null;
          phone?: string | null;
          full_name?: string | null;
          locale?: string;
          city_id?: string | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      talachero_profiles: {
        Row: {
          id: string;
          user_id: string;
          bio: string | null;
          hourly_rate: number | null;
          currency: string;
          city_id: string | null;
          center_point: string | null;
          radius_meters: number | null;
          verification_status: VerificationStatus;
          portfolio_photos: string[];
          years_experience: number | null;
          rating_avg: number;
          rating_count: number;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          bio?: string | null;
          hourly_rate?: number | null;
          currency?: string;
          city_id?: string | null;
          center_point?: string | null;
          radius_meters?: number | null;
          verification_status?: VerificationStatus;
          portfolio_photos?: string[];
          years_experience?: number | null;
          rating_avg?: number;
          rating_count?: number;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["talachero_profiles"]["Insert"]>;
        Relationships: [];
      };
      talachero_services: {
        Row: {
          talachero_id: string;
          service_category_id: string;
          is_primary: boolean;
        };
        Insert: {
          talachero_id: string;
          service_category_id: string;
          is_primary?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["talachero_services"]["Insert"]>;
        Relationships: [];
      };
      availability_slots: {
        Row: {
          id: string;
          talachero_id: string;
          start_time: Timestamp;
          end_time: Timestamp;
          status: SlotStatus;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          talachero_id: string;
          start_time: Timestamp;
          end_time: Timestamp;
          status?: SlotStatus;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["availability_slots"]["Insert"]>;
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          client_id: string;
          talachero_id: string;
          service_category_id: string;
          slot_id: string | null;
          status: BookingStatus;
          price: number | null;
          tip: number;
          currency: string;
          address: string | null;
          notes: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          client_id: string;
          talachero_id: string;
          service_category_id: string;
          slot_id?: string | null;
          status?: BookingStatus;
          price?: number | null;
          tip?: number;
          currency?: string;
          address?: string | null;
          notes?: string | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["bookings"]["Insert"]>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          booking_id: string;
          type: TransactionType;
          amount: number;
          currency: string;
          provider_ref: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          booking_id: string;
          type: TransactionType;
          amount: number;
          currency?: string;
          provider_ref?: string | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
        Relationships: [];
      };
      chat_threads: {
        Row: { id: string; booking_id: string; created_at: Timestamp };
        Insert: { id?: string; booking_id: string; created_at?: Timestamp };
        Update: Partial<Database["public"]["Tables"]["chat_threads"]["Insert"]>;
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          thread_id: string;
          sender_id: string;
          body: string;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          thread_id: string;
          sender_id: string;
          body: string;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["chat_messages"]["Insert"]>;
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          booking_id: string;
          author_id: string;
          target_id: string;
          rating: number;
          comment: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          booking_id: string;
          author_id: string;
          target_id: string;
          rating: number;
          comment?: string | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: { Args: Record<never, never>; Returns: boolean };
      owns_talachero: { Args: { profile_id: string }; Returns: boolean };
      is_booking_participant: { Args: { b_id: string }; Returns: boolean };
    };
    Enums: {
      user_role: UserRole;
      verification_status: VerificationStatus;
      slot_status: SlotStatus;
      booking_status: BookingStatus;
      transaction_type: TransactionType;
    };
    CompositeTypes: Record<never, never>;
  };
}
