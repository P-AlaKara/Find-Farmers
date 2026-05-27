export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string
          email: string
          id: string
          password_hash: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          password_hash: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          password_hash?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          acres_booked: number
          booking_status: Database["public"]["Enums"]["booking_status"]
          buyer_id: string
          callback_url: string | null
          created_at: string
          buyer_rating: number | null
          delivery_date: string | null
          farmer_id: string
          final_price: number | null
          id: string
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          price_per_acre: number
          received_confirmed_at: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          acres_booked: number
          booking_status?: Database["public"]["Enums"]["booking_status"]
          buyer_id: string
          callback_url?: string | null
          created_at?: string
          buyer_rating?: number | null
          delivery_date?: string | null
          farmer_id: string
          final_price?: number | null
          id?: string
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          price_per_acre?: number
          received_confirmed_at?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          acres_booked?: number
          booking_status?: Database["public"]["Enums"]["booking_status"]
          buyer_id?: string
          callback_url?: string | null
          created_at?: string
          buyer_rating?: number | null
          delivery_date?: string | null
          farmer_id?: string
          final_price?: number | null
          id?: string
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          price_per_acre?: number
          received_confirmed_at?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_complaints: {
        Row: {
          booking_id: string | null
          buyer_id: string
          content: string
          created_at: string
          id: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          buyer_id: string
          content: string
          created_at?: string
          id?: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          buyer_id?: string
          content?: string
          created_at?: string
          id?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_complaints_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_complaints_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      buyers: {
        Row: {
          account_status: string
          additional_locations: Json | null
          additional_notes: string | null
          business_type: string | null
          buyer_name: string
          company_name: string | null
          contact_full_name: string | null
          contact_role: string | null
          county: string
          created_at: string
          demand_frequency: string | null
          demand_frequency_custom: string | null
          email: string
          id: string
          password_hash: string | null
          phone_number: string
          preferred_contact_methods: string[] | null
          primary_county: string | null
          primary_town: string | null
          profile_completed: boolean
          quality_preference: string | null
          quality_specifications: string | null
          quantity_per_order: number | null
          quantity_unit: string | null
          setup_token: string | null
          setup_token_expires_at: string | null
          varieties_other: string | null
          varieties_required: string[] | null
        }
        Insert: {
          account_status?: string
          additional_locations?: Json | null
          additional_notes?: string | null
          business_type?: string | null
          buyer_name: string
          company_name?: string | null
          contact_full_name?: string | null
          contact_role?: string | null
          county: string
          created_at?: string
          demand_frequency?: string | null
          demand_frequency_custom?: string | null
          email: string
          id?: string
          password_hash?: string | null
          phone_number: string
          preferred_contact_methods?: string[] | null
          primary_county?: string | null
          primary_town?: string | null
          profile_completed?: boolean
          quality_preference?: string | null
          quality_specifications?: string | null
          quantity_per_order?: number | null
          quantity_unit?: string | null
          setup_token?: string | null
          setup_token_expires_at?: string | null
          varieties_other?: string | null
          varieties_required?: string[] | null
        }
        Update: {
          account_status?: string
          additional_locations?: Json | null
          additional_notes?: string | null
          business_type?: string | null
          buyer_name?: string
          company_name?: string | null
          contact_full_name?: string | null
          contact_role?: string | null
          county?: string
          created_at?: string
          demand_frequency?: string | null
          demand_frequency_custom?: string | null
          email?: string
          id?: string
          password_hash?: string | null
          phone_number?: string
          preferred_contact_methods?: string[] | null
          primary_county?: string | null
          primary_town?: string | null
          profile_completed?: boolean
          quality_preference?: string | null
          quality_specifications?: string | null
          quantity_per_order?: number | null
          quantity_unit?: string | null
          setup_token?: string | null
          setup_token_expires_at?: string | null
          varieties_other?: string | null
          varieties_required?: string[] | null
        }
        Relationships: []
      }
      farmers: {
        Row: {
          acreage_planted: number
          county: string
          created_at: string
          email: string | null
          farmer_id: string | null
          full_name: string
          id: string
          listing_status: Database["public"]["Enums"]["listing_status"]
          password_hash: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone_number: string
          planting_date: string
          potato_variety: string
          registration_fee: number | null
          registration_status: Database["public"]["Enums"]["registration_status"]
          specific_location: string
          updated_at: string
          ward: string
        }
        Insert: {
          acreage_planted: number
          county: string
          created_at?: string
          email?: string | null
          farmer_id?: string | null
          full_name: string
          id?: string
          listing_status?: Database["public"]["Enums"]["listing_status"]
          password_hash?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone_number: string
          planting_date: string
          potato_variety: string
          registration_fee?: number | null
          registration_status?: Database["public"]["Enums"]["registration_status"]
          specific_location: string
          updated_at?: string
          ward: string
        }
        Update: {
          acreage_planted?: number
          county?: string
          created_at?: string
          email?: string | null
          farmer_id?: string | null
          full_name?: string
          id?: string
          listing_status?: Database["public"]["Enums"]["listing_status"]
          password_hash?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone_number?: string
          planting_date?: string
          potato_variety?: string
          registration_fee?: number | null
          registration_status?: Database["public"]["Enums"]["registration_status"]
          specific_location?: string
          updated_at?: string
          ward?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_short_id: { Args: { prefix?: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      booking_status: "pending_approval" | "approved" | "rejected" | "confirmed"
      listing_status: "available" | "pending_approval" | "booked"
      payment_status: "pending" | "paid" | "promo_code" | "rejected"
      registration_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      booking_status: ["pending_approval", "approved", "rejected", "confirmed"],
      listing_status: ["available", "pending_approval", "booked"],
      payment_status: ["pending", "paid", "promo_code", "rejected"],
      registration_status: ["pending", "approved", "rejected"],
    },
  },
} as const
