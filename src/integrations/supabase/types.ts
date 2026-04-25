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
      bookings: {
        Row: {
          acres_booked: number
          booking_status: Database["public"]["Enums"]["booking_status"]
          buyer_id: string
          created_at: string
          farmer_id: string
          id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          price_per_acre: number
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          acres_booked: number
          booking_status?: Database["public"]["Enums"]["booking_status"]
          buyer_id: string
          created_at?: string
          farmer_id: string
          id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          price_per_acre?: number
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          acres_booked?: number
          booking_status?: Database["public"]["Enums"]["booking_status"]
          buyer_id?: string
          created_at?: string
          farmer_id?: string
          id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          price_per_acre?: number
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
      buyers: {
        Row: {
          buyer_name: string
          county: string
          created_at: string
          email: string
          id: string
          phone_number: string
        }
        Insert: {
          buyer_name: string
          county: string
          created_at?: string
          email: string
          id?: string
          phone_number: string
        }
        Update: {
          buyer_name?: string
          county?: string
          created_at?: string
          email?: string
          id?: string
          phone_number?: string
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
      booking_status: "pending_approval" | "approved" | "rejected"
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
      booking_status: ["pending_approval", "approved", "rejected"],
      listing_status: ["available", "pending_approval", "booked"],
      payment_status: ["pending", "paid", "promo_code", "rejected"],
      registration_status: ["pending", "approved", "rejected"],
    },
  },
} as const
