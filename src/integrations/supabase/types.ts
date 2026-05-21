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
      cleaning_checklists: {
        Row: {
          created_at: string
          done: boolean
          id: string
          label: string
          organization_id: string
          sort_order: number
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          label: string
          organization_id: string
          sort_order?: number
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          label?: string
          organization_id?: string
          sort_order?: number
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_checklists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_checklists_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_checklists_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_property"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_accounts: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string | null
          id: string
          language: string
          marketing_consent: boolean
          organization_id: string
          phone: string | null
          property_id: string | null
          reservation_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          language?: string
          marketing_consent?: boolean
          organization_id: string
          phone?: string | null
          property_id?: string | null
          reservation_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          language?: string
          marketing_consent?: boolean
          organization_id?: string
          phone?: string | null
          property_id?: string | null
          reservation_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_accounts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_books: {
        Row: {
          active: boolean
          attractions: Json
          check_in_instructions: string | null
          check_out_instructions: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          emergency_phone: string | null
          extra_notes: string | null
          house_rules: string | null
          id: string
          language: string
          organization_id: string
          property_id: string
          restaurants: Json
          slug: string
          updated_at: string
          wifi_name: string | null
          wifi_password: string | null
        }
        Insert: {
          active?: boolean
          attractions?: Json
          check_in_instructions?: string | null
          check_out_instructions?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          emergency_phone?: string | null
          extra_notes?: string | null
          house_rules?: string | null
          id?: string
          language?: string
          organization_id: string
          property_id: string
          restaurants?: Json
          slug: string
          updated_at?: string
          wifi_name?: string | null
          wifi_password?: string | null
        }
        Update: {
          active?: boolean
          attractions?: Json
          check_in_instructions?: string | null
          check_out_instructions?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          emergency_phone?: string | null
          extra_notes?: string | null
          house_rules?: string | null
          id?: string
          language?: string
          organization_id?: string
          property_id?: string
          restaurants?: Json
          slug?: string
          updated_at?: string
          wifi_name?: string | null
          wifi_password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_books_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_books_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_messages: {
        Row: {
          body: string
          created_at: string
          guest_account_id: string
          id: string
          organization_id: string
          read_at: string | null
          sender_id: string | null
          sender_role: string
        }
        Insert: {
          body: string
          created_at?: string
          guest_account_id: string
          id?: string
          organization_id: string
          read_at?: string | null
          sender_id?: string | null
          sender_role: string
        }
        Update: {
          body?: string
          created_at?: string
          guest_account_id?: string
          id?: string
          organization_id?: string
          read_at?: string | null
          sender_id?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_messages_guest_account_id_fkey"
            columns: ["guest_account_id"]
            isOneToOne: false
            referencedRelation: "guest_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_uploads: {
        Row: {
          comment: string | null
          created_at: string
          guest_account_id: string
          id: string
          organization_id: string
          storage_path: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          guest_account_id: string
          id?: string
          organization_id: string
          storage_path: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          guest_account_id?: string
          id?: string
          organization_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_uploads_guest_account_id_fkey"
            columns: ["guest_account_id"]
            isOneToOne: false
            referencedRelation: "guest_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_uploads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      maintenance_tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          organization_id: string
          photo_url: string | null
          priority: string
          property_id: string | null
          reported_by: string | null
          reporter_name: string | null
          reporter_phone: string | null
          resolved_at: string | null
          status: string
          task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id: string
          photo_url?: string | null
          priority?: string
          property_id?: string | null
          reported_by?: string | null
          reporter_name?: string | null
          reporter_phone?: string | null
          resolved_at?: string | null
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string
          photo_url?: string | null
          priority?: string
          property_id?: string | null
          reported_by?: string | null
          reporter_name?: string | null
          reporter_phone?: string | null
          resolved_at?: string | null
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_property"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean | null
          brand_color: string | null
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
          max_cohosts: number
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
          suspended: boolean
          trial_ends_at: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          active?: boolean | null
          brand_color?: string | null
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
          max_cohosts?: number
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
          suspended?: boolean
          trial_ends_at?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          active?: boolean | null
          brand_color?: string | null
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
          max_cohosts?: number
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
          suspended?: boolean
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
          invitation_status: string | null
          invited_by: string | null
          language: string | null
          org_id: string | null
          pending_org_id: string | null
          pending_role: string | null
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
          invitation_status?: string | null
          invited_by?: string | null
          language?: string | null
          org_id?: string | null
          pending_org_id?: string | null
          pending_role?: string | null
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
          invitation_status?: string | null
          invited_by?: string | null
          language?: string | null
          org_id?: string | null
          pending_org_id?: string | null
          pending_role?: string | null
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
          {
            foreignKeyName: "profiles_pending_org_id_fkey"
            columns: ["pending_org_id"]
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
      property_ical_feeds: {
        Row: {
          active: boolean
          created_at: string
          ical_url: string
          id: string
          label: string
          last_error: string | null
          last_synced_at: string | null
          last_synced_count: number | null
          organization_id: string
          property_id: string
          source: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ical_url: string
          id?: string
          label: string
          last_error?: string | null
          last_synced_at?: string | null
          last_synced_count?: number | null
          organization_id: string
          property_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ical_url?: string
          id?: string
          label?: string
          last_error?: string | null
          last_synced_at?: string | null
          last_synced_count?: number | null
          organization_id?: string
          property_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_ical_feeds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_ical_feeds_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_members: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          organization_id: string
          property_id: string
          role: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          organization_id: string
          property_id: string
          role: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          property_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_members_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
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
      task_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          kind: string
          org_id: string
          storage_path: string
          task_id: string
          uploaded_by: string | null
          zone: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          kind?: string
          org_id: string
          storage_path: string
          task_id: string
          uploaded_by?: string | null
          zone?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          storage_path?: string
          task_id?: string
          uploaded_by?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_photos_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_photos_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_with_property"
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
      get_public_guest_book: {
        Args: { _slug: string }
        Returns: {
          active: boolean
          attractions: Json
          check_in_instructions: string
          check_out_instructions: string
          contact_name: string
          contact_phone: string
          emergency_phone: string
          extra_notes: string
          house_rules: string
          id: string
          language: string
          organization_id: string
          property_id: string
          restaurants: Json
          slug: string
          wifi_name: string
          wifi_password: string
        }[]
      }
      is_org_admin: { Args: never; Returns: boolean }
      is_org_staff: { Args: never; Returns: boolean }
      is_super_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      my_org_id: { Args: never; Returns: string }
      property_org_id: { Args: { _property_id: string }; Returns: string }
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
  public: {
    Enums: {},
  },
} as const
