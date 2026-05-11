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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string | null
          created_at: string | null
          details: Json | null
          id: number
          org_id: string | null
          resource_id: string | null
          resource_type: string | null
          user_id: string | null
          user_name: string | null
          user_role: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          details?: Json | null
          id?: number
          org_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          details?: Json | null
          id?: number
          org_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      booking_channels: {
        Row: {
          active: boolean | null
          color: string | null
          created_at: string | null
          default_commission_pct: number | null
          default_payout_delay_days: number | null
          icon: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          default_commission_pct?: number | null
          default_payout_delay_days?: number | null
          icon?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          default_commission_pct?: number | null
          default_payout_delay_days?: number | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          accommodation_total: number | null
          channel_ref: string | null
          channel_slug: string | null
          checkin: string | null
          checkout: string | null
          cleaning_fee: number | null
          cohost_id: string | null
          cohost_name: string | null
          created_at: string | null
          currency: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          discount_pct: number | null
          grand_total: number | null
          guests: number | null
          id: string
          nightly_rate: number | null
          nights: number | null
          notes: string | null
          org_id: string
          payment_method: string | null
          payment_status: string | null
          property_id: string
          ref_number: string
          rental_items: Json | null
          rental_items_total: number | null
          season: string | null
          services: Json | null
          services_total: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          accommodation_total?: number | null
          channel_ref?: string | null
          channel_slug?: string | null
          checkin?: string | null
          checkout?: string | null
          cleaning_fee?: number | null
          cohost_id?: string | null
          cohost_name?: string | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          discount_pct?: number | null
          grand_total?: number | null
          guests?: number | null
          id?: string
          nightly_rate?: number | null
          nights?: number | null
          notes?: string | null
          org_id: string
          payment_method?: string | null
          payment_status?: string | null
          property_id: string
          ref_number: string
          rental_items?: Json | null
          rental_items_total?: number | null
          season?: string | null
          services?: Json | null
          services_total?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          accommodation_total?: number | null
          channel_ref?: string | null
          channel_slug?: string | null
          checkin?: string | null
          checkout?: string | null
          cleaning_fee?: number | null
          cohost_id?: string | null
          cohost_name?: string | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount_pct?: number | null
          grand_total?: number | null
          guests?: number | null
          id?: string
          nightly_rate?: number | null
          nights?: number | null
          notes?: string | null
          org_id?: string
          payment_method?: string | null
          payment_status?: string | null
          property_id?: string
          ref_number?: string
          rental_items?: Json | null
          rental_items_total?: number | null
          season?: string | null
          services?: Json | null
          services_total?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_channel_slug_fkey"
            columns: ["channel_slug"]
            isOneToOne: false
            referencedRelation: "booking_channels"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "bookings_cohost_id_fkey"
            columns: ["cohost_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number | null
          created_at: string | null
          currency: string | null
          due_date: string | null
          id: string
          invoice_number: string
          org_id: string | null
          paid_at: string | null
          pdf_url: string | null
          status: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          org_id?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          status?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          org_id?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          status?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          active: boolean | null
          brand_name: string | null
          city: string | null
          contact_email: string | null
          country: string | null
          created_at: string | null
          default_currency: string | null
          default_language: string | null
          features: Json | null
          id: string
          logo_url: string | null
          max_employees: number | null
          max_properties: number | null
          name: string
          next_billing_date: string | null
          owner_id: string | null
          plan: string | null
          primary_color: string | null
          secondary_color: string | null
          slug: string | null
          subscription_status: string | null
          trial_ends_at: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          active?: boolean | null
          brand_name?: string | null
          city?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string | null
          default_currency?: string | null
          default_language?: string | null
          features?: Json | null
          id?: string
          logo_url?: string | null
          max_employees?: number | null
          max_properties?: number | null
          name: string
          next_billing_date?: string | null
          owner_id?: string | null
          plan?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          active?: boolean | null
          brand_name?: string | null
          city?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string | null
          default_currency?: string | null
          default_language?: string | null
          features?: Json | null
          id?: string
          logo_url?: string | null
          max_employees?: number | null
          max_properties?: number | null
          name?: string
          next_billing_date?: string | null
          owner_id?: string | null
          plan?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean | null
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          language: string | null
          org_id: string | null
          phone: string | null
          role: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          active?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          language?: string | null
          org_id?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          active?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          language?: string | null
          org_id?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          active: boolean | null
          address: string | null
          airbnb_url: string | null
          amenities: Json | null
          base_price: number | null
          bathrooms: number | null
          bedrooms: number | null
          booking_url: string | null
          capacity: number | null
          city: string | null
          cleaning_fee: number | null
          country: string | null
          cover_image_url: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          expedia_url: string | null
          id: string
          internal_notes: string | null
          name: string
          org_id: string
          short_name: string | null
          updated_at: string | null
          vrbo_url: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          airbnb_url?: string | null
          amenities?: Json | null
          base_price?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          booking_url?: string | null
          capacity?: number | null
          city?: string | null
          cleaning_fee?: number | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          expedia_url?: string | null
          id?: string
          internal_notes?: string | null
          name: string
          org_id: string
          short_name?: string | null
          updated_at?: string | null
          vrbo_url?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          airbnb_url?: string | null
          amenities?: Json | null
          base_price?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          booking_url?: string | null
          capacity?: number | null
          city?: string | null
          cleaning_fee?: number | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          expedia_url?: string | null
          id?: string
          internal_notes?: string | null
          name?: string
          org_id?: string
          short_name?: string | null
          updated_at?: string | null
          vrbo_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      property_cohosts: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          permissions: string[] | null
          property_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          permissions?: string[] | null
          property_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          permissions?: string[] | null
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_cohosts_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_cohosts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_cohosts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_items: {
        Row: {
          active: boolean | null
          category: string | null
          created_at: string | null
          daily_price: number | null
          deposit: number | null
          description: string | null
          icon: string | null
          id: string
          image_url: string | null
          name: string
          org_id: string
          stock_quantity: number | null
          weekly_price: number | null
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          created_at?: string | null
          daily_price?: number | null
          deposit?: number | null
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          name: string
          org_id: string
          stock_quantity?: number | null
          weekly_price?: number | null
        }
        Update: {
          active?: boolean | null
          category?: string | null
          created_at?: string | null
          daily_price?: number | null
          deposit?: number | null
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          name?: string
          org_id?: string
          stock_quantity?: number | null
          weekly_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean | null
          category: string | null
          commission_pct: number | null
          created_at: string | null
          currency: string | null
          description: string | null
          duration_hours: number | null
          id: string
          image_url: string | null
          name: string
          org_id: string
          price: number | null
          provider_id: string | null
          provider_name: string | null
          provider_phone: string | null
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          commission_pct?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          duration_hours?: number | null
          id?: string
          image_url?: string | null
          name: string
          org_id: string
          price?: number | null
          provider_id?: string | null
          provider_name?: string | null
          provider_phone?: string | null
        }
        Update: {
          active?: boolean | null
          category?: string | null
          commission_pct?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          duration_hours?: number | null
          id?: string
          image_url?: string | null
          name?: string
          org_id?: string
          price?: number | null
          provider_id?: string | null
          provider_name?: string | null
          provider_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number | null
          billing_cycle: string | null
          created_at: string | null
          currency: string | null
          ends_at: string | null
          id: string
          org_id: string | null
          plan: string
          starts_at: string | null
          status: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          amount?: number | null
          billing_cycle?: string | null
          created_at?: string | null
          currency?: string | null
          ends_at?: string | null
          id?: string
          org_id?: string | null
          plan: string
          starts_at?: string | null
          status?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          amount?: number | null
          billing_cycle?: string | null
          created_at?: string | null
          currency?: string | null
          ends_at?: string | null
          id?: string
          org_id?: string | null
          plan?: string
          starts_at?: string | null
          status?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          booking_id: string | null
          completed_at: string | null
          completed_photo_url: string | null
          created_at: string | null
          guest_flight_info: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          notes: string | null
          org_id: string
          priority: string | null
          property_id: string | null
          ref_number: string
          scheduled_date: string | null
          scheduled_time: string | null
          status: string | null
          task_type: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_by?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          booking_id?: string | null
          completed_at?: string | null
          completed_photo_url?: string | null
          created_at?: string | null
          guest_flight_info?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          org_id: string
          priority?: string | null
          property_id?: string | null
          ref_number: string
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string | null
          task_type?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_by?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          booking_id?: string | null
          completed_at?: string | null
          completed_photo_url?: string | null
          created_at?: string | null
          guest_flight_info?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          priority?: string | null
          property_id?: string | null
          ref_number?: string
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string | null
          task_type?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_with_property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      bookings_with_property: {
        Row: {
          accommodation_total: number | null
          channel_ref: string | null
          channel_slug: string | null
          checkin: string | null
          checkout: string | null
          cleaning_fee: number | null
          cohost_id: string | null
          cohost_name: string | null
          created_at: string | null
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_pct: number | null
          grand_total: number | null
          guests: number | null
          id: string | null
          nightly_rate: number | null
          nights: number | null
          notes: string | null
          org_id: string | null
          payment_method: string | null
          payment_status: string | null
          property_address: string | null
          property_city: string | null
          property_id: string | null
          property_name: string | null
          ref_number: string | null
          rental_items: Json | null
          rental_items_total: number | null
          season: string | null
          services: Json | null
          services_total: number | null
          status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_channel_slug_fkey"
            columns: ["channel_slug"]
            isOneToOne: false
            referencedRelation: "booking_channels"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "bookings_cohost_id_fkey"
            columns: ["cohost_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks_with_property: {
        Row: {
          assigned_by: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          booking_id: string | null
          completed_at: string | null
          completed_photo_url: string | null
          created_at: string | null
          guest_flight_info: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string | null
          notes: string | null
          org_id: string | null
          priority: string | null
          property_address: string | null
          property_city: string | null
          property_id: string | null
          property_name: string | null
          ref_number: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          status: string | null
          task_type: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_with_property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      is_org_admin: { Args: never; Returns: boolean }
      is_org_staff: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      my_org_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
