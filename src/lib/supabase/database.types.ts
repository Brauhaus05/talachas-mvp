export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      availability_slots: {
        Row: {
          created_at: string;
          end_time: string;
          id: string;
          start_time: string;
          status: Database["public"]["Enums"]["slot_status"];
          talachero_id: string;
        };
        Insert: {
          created_at?: string;
          end_time: string;
          id?: string;
          start_time: string;
          status?: Database["public"]["Enums"]["slot_status"];
          talachero_id: string;
        };
        Update: {
          created_at?: string;
          end_time?: string;
          id?: string;
          start_time?: string;
          status?: Database["public"]["Enums"]["slot_status"];
          talachero_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "availability_slots_talachero_id_fkey";
            columns: ["talachero_id"];
            isOneToOne: false;
            referencedRelation: "talachero_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          address: string | null;
          client_id: string;
          created_at: string;
          currency: string;
          id: string;
          notes: string | null;
          payment_status: string;
          price: number | null;
          service_category_id: string;
          slot_id: string | null;
          status: Database["public"]["Enums"]["booking_status"];
          stripe_payment_intent_id: string | null;
          talachero_id: string;
          tip: number;
          tip_payment_intent_id: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          client_id: string;
          created_at?: string;
          currency?: string;
          id?: string;
          notes?: string | null;
          payment_status?: string;
          price?: number | null;
          service_category_id: string;
          slot_id?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          stripe_payment_intent_id?: string | null;
          talachero_id: string;
          tip?: number;
          tip_payment_intent_id?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          client_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          notes?: string | null;
          payment_status?: string;
          price?: number | null;
          service_category_id?: string;
          slot_id?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          stripe_payment_intent_id?: string | null;
          talachero_id?: string;
          tip?: number;
          tip_payment_intent_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_service_category_id_fkey";
            columns: ["service_category_id"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "availability_slots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_talachero_id_fkey";
            columns: ["talachero_id"];
            isOneToOne: false;
            referencedRelation: "talachero_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          sender_id: string;
          thread_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          sender_id: string;
          thread_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
          thread_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "chat_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_reads: {
        Row: {
          last_read_at: string;
          thread_id: string;
          user_id: string;
        };
        Insert: {
          last_read_at?: string;
          thread_id: string;
          user_id: string;
        };
        Update: {
          last_read_at?: string;
          thread_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_reads_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "chat_threads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_reads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_threads: {
        Row: {
          booking_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          booking_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          booking_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_threads_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      cities: {
        Row: {
          center_point: unknown;
          country_code: string;
          created_at: string;
          currency: string;
          id: string;
          locale: string;
          name: string;
          slug: string;
          timezone: string;
        };
        Insert: {
          center_point?: unknown;
          country_code: string;
          created_at?: string;
          currency: string;
          id?: string;
          locale: string;
          name: string;
          slug: string;
          timezone: string;
        };
        Update: {
          center_point?: unknown;
          country_code?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          locale?: string;
          name?: string;
          slug?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      disputes: {
        Row: {
          admin_note: string | null;
          booking_id: string;
          created_at: string;
          id: string;
          raised_by: string;
          reason: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["dispute_status"];
        };
        Insert: {
          admin_note?: string | null;
          booking_id: string;
          created_at?: string;
          id?: string;
          raised_by: string;
          reason: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["dispute_status"];
        };
        Update: {
          admin_note?: string | null;
          booking_id?: string;
          created_at?: string;
          id?: string;
          raised_by?: string;
          reason?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["dispute_status"];
        };
        Relationships: [
          {
            foreignKeyName: "disputes_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "disputes_raised_by_fkey";
            columns: ["raised_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      neighborhoods: {
        Row: {
          alcaldia: string | null;
          center_point: unknown;
          city_id: string;
          created_at: string;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          alcaldia?: string | null;
          center_point: unknown;
          city_id: string;
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          alcaldia?: string | null;
          center_point?: unknown;
          city_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "neighborhoods_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          author_id: string;
          booking_id: string;
          comment: string | null;
          created_at: string;
          id: string;
          rating: number;
          target_id: string;
        };
        Insert: {
          author_id: string;
          booking_id: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          rating: number;
          target_id: string;
        };
        Update: {
          author_id?: string;
          booking_id?: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          rating?: number;
          target_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      service_categories: {
        Row: {
          created_at: string;
          icon: string;
          id: string;
          name_key: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          icon: string;
          id?: string;
          name_key: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          icon?: string;
          id?: string;
          name_key?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      stripe_events: {
        Row: {
          id: string;
          received_at: string;
          type: string;
        };
        Insert: {
          id: string;
          received_at?: string;
          type: string;
        };
        Update: {
          id?: string;
          received_at?: string;
          type?: string;
        };
        Relationships: [];
      };
      talachero_profiles: {
        Row: {
          bio: string | null;
          center_point: unknown;
          charges_enabled: boolean;
          city_id: string | null;
          created_at: string;
          currency: string;
          hourly_rate: number | null;
          id: string;
          jobs_completed: number;
          neighborhood_id: string | null;
          payouts_enabled: boolean;
          portfolio_photos: string[];
          radius_meters: number | null;
          rating_avg: number;
          rating_count: number;
          stripe_account_id: string | null;
          updated_at: string;
          user_id: string;
          verification_status: Database["public"]["Enums"]["verification_status"];
          years_experience: number | null;
        };
        Insert: {
          bio?: string | null;
          center_point?: unknown;
          charges_enabled?: boolean;
          city_id?: string | null;
          created_at?: string;
          currency?: string;
          hourly_rate?: number | null;
          id?: string;
          jobs_completed?: number;
          neighborhood_id?: string | null;
          payouts_enabled?: boolean;
          portfolio_photos?: string[];
          radius_meters?: number | null;
          rating_avg?: number;
          rating_count?: number;
          stripe_account_id?: string | null;
          updated_at?: string;
          user_id: string;
          verification_status?: Database["public"]["Enums"]["verification_status"];
          years_experience?: number | null;
        };
        Update: {
          bio?: string | null;
          center_point?: unknown;
          charges_enabled?: boolean;
          city_id?: string | null;
          created_at?: string;
          currency?: string;
          hourly_rate?: number | null;
          id?: string;
          jobs_completed?: number;
          neighborhood_id?: string | null;
          payouts_enabled?: boolean;
          portfolio_photos?: string[];
          radius_meters?: number | null;
          rating_avg?: number;
          rating_count?: number;
          stripe_account_id?: string | null;
          updated_at?: string;
          user_id?: string;
          verification_status?: Database["public"]["Enums"]["verification_status"];
          years_experience?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "talachero_profiles_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talachero_profiles_neighborhood_id_fkey";
            columns: ["neighborhood_id"];
            isOneToOne: false;
            referencedRelation: "neighborhoods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talachero_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      talachero_services: {
        Row: {
          is_primary: boolean;
          service_category_id: string;
          talachero_id: string;
        };
        Insert: {
          is_primary?: boolean;
          service_category_id: string;
          talachero_id: string;
        };
        Update: {
          is_primary?: boolean;
          service_category_id?: string;
          talachero_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talachero_services_service_category_id_fkey";
            columns: ["service_category_id"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talachero_services_talachero_id_fkey";
            columns: ["talachero_id"];
            isOneToOne: false;
            referencedRelation: "talachero_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          amount: number;
          booking_id: string;
          created_at: string;
          currency: string;
          id: string;
          provider_ref: string | null;
          type: Database["public"]["Enums"]["transaction_type"];
        };
        Insert: {
          amount: number;
          booking_id: string;
          created_at?: string;
          currency?: string;
          id?: string;
          provider_ref?: string | null;
          type: Database["public"]["Enums"]["transaction_type"];
        };
        Update: {
          amount?: number;
          booking_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          provider_ref?: string | null;
          type?: Database["public"]["Enums"]["transaction_type"];
        };
        Relationships: [
          {
            foreignKeyName: "transactions_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          city_id: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          locale: string;
          phone: string | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
        };
        Insert: {
          city_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          locale?: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Update: {
          city_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          locale?: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "users_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_delete_review: { Args: { p_review_id: string }; Returns: undefined };
      admin_list_bookings: {
        Args: never;
        Returns: {
          client_name: string;
          created_at: string;
          currency: string;
          id: string;
          payment_status: string;
          price: number;
          talachero_name: string;
        }[];
      };
      admin_list_disputes: {
        Args: never;
        Returns: {
          admin_note: string;
          booking_id: string;
          client_name: string;
          created_at: string;
          currency: string;
          id: string;
          payment_status: string;
          price: number;
          reason: string;
          resolved_at: string;
          status: Database["public"]["Enums"]["dispute_status"];
          talachero_name: string;
        }[];
      };
      admin_list_reviews: {
        Args: never;
        Returns: {
          author_name: string;
          comment: string;
          created_at: string;
          id: string;
          rating: number;
          target_name: string;
        }[];
      };
      admin_list_users: {
        Args: never;
        Returns: {
          banned: boolean;
          email: string;
          full_name: string;
          id: string;
          role: Database["public"]["Enums"]["user_role"];
        }[];
      };
      admin_resolve_dispute: {
        Args: { p_dispute_id: string; p_note?: string; p_refunded: boolean };
        Returns: undefined;
      };
      admin_set_ban: {
        Args: { p_banned: boolean; p_user_id: string };
        Returns: undefined;
      };
      cancel_booking: { Args: { p_booking_id: string }; Returns: undefined };
      complete_booking: { Args: { p_booking_id: string }; Returns: undefined };
      create_booking: {
        Args: {
          p_address: string;
          p_hours: number;
          p_notes: string;
          p_service_category_id: string;
          p_slot_id: string;
          p_talachero_id: string;
        };
        Returns: string;
      };
      create_review: {
        Args: { p_booking_id: string; p_comment: string; p_rating: number };
        Returns: string;
      };
      get_my_bookings: {
        Args: never;
        Returns: {
          address: string;
          created_at: string;
          currency: string;
          has_dispute: boolean;
          has_review: boolean;
          id: string;
          payment_status: string;
          price: number;
          service_slug: string;
          slot_start: string;
          status: Database["public"]["Enums"]["booking_status"];
          talachero_id: string;
          talachero_name: string;
        }[];
      };
      get_or_create_thread: { Args: { p_booking_id: string }; Returns: string };
      get_talachero_bookings: {
        Args: never;
        Returns: {
          address: string;
          client_name: string;
          created_at: string;
          currency: string;
          id: string;
          payment_status: string;
          price: number;
          service_slug: string;
          slot_start: string;
          status: Database["public"]["Enums"]["booking_status"];
        }[];
      };
      get_talachero_reviews: {
        Args: { p_id: string };
        Returns: {
          author_name: string;
          comment: string;
          created_at: string;
          id: string;
          rating: number;
        }[];
      };
      get_unread_count: { Args: never; Returns: number };
      get_unread_map: {
        Args: never;
        Returns: {
          booking_id: string;
          unread: number;
        }[];
      };
      is_admin: { Args: never; Returns: boolean };
      is_booking_participant: { Args: { b_id: string }; Returns: boolean };
      list_talacheros: {
        Args: { p_id?: string };
        Returns: {
          available_today: boolean;
          bio: string;
          full_name: string;
          hourly_rate: number;
          id: string;
          jobs_completed: number;
          neighborhood: string;
          primary_service: string;
          rating_avg: number;
          rating_count: number;
          services: string[];
          years_experience: number;
        }[];
      };
      owns_talachero: { Args: { profile_id: string }; Returns: boolean };
      raise_dispute: {
        Args: { p_booking_id: string; p_reason: string };
        Returns: string;
      };
      respond_to_booking: {
        Args: { p_accept: boolean; p_booking_id: string };
        Returns: undefined;
      };
      update_talachero_profile: {
        Args: {
          p_bio: string;
          p_hourly_rate: number;
          p_primary_slug: string;
          p_service_slugs: string[];
          p_years_experience: number;
        };
        Returns: undefined;
      };
    };
    Enums: {
      booking_status:
        "requested" | "confirmed" | "in_progress" | "completed" | "cancelled";
      dispute_status: "open" | "refunded" | "dismissed";
      slot_status: "open" | "booked" | "blocked";
      transaction_type: "charge" | "payout" | "refund" | "tip";
      user_role: "client" | "talachero" | "admin";
      verification_status: "pending" | "verified" | "rejected";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_status: ["requested", "confirmed", "in_progress", "completed", "cancelled"],
      dispute_status: ["open", "refunded", "dismissed"],
      slot_status: ["open", "booked", "blocked"],
      transaction_type: ["charge", "payout", "refund", "tip"],
      user_role: ["client", "talachero", "admin"],
      verification_status: ["pending", "verified", "rejected"],
    },
  },
} as const;
