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
      attachments: {
        Row: {
          claim_id: string | null
          id: string
          inbound_item_id: string | null
          order_id: string | null
          type: Database["public"]["Enums"]["attachment_type"]
          uploaded_at: string
          uploaded_by: string
          url: string
        }
        Insert: {
          claim_id?: string | null
          id?: string
          inbound_item_id?: string | null
          order_id?: string | null
          type?: Database["public"]["Enums"]["attachment_type"]
          uploaded_at?: string
          uploaded_by: string
          url: string
        }
        Update: {
          claim_id?: string | null
          id?: string
          inbound_item_id?: string | null
          order_id?: string | null
          type?: Database["public"]["Enums"]["attachment_type"]
          uploaded_at?: string
          uploaded_by?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bindings: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          runner_id: string
          salesperson_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          id?: string
          runner_id: string
          salesperson_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          runner_id?: string
          salesperson_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bindings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bindings_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bindings_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cancel_reasons: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          reason: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          reason: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          reason?: string
        }
        Relationships: []
      }
      claim_batch_items: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          order_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          order_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "claim_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_batch_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_batches: {
        Row: {
          admin_ack_at: string | null
          admin_ack_by: string | null
          id: string
          note: string | null
          runner_id: string
          status: Database["public"]["Enums"]["claim_batch_status"]
          submitted_at: string
          total_amount: number
        }
        Insert: {
          admin_ack_at?: string | null
          admin_ack_by?: string | null
          id?: string
          note?: string | null
          runner_id: string
          status?: Database["public"]["Enums"]["claim_batch_status"]
          submitted_at?: string
          total_amount?: number
        }
        Update: {
          admin_ack_at?: string | null
          admin_ack_by?: string | null
          id?: string
          note?: string | null
          runner_id?: string
          status?: Database["public"]["Enums"]["claim_batch_status"]
          submitted_at?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "claim_batches_admin_ack_by_fkey"
            columns: ["admin_ack_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_batches_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          delivery_fee: number | null
          gross_amount: number | null
          id: string
          method: Database["public"]["Enums"]["claim_method"] | null
          net_claim_amount: number | null
          note: string | null
          order_id: string
          proof_url: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          delivery_fee?: number | null
          gross_amount?: number | null
          id?: string
          method?: Database["public"]["Enums"]["claim_method"] | null
          net_claim_amount?: number | null
          note?: string | null
          order_id: string
          proof_url?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          delivery_fee?: number | null
          gross_amount?: number | null
          id?: string
          method?: Database["public"]["Enums"]["claim_method"] | null
          net_claim_amount?: number | null
          note?: string | null
          order_id?: string
          proof_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_task_snapshots: {
        Row: {
          created_at: string | null
          id: string
          metrics: Json
          owner_user_id: string
          role: string
          snapshot_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metrics?: Json
          owner_user_id: string
          role: string
          snapshot_date: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metrics?: Json
          owner_user_id?: string
          role?: string
          snapshot_date?: string
        }
        Relationships: []
      }
      delivery_charges: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          area: string
          charge_amount: number
          created_at: string
          id: string
          proposed_by: string
          rejection_remark: string | null
          runner_id: string
          status: Database["public"]["Enums"]["delivery_charge_status"]
          superseded_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          area: string
          charge_amount: number
          created_at?: string
          id?: string
          proposed_by: string
          rejection_remark?: string | null
          runner_id: string
          status?: Database["public"]["Enums"]["delivery_charge_status"]
          superseded_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          area?: string
          charge_amount?: number
          created_at?: string
          id?: string
          proposed_by?: string
          rejection_remark?: string | null
          runner_id?: string
          status?: Database["public"]["Enums"]["delivery_charge_status"]
          superseded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_charges_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_charges_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_charges_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          created_at: string
          driver_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          recorded_at: string
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          driver_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          driver_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_pickup_items: {
        Row: {
          created_at: string
          id: string
          pickup_id: string
          product_id: string
          qty: number
          suggested_qty: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          pickup_id: string
          product_id: string
          qty: number
          suggested_qty?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          pickup_id?: string
          product_id?: string
          qty?: number
          suggested_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_pickup_items_pickup_id_fkey"
            columns: ["pickup_id"]
            isOneToOne: false
            referencedRelation: "driver_pickups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_pickup_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_pickups: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          driver_id: string
          id: string
          notes: string | null
          pickup_date: string
          runner_id: string
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          driver_id: string
          id?: string
          notes?: string | null
          pickup_date?: string
          runner_id: string
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          notes?: string | null
          pickup_date?: string
          runner_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_pickups_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_pickups_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_return_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          qty: number
          return_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          qty: number
          return_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          qty?: number
          return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "driver_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_returns: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          driver_id: string
          id: string
          notes: string | null
          related_pickup_id: string | null
          runner_id: string
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          driver_id: string
          id?: string
          notes?: string | null
          related_pickup_id?: string | null
          runner_id: string
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          notes?: string | null
          related_pickup_id?: string | null
          runner_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_returns_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_returns_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_returns_related_pickup_id_fkey"
            columns: ["related_pickup_id"]
            isOneToOne: false
            referencedRelation: "driver_pickups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_returns_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expected_date_history: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          new_date: string | null
          old_date: string | null
          order_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          new_date?: string | null
          old_date?: string | null
          order_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          new_date?: string | null
          old_date?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expected_date_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expected_date_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_reasons: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          reason: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          reason: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          reason?: string
        }
        Relationships: []
      }
      feature_settings: {
        Row: {
          created_at: string
          id: string
          scope_id: string | null
          scope_type: string
          setting_key: string
          updated_at: string
          value_boolean: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          scope_id?: string | null
          scope_type: string
          setting_key: string
          updated_at?: string
          value_boolean?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          scope_id?: string | null
          scope_type?: string
          setting_key?: string
          updated_at?: string
          value_boolean?: boolean | null
        }
        Relationships: []
      }
      group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          member_user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          member_user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          member_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "manager_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_member_user_id_fkey"
            columns: ["member_user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_items: {
        Row: {
          created_at: string
          id: string
          inbound_id: string
          photo_url: string
          product_id: string | null
          qty_acknowledged: number | null
          qty_reported: number
          temp_sku_label: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          inbound_id: string
          photo_url: string
          product_id?: string | null
          qty_acknowledged?: number | null
          qty_reported: number
          temp_sku_label?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          inbound_id?: string
          photo_url?: string
          product_id?: string | null
          qty_acknowledged?: number | null
          qty_reported?: number
          temp_sku_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_items_inbound_id_fkey"
            columns: ["inbound_id"]
            isOneToOne: false
            referencedRelation: "inbound_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_shipments: {
        Row: {
          arrival_date: string
          created_at: string
          id: string
          notes: string | null
          runner_id: string
          salesperson_id: string
          status: Database["public"]["Enums"]["inbound_status"]
          tracking_no: string
        }
        Insert: {
          arrival_date?: string
          created_at?: string
          id?: string
          notes?: string | null
          runner_id: string
          salesperson_id: string
          status?: Database["public"]["Enums"]["inbound_status"]
          tracking_no: string
        }
        Update: {
          arrival_date?: string
          created_at?: string
          id?: string
          notes?: string | null
          runner_id?: string
          salesperson_id?: string
          status?: Database["public"]["Enums"]["inbound_status"]
          tracking_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_shipments_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_shipments_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_groups: {
        Row: {
          created_at: string
          id: string
          manager_user_id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_user_id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_user_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_groups_manager_user_id_fkey"
            columns: ["manager_user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_type: string | null
          id: string
          is_read: boolean
          message: string
          priority: string | null
          recipient_role: string | null
          reference_id: string | null
          reference_type: string | null
          status_from: string | null
          status_to: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message: string
          priority?: string | null
          recipient_role?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status_from?: string | null
          status_to?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string
          priority?: string | null
          recipient_role?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status_from?: string | null
          status_to?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          notes: string | null
          order_id: string
          price: number
          product_id: string | null
          qty: number
          sku_label: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          notes?: string | null
          order_id: string
          price?: number
          product_id?: string | null
          qty?: number
          sku_label?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          notes?: string | null
          order_id?: string
          price?: number
          product_id?: string | null
          qty?: number
          sku_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: string
          area: string | null
          cancel_notes: string | null
          cancel_reason: string | null
          channel: string | null
          created_at: string
          customer_name: string
          delivered_at: string | null
          dispute_notes: string | null
          dispute_reason: string | null
          driver_delivered_at: string | null
          driver_failed_reason: string | null
          driver_failed_remark: string | null
          driver_id: string | null
          driver_next_delivery_date: string | null
          driver_status: string | null
          expected_pickup_date: string | null
          failed_next_step:
            | Database["public"]["Enums"]["failed_next_step"]
            | null
          failed_reason: string | null
          failed_remark: string | null
          fulfillment_warehouse_id: string | null
          id: string
          next_delivery_date: string | null
          notes: string | null
          order_code: string
          order_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          phone: string
          reconciliation_status: Database["public"]["Enums"]["reconciliation_status"]
          runner_accept_status: string | null
          runner_id: string | null
          runner_status: Database["public"]["Enums"]["runner_status"]
          salesperson_id: string
          status: Database["public"]["Enums"]["order_status"]
          stock_deducted: boolean
          total_amount: number
          total_qty: number
          updated_at: string
        }
        Insert: {
          address: string
          area?: string | null
          cancel_notes?: string | null
          cancel_reason?: string | null
          channel?: string | null
          created_at?: string
          customer_name: string
          delivered_at?: string | null
          dispute_notes?: string | null
          dispute_reason?: string | null
          driver_delivered_at?: string | null
          driver_failed_reason?: string | null
          driver_failed_remark?: string | null
          driver_id?: string | null
          driver_next_delivery_date?: string | null
          driver_status?: string | null
          expected_pickup_date?: string | null
          failed_next_step?:
            | Database["public"]["Enums"]["failed_next_step"]
            | null
          failed_reason?: string | null
          failed_remark?: string | null
          fulfillment_warehouse_id?: string | null
          id?: string
          next_delivery_date?: string | null
          notes?: string | null
          order_code: string
          order_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          phone: string
          reconciliation_status?: Database["public"]["Enums"]["reconciliation_status"]
          runner_accept_status?: string | null
          runner_id?: string | null
          runner_status?: Database["public"]["Enums"]["runner_status"]
          salesperson_id: string
          status?: Database["public"]["Enums"]["order_status"]
          stock_deducted?: boolean
          total_amount?: number
          total_qty?: number
          updated_at?: string
        }
        Update: {
          address?: string
          area?: string | null
          cancel_notes?: string | null
          cancel_reason?: string | null
          channel?: string | null
          created_at?: string
          customer_name?: string
          delivered_at?: string | null
          dispute_notes?: string | null
          dispute_reason?: string | null
          driver_delivered_at?: string | null
          driver_failed_reason?: string | null
          driver_failed_remark?: string | null
          driver_id?: string | null
          driver_next_delivery_date?: string | null
          driver_status?: string | null
          expected_pickup_date?: string | null
          failed_next_step?:
            | Database["public"]["Enums"]["failed_next_step"]
            | null
          failed_reason?: string | null
          failed_remark?: string | null
          fulfillment_warehouse_id?: string | null
          id?: string
          next_delivery_date?: string | null
          notes?: string | null
          order_code?: string
          order_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          phone?: string
          reconciliation_status?: Database["public"]["Enums"]["reconciliation_status"]
          runner_accept_status?: string | null
          runner_id?: string | null
          runner_status?: Database["public"]["Enums"]["runner_status"]
          salesperson_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          stock_deducted?: boolean
          total_amount?: number
          total_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_fulfillment_warehouse_id_fkey"
            columns: ["fulfillment_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          owner_user_id: string
          sku_code: string | null
          sku_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          owner_user_id: string
          sku_code?: string | null
          sku_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          owner_user_id?: string
          sku_code?: string | null
          sku_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          driver_code: string | null
          email: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          runner_code: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          driver_code?: string | null
          email: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          runner_code?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          driver_code?: string | null
          email?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          runner_code?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      reasons: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          label: string
          reason_type: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          label: string
          reason_type: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          label?: string
          reason_type?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "reasons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      runner_drivers: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          is_active: boolean
          runner_id: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          is_active?: boolean
          runner_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          is_active?: boolean
          runner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runner_drivers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runner_drivers_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string
          id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          product_id: string
          qty_change: number
          reference_id: string | null
          reference_type: Database["public"]["Enums"]["reference_type"]
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          product_id: string
          qty_change: number
          reference_id?: string | null
          reference_type: Database["public"]["Enums"]["reference_type"]
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          product_id?: string
          qty_change?: number
          reference_id?: string | null
          reference_type?: Database["public"]["Enums"]["reference_type"]
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          qty: number
          transfer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          qty: number
          transfer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          qty?: number
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string
          created_by: string
          from_owner_id: string
          from_warehouse_id: string
          id: string
          notes: string | null
          to_owner_id: string
          to_warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          from_owner_id: string
          from_warehouse_id: string
          id?: string
          notes?: string | null
          to_owner_id: string
          to_warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          from_owner_id?: string
          from_warehouse_id?: string
          id?: string
          notes?: string | null
          to_owner_id?: string
          to_warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_owner_id_fkey"
            columns: ["from_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_owner_id_fkey"
            columns: ["to_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_visibility_overrides: {
        Row: {
          can_view: boolean
          created_at: string
          created_by: string
          id: string
          owner_user_id: string
          viewer_user_id: string
        }
        Insert: {
          can_view?: boolean
          created_at?: string
          created_by: string
          id?: string
          owner_user_id: string
          viewer_user_id: string
        }
        Update: {
          can_view?: boolean
          created_at?: string
          created_by?: string
          id?: string
          owner_user_id?: string
          viewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_visibility_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_visibility_overrides_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_visibility_overrides_viewer_user_id_fkey"
            columns: ["viewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_directory: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      user_notification_settings: {
        Row: {
          created_at: string | null
          digest_time_local: string | null
          email_enabled: boolean | null
          in_app_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          digest_time_local?: string | null
          email_enabled?: boolean | null
          in_app_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          digest_time_local?: string | null
          email_enabled?: boolean | null
          in_app_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          owner_user_id: string
          warehouse_type: Database["public"]["Enums"]["warehouse_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          owner_user_id: string
          warehouse_type: Database["public"]["Enums"]["warehouse_type"]
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          owner_user_id?: string
          warehouse_type?: Database["public"]["Enums"]["warehouse_type"]
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      driver_allocated_stock: {
        Row: {
          allocated_qty: number | null
          delivered_qty: number | null
          driver_id: string | null
          pending_qty: number | null
          product_id: string | null
          sku_code: string | null
          sku_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_latest_location: {
        Row: {
          accuracy: number | null
          driver_id: string | null
          driver_name: string | null
          heading: number | null
          id: string | null
          latitude: number | null
          longitude: number | null
          recorded_at: string | null
          speed: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_monthly_ranking: {
        Row: {
          delivered_count: number | null
          driver_id: string | null
          driver_name: string | null
          failed_count: number | null
          month: string | null
          rank_in_team: number | null
          runner_id: string | null
          runner_name: string | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runner_drivers_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_balance_view: {
        Row: {
          balance_qty: number | null
          last_movement_time: string | null
          owner_name: string | null
          owner_user_id: string | null
          product_id: string | null
          sku_code: string | null
          sku_name: string | null
          warehouse_id: string | null
          warehouse_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_view_stock: {
        Args: { owner_id: string; viewer_id: string }
        Returns: boolean
      }
      generate_driver_code: { Args: { p_driver_id: string }; Returns: Json }
      get_delivery_charge: {
        Args: { p_area: string; p_runner_id: string }
        Returns: number
      }
      get_driver_blocking_orders: {
        Args: { p_driver_id: string }
        Returns: {
          customer_name: string
          driver_status: string
          order_code: string
          order_date: string
          order_id: string
        }[]
      }
      get_driver_parent_runner: {
        Args: { p_driver_id: string }
        Returns: string
      }
      get_stock_balance: {
        Args: never
        Returns: {
          balance_qty: number
          last_movement_time: string
          owner_name: string
          owner_user_id: string
          product_id: string
          sku_code: string
          sku_name: string
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_driver_of_runner: {
        Args: { p_driver_id: string; p_runner_id: string }
        Returns: boolean
      }
      is_ranking_visible_for_driver: {
        Args: { p_driver_id: string }
        Returns: boolean
      }
      link_driver_to_runner_by_code: { Args: { p_code: string }; Returns: Json }
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "salesperson"
        | "runner"
        | "driver"
        | "user"
      attachment_type:
        | "transfer_proof"
        | "receipt_photo"
        | "chat_screenshot"
        | "delivery_photo"
        | "inbound_photo"
        | "other"
      claim_batch_status: "ADMIN_ACK_PENDING" | "CLAIMED"
      claim_method: "TRANSFER" | "CASH" | "OTHER"
      delivery_charge_status: "PENDING" | "APPROVED" | "REJECTED"
      failed_next_step: "RESCHEDULE" | "SALESPERSON_CONTACT"
      inbound_status: "PENDING_SP_ACK" | "ACKNOWLEDGED" | "DISPUTE"
      movement_type:
        | "INBOUND"
        | "SALE_DEDUCT"
        | "ADJUSTMENT"
        | "RETURN"
        | "TRANSFER_OUT"
        | "TRANSFER_IN"
        | "DRIVER_ALLOCATE_PREDEDUCT"
        | "DRIVER_RETURN"
      order_status: "BOOKING" | "READY" | "CANCELLED"
      payment_method: "COD" | "TRANSFER"
      reconciliation_status:
        | "NOT_CLAIMED"
        | "CLAIMED"
        | "SP_ACK_PENDING"
        | "ADMIN_ACK_PENDING"
        | "SETTLED"
        | "DISPUTE"
      reference_type: "INBOUND_ITEM" | "ORDER_ITEM" | "MANUAL"
      runner_status:
        | "UNASSIGNED"
        | "ASSIGNED"
        | "TAKEN"
        | "DELIVERED"
        | "FAILED_DELIVERY"
      warehouse_type: "SALESPERSON" | "RUNNER"
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
      app_role: ["admin", "manager", "salesperson", "runner", "driver", "user"],
      attachment_type: [
        "transfer_proof",
        "receipt_photo",
        "chat_screenshot",
        "delivery_photo",
        "inbound_photo",
        "other",
      ],
      claim_batch_status: ["ADMIN_ACK_PENDING", "CLAIMED"],
      claim_method: ["TRANSFER", "CASH", "OTHER"],
      delivery_charge_status: ["PENDING", "APPROVED", "REJECTED"],
      failed_next_step: ["RESCHEDULE", "SALESPERSON_CONTACT"],
      inbound_status: ["PENDING_SP_ACK", "ACKNOWLEDGED", "DISPUTE"],
      movement_type: [
        "INBOUND",
        "SALE_DEDUCT",
        "ADJUSTMENT",
        "RETURN",
        "TRANSFER_OUT",
        "TRANSFER_IN",
        "DRIVER_ALLOCATE_PREDEDUCT",
        "DRIVER_RETURN",
      ],
      order_status: ["BOOKING", "READY", "CANCELLED"],
      payment_method: ["COD", "TRANSFER"],
      reconciliation_status: [
        "NOT_CLAIMED",
        "CLAIMED",
        "SP_ACK_PENDING",
        "ADMIN_ACK_PENDING",
        "SETTLED",
        "DISPUTE",
      ],
      reference_type: ["INBOUND_ITEM", "ORDER_ITEM", "MANUAL"],
      runner_status: [
        "UNASSIGNED",
        "ASSIGNED",
        "TAKEN",
        "DELIVERED",
        "FAILED_DELIVERY",
      ],
      warehouse_type: ["SALESPERSON", "RUNNER"],
    },
  },
} as const
