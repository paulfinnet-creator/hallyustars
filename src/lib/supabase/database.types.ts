export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          admin_id: string;
          created_at: string;
          id: number;
          metadata: NonNullable<Json>;
          target_id: string | null;
          target_type: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          admin_id: string;
          created_at?: string;
          id?: never;
          metadata?: NonNullable<Json>;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action?: string;
          admin_id?: string;
          created_at?: string;
          id?: never;
          metadata?: NonNullable<Json>;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      auto_reply_log: {
        Row: {
          address_hash: string;
          replied_at: string;
        };
        ComputedFields: never;
        Insert: {
          address_hash: string;
          replied_at?: string;
        };
        Update: {
          address_hash?: string;
          replied_at?: string;
        };
        Relationships: [];
      };
      blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        ComputedFields: never;
        Insert: {
          blocked_id: string;
          blocker_id?: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey";
            columns: ["blocked_id"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocks_blocked_id_fkey";
            columns: ["blocked_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      celebrity_profile_translations: {
        Row: {
          bio: string;
          is_machine_translated: boolean;
          locale: string;
          profile_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          bio: string;
          is_machine_translated?: boolean;
          locale: string;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          bio?: string;
          is_machine_translated?: boolean;
          locale?: string;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "celebrity_profile_translations_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "celebrity_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      celebrity_profiles: {
        Row: {
          accepts_invites: boolean;
          bio_source_locale: string | null;
          bio_updated_at: string | null;
          category: string;
          created_at: string;
          group_name: string | null;
          id: string;
          languages: unknown[];
          photo_url: string | null;
          search: unknown;
          stage_name: string;
          timezone: string;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          accepts_invites?: boolean;
          bio_source_locale?: string | null;
          bio_updated_at?: string | null;
          category: string;
          created_at?: string;
          group_name?: string | null;
          id?: string;
          languages?: unknown[];
          photo_url?: string | null;
          search?: never;
          stage_name: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          accepts_invites?: boolean;
          bio_source_locale?: string | null;
          bio_updated_at?: string | null;
          category?: string;
          created_at?: string;
          group_name?: string | null;
          id?: string;
          languages?: unknown[];
          photo_url?: string | null;
          search?: never;
          stage_name?: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "celebrity_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "celebrity_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_email_queue: {
        Row: {
          conversation_id: string;
          created_at: string;
          due_at: string;
          job_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          conversation_id: string;
          created_at?: string;
          due_at: string;
          job_id?: string;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          due_at?: string;
          job_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_email_queue_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_email_queue_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_email_queue_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_invitations: {
        Row: {
          celebrity_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by_admin: string | null;
          expires_at: string;
          fan_id: string;
          id: string;
          message: string;
          reason: string | null;
          status: Database["public"]["Enums"]["chat_invitation_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          celebrity_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by_admin?: string | null;
          expires_at?: string;
          fan_id?: string;
          id?: string;
          message: string;
          reason?: string | null;
          status?: Database["public"]["Enums"]["chat_invitation_status"];
          updated_at?: string;
        };
        Update: {
          celebrity_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by_admin?: string | null;
          expires_at?: string;
          fan_id?: string;
          id?: string;
          message?: string;
          reason?: string | null;
          status?: Database["public"]["Enums"]["chat_invitation_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_invitations_celebrity_id_fkey";
            columns: ["celebrity_id"];
            isOneToOne: false;
            referencedRelation: "celebrity_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_invitations_decided_by_admin_fkey";
            columns: ["decided_by_admin"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_invitations_decided_by_admin_fkey";
            columns: ["decided_by_admin"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_invitations_fan_id_fkey";
            columns: ["fan_id"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_invitations_fan_id_fkey";
            columns: ["fan_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_members: {
        Row: {
          conversation_id: string;
          last_read_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          conversation_id: string;
          last_read_at?: string | null;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          last_read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          chat_invitation_id: string;
          closed_at: string | null;
          created_at: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          chat_invitation_id: string;
          closed_at?: string | null;
          created_at?: string;
          id?: string;
        };
        Update: {
          chat_invitation_id?: string;
          closed_at?: string | null;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_chat_invitation_id_fkey";
            columns: ["chat_invitation_id"];
            isOneToOne: true;
            referencedRelation: "chat_invitations";
            referencedColumns: ["id"];
          },
        ];
      };
      email_log: {
        Row: {
          conversation_id: string | null;
          created_at: string;
          id: number;
          message_count: number;
          provider_id: string | null;
          sent_at: string | null;
          status: string;
          type: Database["public"]["Enums"]["email_type"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          conversation_id?: string | null;
          created_at?: string;
          id?: never;
          message_count?: number;
          provider_id?: string | null;
          sent_at?: string | null;
          status: string;
          type: Database["public"]["Enums"]["email_type"];
          user_id: string;
        };
        Update: {
          conversation_id?: string | null;
          created_at?: string;
          id?: never;
          message_count?: number;
          provider_id?: string | null;
          sent_at?: string | null;
          status?: string;
          type?: Database["public"]["Enums"]["email_type"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_log_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_log_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_log_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      invites: {
        Row: {
          code: string;
          created_at: string;
          created_by_admin: string;
          email: string;
          expires_at: string;
          failed_email_attempts: number;
          fan_name: string;
          id: string;
          locked_until: string | null;
          status: Database["public"]["Enums"]["invite_status"];
          updated_at: string;
          used_at: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          code?: string;
          created_at?: string;
          created_by_admin?: string;
          email: string;
          expires_at?: string;
          failed_email_attempts?: number;
          fan_name: string;
          id?: string;
          locked_until?: string | null;
          status?: Database["public"]["Enums"]["invite_status"];
          updated_at?: string;
          used_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by_admin?: string;
          email?: string;
          expires_at?: string;
          failed_email_attempts?: number;
          fan_name?: string;
          id?: string;
          locked_until?: string | null;
          status?: Database["public"]["Enums"]["invite_status"];
          updated_at?: string;
          used_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invites_created_by_admin_fkey";
            columns: ["created_by_admin"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_created_by_admin_fkey";
            columns: ["created_by_admin"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      message_translations: {
        Row: {
          body: string;
          created_at: string;
          detected_locale: string | null;
          locale: string;
          message_id: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          created_at?: string;
          detected_locale?: string | null;
          locale: string;
          message_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          detected_locale?: string | null;
          locale?: string;
          message_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_translations_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          attachments: NonNullable<Json>;
          body: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          flag_reason: string | null;
          flagged: boolean;
          id: string;
          sender_id: string;
        };
        ComputedFields: never;
        Insert: {
          attachments?: NonNullable<Json>;
          body?: string;
          conversation_id: string;
          created_at?: string;
          deleted_at?: string | null;
          flag_reason?: string | null;
          flagged?: boolean;
          id?: string;
          sender_id?: string;
        };
        Update: {
          attachments?: NonNullable<Json>;
          body?: string;
          conversation_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          flag_reason?: string | null;
          flagged?: boolean;
          id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_preferences: {
        Row: {
          chat_emails_enabled: boolean;
          unsubscribe_token: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          chat_emails_enabled?: boolean;
          unsubscribe_token?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          chat_emails_enabled?: boolean;
          unsubscribe_token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_settings: {
        Row: {
          key: string;
          updated_at: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          updated_at?: string;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      reactions: {
        Row: {
          created_at: string;
          emoji: string;
          message_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          emoji: string;
          message_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          emoji?: string;
          message_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reactions_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      registration_drafts: {
        Row: {
          id_document_path: string | null;
          id_document_type:
            Database["public"]["Enums"]["id_document_type"] | null;
          profile_photo_path: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id_document_path?: string | null;
          id_document_type?:
            Database["public"]["Enums"]["id_document_type"] | null;
          profile_photo_path?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          id_document_path?: string | null;
          id_document_type?:
            Database["public"]["Enums"]["id_document_type"] | null;
          profile_photo_path?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "registration_drafts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registration_drafts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          conversation_id: string;
          created_at: string;
          handled_at: string | null;
          handled_by: string | null;
          id: string;
          message_id: string | null;
          reason: string;
          reporter_id: string;
          resolution: string | null;
          status: Database["public"]["Enums"]["report_status"];
        };
        ComputedFields: never;
        Insert: {
          conversation_id: string;
          created_at?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          message_id?: string | null;
          reason: string;
          reporter_id?: string;
          resolution?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          message_id?: string | null;
          reason?: string;
          reporter_id?: string;
          resolution?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
        };
        Relationships: [
          {
            foreignKeyName: "reports_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_handled_by_fkey";
            columns: ["handled_by"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_handled_by_fkey";
            columns: ["handled_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
          locale: string;
          role: Database["public"]["Enums"]["user_role"];
          status: Database["public"]["Enums"]["user_status"];
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          locale?: string;
          role?: Database["public"]["Enums"]["user_role"];
          status?: Database["public"]["Enums"]["user_status"];
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          locale?: string;
          role?: Database["public"]["Enums"]["user_role"];
          status?: Database["public"]["Enums"]["user_status"];
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      verifications: {
        Row: {
          created_at: string;
          decided_at: string | null;
          id: string;
          id_deleted_at: string | null;
          id_document_path: string | null;
          id_document_type:
            Database["public"]["Enums"]["id_document_type"] | null;
          kind: Database["public"]["Enums"]["verification_kind"];
          profile_photo_path: string;
          reason: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["verification_status"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          id_deleted_at?: string | null;
          id_document_path?: string | null;
          id_document_type?:
            Database["public"]["Enums"]["id_document_type"] | null;
          kind?: Database["public"]["Enums"]["verification_kind"];
          profile_photo_path: string;
          reason?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["verification_status"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          id_deleted_at?: string | null;
          id_document_path?: string | null;
          id_document_type?:
            Database["public"]["Enums"]["id_document_type"] | null;
          kind?: Database["public"]["Enums"]["verification_kind"];
          profile_photo_path?: string;
          reason?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["verification_status"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "verifications_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "verifications_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "verifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "verifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      user_public: {
        Row: {
          avatar_url: string | null;
          display_name: string | null;
          id: string | null;
          is_verified: boolean | null;
          role: Database["public"]["Enums"]["user_role"] | null;
          timezone: string | null;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          display_name?: string | null;
          id?: string | null;
          is_verified?: never;
          role?: Database["public"]["Enums"]["user_role"] | null;
          timezone?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          display_name?: string | null;
          id?: string | null;
          is_verified?: never;
          role?: Database["public"]["Enums"]["user_role"] | null;
          timezone?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      admin_analytics: { Args: Record<PropertyKey, never>; Returns: Json };
      admin_close_conversation: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      admin_create_invite: {
        Args: { p_email: string; p_fan_name: string };
        Returns: {
          code: string;
          expires_at: string;
          id: string;
        }[];
      };
      admin_decide_chat_invitation: {
        Args: {
          p_approve: boolean;
          p_invitation_id: string;
          p_reason?: string;
        };
        Returns: string;
      };
      admin_decide_verification: {
        Args: {
          p_approve: boolean;
          p_avatar_url?: string;
          p_reason?: string;
          p_verification_id: string;
        };
        Returns: undefined;
      };
      admin_get_user_email: { Args: { p_user_id: string }; Returns: string };
      admin_handle_report: {
        Args: {
          p_report_id: string;
          p_resolution?: string;
          p_status: Database["public"]["Enums"]["report_status"];
        };
        Returns: undefined;
      };
      admin_link_new_celebrity_account: {
        Args: { p_profile_id: string; p_user_id: string };
        Returns: undefined;
      };
      admin_list_admins: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          display_name: string;
          has_authenticator: boolean;
          id: string;
          status: Database["public"]["Enums"]["user_status"];
        }[];
      };
      admin_log_conversation_view: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      admin_log_id_view: {
        Args: { p_verification_id: string };
        Returns: undefined;
      };
      admin_record_admin_created: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      admin_record_mfa_reset: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      admin_regenerate_invite_code: {
        Args: { p_invite_id: string };
        Returns: {
          code: string;
          expires_at: string;
        }[];
      };
      admin_remove_message: {
        Args: { p_message_id: string; p_reason?: string };
        Returns: undefined;
      };
      admin_revoke_invite: {
        Args: { p_invite_id: string };
        Returns: undefined;
      };
      admin_set_admin_access: {
        Args: { p_active: boolean; p_user_id: string };
        Returns: undefined;
      };
      admin_set_user_suspended: {
        Args: { p_suspended: boolean; p_user_id: string };
        Returns: undefined;
      };
      admin_update_setting: {
        Args: { p_key: string; p_value: number };
        Returns: undefined;
      };
      chat_email_check: {
        Args: {
          p_conversation_id: string;
          p_job_id: string;
          p_throttle?: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      chat_email_enqueue: {
        Args: {
          p_conversation_id: string;
          p_delay_seconds: number;
          p_sender_id: string;
        };
        Returns: {
          due_at: string;
          job_id: string;
          user_id: string;
        }[];
      };
      claim_auto_reply: { Args: { p_address_hash: string }; Returns: boolean };
      cleanup_abandon_registration: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      cleanup_due_id_documents: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          id_document_path: string;
        }[];
      };
      cleanup_due_registrations: {
        Args: { p_limit?: number };
        Returns: {
          user_id: string;
        }[];
      };
      cleanup_mark_id_deleted: {
        Args: { p_verification_id: string };
        Returns: undefined;
      };
      hit_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number };
        Returns: boolean;
      };
      mark_conversation_read: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      my_conversations: {
        Args: Record<PropertyKey, never>;
        Returns: {
          closed_at: string;
          conversation_id: string;
          created_at: string;
          last_at: string;
          last_body: string;
          last_has_image: boolean;
          last_sender: string;
          other_avatar: string;
          other_id: string;
          other_name: string;
          other_timezone: string;
          other_verified: boolean;
          unread: number;
        }[];
      };
      my_photo_change: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          decided_at: string;
          reason: string;
          status: Database["public"]["Enums"]["verification_status"];
        }[];
      };
      my_session_active: { Args: Record<PropertyKey, never>; Returns: boolean };
      my_verification: {
        Args: Record<PropertyKey, never>;
        Returns: {
          decided_at: string;
          kind: Database["public"]["Enums"]["verification_kind"];
          reason: string;
          status: Database["public"]["Enums"]["verification_status"];
        }[];
      };
      normalize_invite_code: { Args: { p_input: string }; Returns: string };
      photo_change_submit: {
        Args: { p_photo_path: string; p_user_id: string };
        Returns: string;
      };
      post_chat_image: {
        Args: {
          p_conversation_id: string;
          p_height: number;
          p_path: string;
          p_width: number;
        };
        Returns: {
          attachments: NonNullable<Json>;
          body: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          flag_reason: string | null;
          flagged: boolean;
          id: string;
          sender_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "messages";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      registration_check_code: { Args: { p_code: string }; Returns: string };
      registration_check_email: {
        Args: { p_code: string; p_email: string };
        Returns: {
          fan_name: string;
          invite_id: string;
          result: string;
          user_id: string;
        }[];
      };
      registration_link_user: {
        Args: { p_invite_id: string; p_user_id: string };
        Returns: boolean;
      };
      registration_submit: { Args: { p_user_id: string }; Returns: undefined };
      send_chat_invitation: {
        Args: { p_celebrity_id: string; p_message: string };
        Returns: string;
      };
      send_message: {
        Args: { p_body: string; p_conversation_id: string };
        Returns: Json;
      };
      unsubscribe_chat_emails: { Args: { p_token: string }; Returns: boolean };
    };
    Enums: {
      chat_invitation_status:
        "pending" | "approved" | "rejected" | "withdrawn" | "expired";
      email_type:
        "chat_message" | "invitation_approved" | "invitation_rejected";
      id_document_type: "passport" | "national_id" | "drivers_license";
      invite_status:
        | "created"
        | "registering"
        | "pending_review"
        | "approved"
        | "rejected"
        | "expired"
        | "revoked";
      report_status: "open" | "resolved" | "dismissed";
      user_role: "admin" | "celebrity" | "fan";
      user_status:
        | "registering"
        | "pending_review"
        | "approved"
        | "rejected"
        | "suspended";
      verification_kind: "registration" | "profile_photo_change";
      verification_status: "pending" | "approved" | "rejected";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

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
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
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
  public: {
    Enums: {
      chat_invitation_status: [
        "pending",
        "approved",
        "rejected",
        "withdrawn",
        "expired",
      ],
      email_type: [
        "chat_message",
        "invitation_approved",
        "invitation_rejected",
      ],
      id_document_type: ["passport", "national_id", "drivers_license"],
      invite_status: [
        "created",
        "registering",
        "pending_review",
        "approved",
        "rejected",
        "expired",
        "revoked",
      ],
      report_status: ["open", "resolved", "dismissed"],
      user_role: ["admin", "celebrity", "fan"],
      user_status: [
        "registering",
        "pending_review",
        "approved",
        "rejected",
        "suspended",
      ],
      verification_kind: ["registration", "profile_photo_change"],
      verification_status: ["pending", "approved", "rejected"],
    },
  },
} as const;
