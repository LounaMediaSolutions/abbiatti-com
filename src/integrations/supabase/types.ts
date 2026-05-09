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
      ad_banners: {
        Row: {
          active: boolean
          created_at: string
          cta_label: string | null
          cta_url: string | null
          end_date: string
          id: string
          image_url: string | null
          organization_id: string
          partner_id: string | null
          placement: Database["public"]["Enums"]["ad_placement"]
          priority: number
          start_date: string
          subtitle: string | null
          title: string
          updated_at: string
          visible_to_guest: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          end_date: string
          id?: string
          image_url?: string | null
          organization_id: string
          partner_id?: string | null
          placement: Database["public"]["Enums"]["ad_placement"]
          priority?: number
          start_date?: string
          subtitle?: string | null
          title: string
          updated_at?: string
          visible_to_guest?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          end_date?: string
          id?: string
          image_url?: string | null
          organization_id?: string
          partner_id?: string | null
          placement?: Database["public"]["Enums"]["ad_placement"]
          priority?: number
          start_date?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
          visible_to_guest?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ad_banners_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_services"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_impressions: {
        Row: {
          banner_id: string
          guest_account_id: string | null
          id: string
          organization_id: string
          placement: Database["public"]["Enums"]["ad_placement"]
          session_key: string | null
          viewed_at: string
        }
        Insert: {
          banner_id: string
          guest_account_id?: string | null
          id?: string
          organization_id: string
          placement: Database["public"]["Enums"]["ad_placement"]
          session_key?: string | null
          viewed_at?: string
        }
        Update: {
          banner_id?: string
          guest_account_id?: string | null
          id?: string
          organization_id?: string
          placement?: Database["public"]["Enums"]["ad_placement"]
          session_key?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_impressions_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "ad_banners"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_requests: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          guests_count: number | null
          id: string
          message: string | null
          organization_id: string
          property_id: string | null
          status: Database["public"]["Enums"]["booking_request_status"]
          updated_at: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          guests_count?: number | null
          id?: string
          message?: string | null
          organization_id: string
          property_id?: string | null
          status?: Database["public"]["Enums"]["booking_request_status"]
          updated_at?: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          guests_count?: number | null
          id?: string
          message?: string | null
          organization_id?: string
          property_id?: string | null
          status?: Database["public"]["Enums"]["booking_request_status"]
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          claimed_at: string
          code: string
          coupon_id: string
          created_at: string
          guest_account_id: string
          id: string
          organization_id: string
          partner_id: string
          redeemed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string
          code: string
          coupon_id: string
          created_at?: string
          guest_account_id: string
          id?: string
          organization_id: string
          partner_id: string
          redeemed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string
          code?: string
          coupon_id?: string
          created_at?: string
          guest_account_id?: string
          id?: string
          organization_id?: string
          partner_id?: string
          redeemed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "partner_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_guest_account_id_fkey"
            columns: ["guest_account_id"]
            isOneToOne: false
            referencedRelation: "guest_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_services"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          delete_after: string | null
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
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delete_after?: string | null
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
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delete_after?: string | null
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
          user_id?: string
        }
        Relationships: []
      }
      guest_albums: {
        Row: {
          error: string | null
          format: string
          generated_at: string
          guest_account_id: string
          id: string
          organization_id: string
          photos_count: number
          storage_path: string
        }
        Insert: {
          error?: string | null
          format?: string
          generated_at?: string
          guest_account_id: string
          id?: string
          organization_id: string
          photos_count?: number
          storage_path: string
        }
        Update: {
          error?: string | null
          format?: string
          generated_at?: string
          guest_account_id?: string
          id?: string
          organization_id?: string
          photos_count?: number
          storage_path?: string
        }
        Relationships: []
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
        Relationships: []
      }
      guest_messages: {
        Row: {
          body: string
          created_at: string
          guest_account_id: string
          id: string
          organization_id: string
          read_at: string | null
          sender_id: string
          sender_role: string
        }
        Insert: {
          body: string
          created_at?: string
          guest_account_id: string
          id?: string
          organization_id: string
          read_at?: string | null
          sender_id: string
          sender_role: string
        }
        Update: {
          body?: string
          created_at?: string
          guest_account_id?: string
          id?: string
          organization_id?: string
          read_at?: string | null
          sender_id?: string
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
        ]
      }
      guest_uploads: {
        Row: {
          comment: string | null
          created_at: string
          guest_account_id: string
          id: string
          marketing_use_allowed: boolean
          organization_id: string
          rating: number | null
          storage_path: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          guest_account_id: string
          id?: string
          marketing_use_allowed?: boolean
          organization_id: string
          rating?: number | null
          storage_path?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          guest_account_id?: string
          id?: string
          marketing_use_allowed?: boolean
          organization_id?: string
          rating?: number | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_uploads_guest_account_id_fkey"
            columns: ["guest_account_id"]
            isOneToOne: false
            referencedRelation: "guest_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: Database["public"]["Enums"]["inventory_category"]
          created_at: string
          id: string
          low_stock_threshold: number
          name: string
          notes: string | null
          organization_id: string
          property_id: string
          quantity: number
          unit: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["inventory_category"]
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name: string
          notes?: string | null
          organization_id: string
          property_id: string
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["inventory_category"]
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name?: string
          notes?: string | null
          organization_id?: string
          property_id?: string
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string
          id: string
          item_id: string
          organization_id: string
          quantity: number
          reason: string | null
          task_id: string | null
          type: Database["public"]["Enums"]["inventory_movement_type"]
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          item_id: string
          organization_id: string
          quantity: number
          reason?: string | null
          task_id?: string | null
          type: Database["public"]["Enums"]["inventory_movement_type"]
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          item_id?: string
          organization_id?: string
          quantity?: number
          reason?: string | null
          task_id?: string | null
          type?: Database["public"]["Enums"]["inventory_movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          currency: string
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string
          line_items: Json
          notes: string | null
          organization_id: string
          paid_at: string | null
          pdf_url: string | null
          period_month: number
          period_year: number
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          line_items?: Json
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          pdf_url?: string | null
          period_month: number
          period_year: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          line_items?: Json
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          pdf_url?: string | null
          period_month?: number
          period_year?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      maintenance_tickets: {
        Row: {
          category: Database["public"]["Enums"]["ticket_category"]
          created_at: string
          description: string | null
          id: string
          internal_notes: string | null
          organization_id: string
          photo_url: string | null
          priority: number
          property_id: string
          reporter_language: string | null
          reporter_name: string | null
          reporter_phone: string | null
          reservation_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          title: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          description?: string | null
          id?: string
          internal_notes?: string | null
          organization_id: string
          photo_url?: string | null
          priority?: number
          property_id: string
          reporter_language?: string | null
          reporter_name?: string | null
          reporter_phone?: string | null
          reservation_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          description?: string | null
          id?: string
          internal_notes?: string | null
          organization_id?: string
          photo_url?: string | null
          priority?: number
          property_id?: string
          reporter_language?: string | null
          reporter_name?: string | null
          reporter_phone?: string | null
          reservation_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          body_ar: string
          body_en: string
          body_fr: string
          created_at: string
          icon: string | null
          id: string
          is_default: boolean
          key: string
          label: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          body_ar?: string
          body_en?: string
          body_fr?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          key: string
          label: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          body_ar?: string
          body_en?: string
          body_fr?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          key?: string
          label?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          organization_id: string
          read_at: string | null
          recipient_id: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          organization_id: string
          read_at?: string | null
          recipient_id: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          organization_id?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          billing_currency: string
          brand_color: string | null
          created_at: string
          id: string
          logo_url: string | null
          max_cohosts: number
          max_employees: number
          name: string
          price_monthly_base: number
          price_per_admin: number
          price_per_cohost: number
          price_per_employee: number
          price_per_ical_sync: number
          price_per_mb_storage: number
          price_per_message: number
          show_on_website: boolean
          slug: string | null
          suspended: boolean
          trial_ends_at: string
          updated_at: string
          website_contact_email: string | null
          website_contact_phone: string | null
          website_tagline: string | null
        }
        Insert: {
          billing_currency?: string
          brand_color?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          max_cohosts?: number
          max_employees?: number
          name: string
          price_monthly_base?: number
          price_per_admin?: number
          price_per_cohost?: number
          price_per_employee?: number
          price_per_ical_sync?: number
          price_per_mb_storage?: number
          price_per_message?: number
          show_on_website?: boolean
          slug?: string | null
          suspended?: boolean
          trial_ends_at?: string
          updated_at?: string
          website_contact_email?: string | null
          website_contact_phone?: string | null
          website_tagline?: string | null
        }
        Update: {
          billing_currency?: string
          brand_color?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          max_cohosts?: number
          max_employees?: number
          name?: string
          price_monthly_base?: number
          price_per_admin?: number
          price_per_cohost?: number
          price_per_employee?: number
          price_per_ical_sync?: number
          price_per_mb_storage?: number
          price_per_message?: number
          show_on_website?: boolean
          slug?: string | null
          suspended?: boolean
          trial_ends_at?: string
          updated_at?: string
          website_contact_email?: string | null
          website_contact_phone?: string | null
          website_tagline?: string | null
        }
        Relationships: []
      }
      partner_coupons: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          discount_label: string
          id: string
          organization_id: string
          partner_id: string
          terms: string | null
          title: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          visible_to_guest: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          discount_label: string
          id?: string
          organization_id: string
          partner_id: string
          terms?: string | null
          title: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          visible_to_guest?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          discount_label?: string
          id?: string
          organization_id?: string
          partner_id?: string
          terms?: string | null
          title?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          visible_to_guest?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "partner_coupons_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_services"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_services: {
        Row: {
          active: boolean
          category: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          organization_id: string
          price: string | null
          sort_order: number
          subscription_active: boolean
          subscription_until: string | null
          tier: Database["public"]["Enums"]["partner_tier"]
          updated_at: string
          visible_to_guest: boolean
          website_url: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          organization_id: string
          price?: string | null
          sort_order?: number
          subscription_active?: boolean
          subscription_until?: string | null
          tier?: Database["public"]["Enums"]["partner_tier"]
          updated_at?: string
          visible_to_guest?: boolean
          website_url?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          active?: boolean
          category?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          organization_id?: string
          price?: string | null
          sort_order?: number
          subscription_active?: boolean
          subscription_until?: string | null
          tier?: Database["public"]["Enums"]["partner_tier"]
          updated_at?: string
          visible_to_guest?: boolean
          website_url?: string | null
          whatsapp_phone?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          language: string
          organization_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          language?: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          language?: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          access_code: string | null
          address: string | null
          apartment_number: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          bathrooms: number | null
          bedrooms: number | null
          building_name: string | null
          categories: string[]
          city: string | null
          country: string | null
          cover_image_url: string | null
          created_at: string
          entry_instructions: string | null
          floor: string | null
          id: string
          listing_platforms: string[] | null
          max_guests: number | null
          name: string
          notes: string | null
          organization_id: string
          postal_code: string | null
          price_per_night: number | null
          property_type: string
          public_description: string | null
          qr_token: string | null
          region: string | null
          rejection_reason: string | null
          show_on_website: boolean
          status: string
          street_name: string | null
          street_number: string | null
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          access_code?: string | null
          address?: string | null
          apartment_number?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          building_name?: string | null
          categories?: string[]
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string
          entry_instructions?: string | null
          floor?: string | null
          id?: string
          listing_platforms?: string[] | null
          max_guests?: number | null
          name: string
          notes?: string | null
          organization_id: string
          postal_code?: string | null
          price_per_night?: number | null
          property_type?: string
          public_description?: string | null
          qr_token?: string | null
          region?: string | null
          rejection_reason?: string | null
          show_on_website?: boolean
          status?: string
          street_name?: string | null
          street_number?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          access_code?: string | null
          address?: string | null
          apartment_number?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          building_name?: string | null
          categories?: string[]
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string
          entry_instructions?: string | null
          floor?: string | null
          id?: string
          listing_platforms?: string[] | null
          max_guests?: number | null
          name?: string
          notes?: string | null
          organization_id?: string
          postal_code?: string | null
          price_per_night?: number | null
          property_type?: string
          public_description?: string | null
          qr_token?: string | null
          region?: string | null
          rejection_reason?: string | null
          show_on_website?: boolean
          status?: string
          street_name?: string | null
          street_number?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      property_approval_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          id: string
          organization_id: string
          property_id: string
          reason: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          id?: string
          organization_id: string
          property_id: string
          reason?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          id?: string
          organization_id?: string
          property_id?: string
          reason?: string | null
        }
        Relationships: []
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
          organization_id: string
          property_id: string
          source: Database["public"]["Enums"]["reservation_source"]
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
          organization_id: string
          property_id: string
          source?: Database["public"]["Enums"]["reservation_source"]
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
          organization_id?: string
          property_id?: string
          source?: Database["public"]["Enums"]["reservation_source"]
          updated_at?: string
        }
        Relationships: []
      }
      property_members: {
        Row: {
          assigned_by: string
          created_at: string
          id: string
          organization_id: string
          property_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          id?: string
          organization_id: string
          property_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          id?: string
          organization_id?: string
          property_id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
          {
            foreignKeyName: "property_members_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_items: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["rental_category"]
          created_at: string
          deposit: number | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          price_day: number | null
          price_stay: number | null
          price_week: number | null
          priority: number
          purchase_cost: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: Database["public"]["Enums"]["rental_category"]
          created_at?: string
          deposit?: number | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          price_day?: number | null
          price_stay?: number | null
          price_week?: number | null
          priority?: number
          purchase_cost?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["rental_category"]
          created_at?: string
          deposit?: number | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          price_day?: number | null
          price_stay?: number | null
          price_week?: number | null
          priority?: number
          purchase_cost?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      reservation_rentals: {
        Row: {
          created_at: string
          delivered_at: string | null
          delivered_by: string | null
          id: string
          notes: string | null
          organization_id: string
          quantity: number
          rental_item_id: string
          reservation_id: string
          returned_at: string | null
          returned_by: string | null
          signature_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          quantity?: number
          rental_item_id: string
          reservation_id: string
          returned_at?: string | null
          returned_by?: string | null
          signature_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          quantity?: number
          rental_item_id?: string
          reservation_id?: string
          returned_at?: string | null
          returned_by?: string | null
          signature_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          amount: number | null
          check_in: string
          check_out: string
          created_at: string
          currency: string | null
          expected_arrival_time: string | null
          external_code: string | null
          external_id: string | null
          guest_language: string | null
          guest_name: string | null
          guest_phone: string | null
          guest_slug: string | null
          guests_count: number | null
          id: string
          last_sync_at: string | null
          messages_sent: Json | null
          notes: string | null
          organization_id: string
          property_id: string
          source: Database["public"]["Enums"]["reservation_source"]
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
        }
        Insert: {
          amount?: number | null
          check_in: string
          check_out: string
          created_at?: string
          currency?: string | null
          expected_arrival_time?: string | null
          external_code?: string | null
          external_id?: string | null
          guest_language?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          guest_slug?: string | null
          guests_count?: number | null
          id?: string
          last_sync_at?: string | null
          messages_sent?: Json | null
          notes?: string | null
          organization_id: string
          property_id: string
          source?: Database["public"]["Enums"]["reservation_source"]
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
        }
        Update: {
          amount?: number | null
          check_in?: string
          check_out?: string
          created_at?: string
          currency?: string | null
          expected_arrival_time?: string | null
          external_code?: string | null
          external_id?: string | null
          guest_language?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          guest_slug?: string | null
          guests_count?: number | null
          id?: string
          last_sync_at?: string | null
          messages_sent?: Json | null
          notes?: string | null
          organization_id?: string
          property_id?: string
          source?: Database["public"]["Enums"]["reservation_source"]
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
        }
        Relationships: []
      }
      task_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["task_photo_kind"]
          organization_id: string
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["task_photo_kind"]
          organization_id: string
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["task_photo_kind"]
          organization_id?: string
          storage_path?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_photos_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          due_at: string | null
          guest_comment: string | null
          guest_name: string | null
          guest_rating: number | null
          id: string
          issue_description: string | null
          organization_id: string
          priority: number
          property_id: string | null
          staff_notes: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          due_at?: string | null
          guest_comment?: string | null
          guest_name?: string | null
          guest_rating?: number | null
          id?: string
          issue_description?: string | null
          organization_id: string
          priority?: number
          property_id?: string | null
          staff_notes?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_at?: string | null
          guest_comment?: string | null
          guest_name?: string | null
          guest_rating?: number | null
          id?: string
          issue_description?: string | null
          organization_id?: string
          priority?: number
          property_id?: string | null
          staff_notes?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_properties: {
        Row: {
          bathrooms: number | null
          bedrooms: number | null
          categories: string[] | null
          city: string | null
          country: string | null
          cover_image_url: string | null
          id: string | null
          max_guests: number | null
          name: string | null
          organization_id: string | null
          price_per_night: number | null
          property_type: string | null
          public_description: string | null
          region: string | null
          show_on_website: boolean | null
        }
        Insert: {
          bathrooms?: number | null
          bedrooms?: number | null
          categories?: string[] | null
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          id?: string | null
          max_guests?: number | null
          name?: string | null
          organization_id?: string | null
          price_per_night?: number | null
          property_type?: string | null
          public_description?: string | null
          region?: string | null
          show_on_website?: boolean | null
        }
        Update: {
          bathrooms?: number | null
          bedrooms?: number | null
          categories?: string[] | null
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          id?: string | null
          max_guests?: number | null
          name?: string | null
          organization_id?: string | null
          price_per_night?: number | null
          property_type?: string | null
          public_description?: string | null
          region?: string | null
          show_on_website?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_manage_property: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      count_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: number
      }
      get_public_guest_book: {
        Args: { _slug: string }
        Returns: {
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
        }[]
        SetofOptions: {
          from: "*"
          to: "guest_books"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_reservation_book: {
        Args: { _slug: string }
        Returns: {
          check_in: string
          check_out: string
          guest_book: Json
          guest_name: string
          guests_count: number
          organization_id: string
          property_city: string
          property_cover: string
          property_id: string
          property_name: string
          reservation_id: string
        }[]
      }
      get_user_org: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_co_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_locked: { Args: { _org_id: string }; Returns: boolean }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_property_cohost: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      start_task_with_qr: {
        Args: { _qr_token: string; _task_id: string }
        Returns: boolean
      }
    }
    Enums: {
      ad_placement:
        | "guest_hero"
        | "guest_inline"
        | "public_book"
        | "welcome_footer"
      app_role:
        | "admin"
        | "cohost"
        | "staff"
        | "cleaner"
        | "driver"
        | "decorator"
        | "maintenance"
        | "super_admin"
        | "technician"
        | "developer"
        | "accountant"
        | "support"
        | "guest"
        | "co_admin"
      booking_request_status:
        | "new"
        | "contacted"
        | "confirmed"
        | "declined"
        | "closed"
      inventory_category:
        | "linen"
        | "cleaning"
        | "consumable"
        | "equipment"
        | "other"
      inventory_movement_type: "in" | "out" | "adjustment"
      partner_tier: "gold" | "silver" | "standard"
      rental_category:
        | "baby"
        | "beach"
        | "tech"
        | "mobility"
        | "outdoor"
        | "service"
        | "other"
      reservation_source:
        | "airbnb"
        | "booking"
        | "vrbo"
        | "abritel"
        | "direct"
        | "manual"
        | "other"
      reservation_status:
        | "pending"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "blocked"
      task_photo_kind: "before" | "during" | "after" | "issue"
      task_status: "todo" | "in_progress" | "done" | "issue"
      task_type:
        | "cleaning"
        | "driving"
        | "decoration"
        | "maintenance"
        | "laundry"
        | "checkin"
        | "checkout"
        | "shopping"
        | "other"
        | "transfer"
        | "delivery"
      ticket_category:
        | "plumbing"
        | "electrical"
        | "appliance"
        | "cleanliness"
        | "wifi"
        | "noise"
        | "other"
      ticket_status: "new" | "in_progress" | "resolved" | "closed"
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
      ad_placement: [
        "guest_hero",
        "guest_inline",
        "public_book",
        "welcome_footer",
      ],
      app_role: [
        "admin",
        "cohost",
        "staff",
        "cleaner",
        "driver",
        "decorator",
        "maintenance",
        "super_admin",
        "technician",
        "developer",
        "accountant",
        "support",
        "guest",
        "co_admin",
      ],
      booking_request_status: [
        "new",
        "contacted",
        "confirmed",
        "declined",
        "closed",
      ],
      inventory_category: [
        "linen",
        "cleaning",
        "consumable",
        "equipment",
        "other",
      ],
      inventory_movement_type: ["in", "out", "adjustment"],
      partner_tier: ["gold", "silver", "standard"],
      rental_category: [
        "baby",
        "beach",
        "tech",
        "mobility",
        "outdoor",
        "service",
        "other",
      ],
      reservation_source: [
        "airbnb",
        "booking",
        "vrbo",
        "abritel",
        "direct",
        "manual",
        "other",
      ],
      reservation_status: [
        "pending",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "blocked",
      ],
      task_photo_kind: ["before", "during", "after", "issue"],
      task_status: ["todo", "in_progress", "done", "issue"],
      task_type: [
        "cleaning",
        "driving",
        "decoration",
        "maintenance",
        "laundry",
        "checkin",
        "checkout",
        "shopping",
        "other",
        "transfer",
        "delivery",
      ],
      ticket_category: [
        "plumbing",
        "electrical",
        "appliance",
        "cleanliness",
        "wifi",
        "noise",
        "other",
      ],
      ticket_status: ["new", "in_progress", "resolved", "closed"],
    },
  },
} as const
